#!/usr/bin/env node
/**
 * 租户上下文跨线程守卫
 * =====================
 * 背景（2026-10-09NotifyTask 异步化时建立）：
 *   NotifyTask 从「调度线程内 for 循环同步发 HTTP」改成「提交到 TenantAwareExecutor
 *   异步投递」。而 TenantContext底层是**裸ThreadLocal**，
 *   **不跨线程**、也没有 TransmittableThreadLocal 之类的传递机制。
 *
 *   于是有一个极其安静的失效形态：
 *     调度线程里TenantContext.setTenantId(t) → 提交异步任务 → 子线程读到 null
 *     → MyBatis-Plus 租户插件按兜底值拼 tenant_id = -1
 *     → 所有查询恒空
 *     → **任务在跑、日志在打、一条通知都不发**，且不抛任何异常。
 *   这是本项目历史上真发生过的故障（见 NotifyTask 类注释），
 *   异步化之后它的触发窗口从"忘了写"扩大到"写在了错误的线程"。
 *
 * 因此校验两条铁律：
 *   ① NotifyTask **不得**直接调用 TenantContext.setTenantId / clear
 *      —— 那些调用必须发生在工作线程，即 TenantAwareExecutor 内。
 *   ② TenantAwareExecutor 必须同时具备 setTenantId 与 finally clear
 *      —— 只 set 不 clear 会让线程复用时把数据算到上一个租户头上（跨租户泄露），
//         只 clear 不 set 则上面那条恒空故障照旧。
 *
 * 跳过：SKIP_TENANT_XT=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NOTIFY_TASK = 'api/src/main/java/com/reservation/task/NotifyTask.java';
const EXECUTOR = 'api/src/main/java/com/reservation/task/TenantAwareExecutor.java';
const MONITOR_TASK = 'api/src/main/java/com/reservation/task/MonitorTask.java';

const problems = [];
const notes = [];

if (process.env.SKIP_TENANT_XT === '1') {
  console.log('[tenant-xt] SKIP_TENANT_XT=1，跳过租户上下文跨线程守卫');
  process.exit(0);
}

/** 去掉块注释与行注释，只留真实代码（注释里提到 TenantContext 是正常的） */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${rel}：文件不存在。`);
    return null;
  }
  return fs.readFileSync(abs, 'utf8');
}

// ============================================================ ① NotifyTask 不得直接设上下文
{
  const raw = read(NOTIFY_TASK);
  if (raw) {
    const code = codeOnly(raw);
    const directSet = /TenantContext\s*\.\s*setTenantId\s*\(/.test(code);
    const directClear = /TenantContext\s*\.\s*clear\s*\(/.test(code);

    if (directSet) {
      problems.push(
        `${NOTIFY_TASK}：调度线程里仍直接调用 TenantContext.setTenantId()。\n` +
        `    → 本类的 @Scheduled 方法跑在调度线程，而异步投递跑在 TenantAwareExecutor 的工作线程。\n` +
        `      ThreadLocal 不跨线程，子线程读到 null → 租户插件兜底 tenant_id = -1 → 恒空。\n` +
        `    → 症状：任务在跑、日志在打、一条通知不发，**且不报错**。\n` +
        `    → 修法：删掉这里的 setTenantId/clear，让 TenantAwareExecutor 在工作线程内负责。`
      );
    } else {
      notes.push(`${NOTIFY_TASK}：未在调度线程直接设置租户上下文 ✓`);
    }

    if (directClear) {
      // clear 单独存在通常意味着"只清了没设"或"遗留代码"，同样可疑
      problems.push(
        `${NOTIFY_TASK}：出现 TenantContext.clear() 但没有配对的 setTenantId —— 多半是异步化改造的残留。\n` +
        `    → 上下文的设置与清理现在统一由 TenantAwareExecutor 在工作线程内完成。`
      );
    }

    // 必须真的用上了异步执行器，否则说明改造没落地（守卫防的是"以为改了"）
    if (!/tenantAwareExecutor\s*\.\s*submit/.test(code)) {
      problems.push(
        `${NOTIFY_TASK}：没有调用 tenantAwareExecutor.submitXxx(...) —— 异步化改造未落地。\n` +
        `    → 若是有意回退成同步循环，请连同本守卫一起撤掉，别留一条骗人的配置。`
      );
    } else {
      notes.push(`${NOTIFY_TASK}：已提交到 TenantAwareExecutor ✓`);
    }
  }
}

// ============================================================ ② TenantAwareExecutor 必须 set + finally clear
{
  const raw = read(EXECUTOR);
  if (raw) {
    const code = codeOnly(raw);

    if (!/TenantContext\s*\.\s*setTenantId\s*\(/.test(code)) {
      problems.push(
        `${EXECUTOR}：工作线程里没有 setTenantId。\n` +
        `    → 异步任务里 TenantContext.getTenantId() 返回 null，租户插件兜底 -1，查询恒空。`
      );
    } else {
      notes.push(`${EXECUTOR}：工作线程内 setTenantId ✓`);
    }

    // clear 必须在 finally 里：只 clear 不放 finally 等于没有
    const hasFinally = /finally\s*\{[\s\S]*?TenantContext\s*\.\s*clear\s*\(\s*\)/.test(code);
    const hasClear = /TenantContext\s*\.\s*clear\s*\(\s*\)/.test(code);
    if (!hasClear) {
      problems.push(
        `${EXECUTOR}：没有 clear() —— 线程复用时残留的租户会让下一个任务把数据算到上一个租户头上。\n` +
        `    → 这是**跨租户数据泄露**，比恒空故障严重得多。`
      );
    } else if (!hasFinally) {
      problems.push(
        `${EXECUTOR}：clear() 不在 finally 块里。\n` +
        `    → 任务体抛异常时 clear 不会执行，租户上下文残留在被复用的线程上。`
      );
    } else {
      notes.push(`${EXECUTOR}：clear() 在 finally 中 ✓`);
    }
  }
}

// ============================================================ ③ MonitorTask 仍是同步 —— 它必须自带上下文
// MonitorTask 没有异步化，它的 TenantContext 调用是**正确的**（在调度线程里 set/clear）。
// 但要确认它没被误改成异步，否则会踩与NotifyTask 相同的坑。
{
  const raw = read(MONITOR_TASK);
  if (raw) {
    const code = codeOnly(raw);
    const usesAsync = /tenantAwareExecutor|TenantAwareExecutor|@Async|CompletableFuture|submitForTenant/.test(code);
    const setsContext = /TenantContext\s*\.\s*setTenantId\s*\(/.test(code);

    if (usesAsync && !setsContext) {
      problems.push(
        `${MONITOR_TASK}：检测到异步提交但本类没有 setTenantId。\n` +
        `    → 与 NotifyTask 同一个坑：异步任务里拿不到租户上下文，查询恒空。`
      );
    } else if (!usesAsync && setsContext) {
      notes.push(`${MONITOR_TASK}：保持同步 + 自管上下文（当前形态，正确）✓`);
    } else if (!usesAsync && !setsContext) {
      notes.push(`${MONITOR_TASK}：未涉及租户上下文 ✓`);
    }
  }
}

// ============================================================ ④ 全局：不得引入 TransmittableThreadLocal 而不同步设值
// 若有人为"让上下文跨线程"引入 TTL/TaskDecorator，必须同时改set 点；
// 否则 TTL 依赖 InheritableThreadLocal 只在**创建线程**时复制一次，
// 对**复用**的池化线程无效 —— 那是最容易误以为"已经解决了"的写法。
{
  const taskDir = path.join(ROOT, 'api/src/main/java/com/reservation/task');
  if (fs.existsSync(taskDir)) {
    for (const f of fs.readdirSync(taskDir).filter((x) => x.endsWith('.java'))) {
      const rel = 'api/src/main/java/com/reservation/task/' + f;
      const raw = fs.readFileSync(path.join(taskDir, f), 'utf8');
      const code = codeOnly(raw);
      const ttl = /TransmittableThreadLocal|InheritableThreadLocal/.test(code);
      const taskDecorator = /TaskDecorator/.test(code);
      if (ttl || taskDecorator) {
        problems.push(
          `${rel}：引入了 ${ttl ? 'TTL/InheritableThreadLocal' : 'TaskDecorator'} 试图跨线程传递上下文。\n` +
          `    → InheritableThreadLocal 只在**线程创建**时复制一次；池化线程被复用后完全不生效，\n` +
          `      而这恰恰是定时任务线程池的场景 —— 会得到"改了没变化"的假象。\n` +
          `    → 本项目采用的方案是显式「提交时带租户 id、工作线程内 set/finally clear」，不依赖隐式传递。\n` +
          `    → 若确需引入，必须同时改造所有 setTenantId 调用点，否则更危险（看起来解决了实际没有）。`
        );
      }
    }
    notes.push('api/.../task/ 下未引入隐式上下文传递机制 ✓');
  }
}

if (problems.length) {
  console.error(`✗ 租户上下文跨线程配置存在 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  process.exit(1);
}

console.log('✓ 租户上下文跨线程配置正常');
for (const n of notes) console.log('  · ' + n);
process.exit(0);