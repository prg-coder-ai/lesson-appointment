#!/usr/bin/env node
/**
 * 调度线程池守卫
 * ==============
 * 背景（2026-10-09 发现）：
 *   Spring Boot 的 TaskSchedulingAutoConfiguration 默认 pool.size = 1。
 *   本项目 8 个 @Scheduled 共用这唯一一条线程，其中 NotifyTask 每 60s逐租户遍历
 *   并对 message-service 做**同步 HTTP**（耗时取决于外部响应），MonitorTask 每60s
 *   读 CPU/内存/磁盘（磁盘 IO 忙时变慢）。
 *   单线程下这些耗时串行累加 —— 指标采样一卡，**上课提醒被整体推迟**。
 *   而上课提醒是 4 档 × 每分钟轮询的高频业务。
 *
 * 为什么需要守卫：
 *   把 pool.size 改回 1（或整段删掉）**不会报错、不会启动失败**，
 *   只是悄悄退回到"指标采样拖慢上课提醒"的状态 —— review 时极难察觉。
 *   这是典型的"配置型回归"，只能靠守卫拦。
 *
 * 校验项：
 *   1. api与 message-service 的 pool.size 必须显式 > 1
 *   2.必须显式声明（不能依赖默认值）
 *   3. thread-name-prefix 必须显式声明（jstack 排障靠它区分任务线程与业务线程）
 *   4. api 必须开启优雅停机（否则发版会砍掉正在跑的NotifyTask 那一轮）
 *   5. ★ 若服务自己声明了 TaskScheduler Bean，其中必须有一个**名为 taskScheduler**，
 *      且它必须显式开启优雅停机 —— 否则上面 1~3 条全部静默失效（2026-11-20 实测事故）
 *
 * 为什么第 5 条最重要（它防的是"配置看起来对、实际没生效"）：
 *   Spring Boot 的 TaskSchedulingAutoConfiguration 里那个 taskScheduler Bean 带
 *   @ConditionalOnMissingBean(TaskScheduler.class)。只要业务方自己声明**任意**一个
 *   TaskScheduler（本项目是 AsyncConfig#callbackRetryScheduler），自动装配就整体退让；
 *   随后 ScheduledAnnotationBeanPostProcessor 按「先按名找 taskScheduler、找不到再按类型找唯一」
 *   解析，于是 9 个 @Scheduled 全落到那个自建池上。
 *   实测形态：pool.size=8 只存在于 properties 里，实际只有 2 条线程（回调重试池），
 *   日志线程名一律 cb-retry-N，回调 HTTP 超时（3s/8s）直接拖住对账与掉线判定。
 *   **整个过程不报错、不告警**，只有翻日志线程名才看得出，属于纯配置型回归 → 只能靠守卫拦。
 *
 * 跳过：SKIP_SCHEDULER=1
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..');

/** 每个服务：配置文件 → 该服务实际有多少个 @Scheduled（用于说明必要性） */
const TARGETS = [
  {
    label: 'booking-api',
    rel: 'api/src/main/resources/application.properties',
    srcRel: 'api/src/main/java',
    minSize: 2,
    mustShutdown: true,
    why: '8 个 @Scheduled（含逐租户同步 HTTP 的 NotifyTask）',
  },
  {
    label: 'message-service',
    rel: 'api/message-service/src/main/resources/application.properties',
    srcRel: 'api/message-service/src/main/java',
    minSize: 2,
    mustShutdown: false,
    why: '当前无 @Scheduled，但Spring SSE 心跳/清理类任务随时会加；留位避免到时候再踩单线程坑',
  },
  {
    // 2026-11-20 补：此前漏了这个服务，而它恰恰是"配置被 Bean 架空"的受害者
    label: 'classroom-service',
    rel: 'api/classroom-service/src/main/resources/application.properties',
    srcRel: 'api/classroom-service/src/main/java',
    minSize: 2,
    mustShutdown: false,   // 优雅停机由 AsyncConfig#taskScheduler 代码里开，见校验项 5
    why: '9 个 @Scheduled（2 个对账 + 7 个课堂生命周期扫描器，周期 20/30/40 秒）',
  },
];

/** 去掉 properties 注释，避免注释里的示例值被误读成真实配置 */
function stripComments(src) {
  return src
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf('#');
      // 只在 # 不处于引号内时截断；本文件无含 # 的值，故直接截断
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join('\n');
}

function readProp(clean, key) {
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(.*)$', 'm');
  const m = clean.match(re);
  return m ? m[1].trim() : null;
}

/** 递归收集某个 src/main/java 下的全部 .java */
function walkJava(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJava(p, out);
    else if (e.name.endsWith('.java')) out.push(p);
  }
  return out;
}

/** 去掉 Java 注释，避免文档注释里的示例 @Bean(...) 被当成真实声明 */
function stripJavaComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * 截取 taskScheduler 方法所在片段：从方法签名到**下一个 @Bean 声明**。
 *
 * <p>为什么不能直接在整文件里搜 setWaitForTasksToCompleteOnShutdown(true)：
 * 同一个 AsyncConfig 里 callbackExecutor 也调了这一句（Executor 用同一个 API），
 * 整文件搜索会把「taskScheduler 忘了开优雅停机」掩盖成绿 —— 这正是本仓库反复踩的
 * "守卫看起来在检查、其实查的是别处"的失效模式。
 *
 * <p>找不到签名时返回空串而不是整文件：让第 5 条判红。宁可误报一次（人工确认签名形态），
 * 也不要因为认不出写法而静默放行。
 */
function schedulerMethodSegment(src) {
  const i = src.search(/public\s+[\w.$]*TaskScheduler\s+taskScheduler\s*\(/);
  if (i < 0) return '';
  const j = src.indexOf('@Bean', i);
  return src.slice(i, j < 0 ? src.length : j);
}

/**
 * 收集「返回类型含 TaskScheduler」的 @Bean 名称 → 所在文件。
 *
 * <p>跨行匹配：注解与方法是两行（`@Bean("x")` 换行 `public TaskScheduler x()`），
 * 所以中间用 `[\s\S]{0,300}?` 而不是 `\s*`。300 是刻意收窄的上界 ——
 * 放开会跨过整个方法体误匹配到下一个 @Bean。
 */
function collectSchedulerBeans(srcDir) {
  const byName = new Map();
  if (!srcDir || !fs.existsSync(srcDir)) return byName;
  const re = /@Bean\s*\(\s*(?:value\s*=\s*)?"([^"]+)"\s*\)[\s\S]{0,300}?(?:public|protected|private)\s+([\w.$\[\]<>, ]+?)\s+[A-Za-z_]\w*\s*\(/g;
  for (const f of walkJava(srcDir)) {
    const src = stripJavaComments(fs.readFileSync(f, 'utf8'));
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (/\bTaskScheduler\b/.test(m[2])) byName.set(m[1], f);
    }
  }
  return byName;
}

const problems = [];
const notes = [];

if (process.env.SKIP_SCHEDULER === '1') {
  console.log('[scheduler] SKIP_SCHEDULER=1，跳过调度线程池守卫');
  process.exit(0);
}

for (const t of TARGETS) {
  const abs = path.join(ROOT, t.rel);
  if (!fs.existsSync(abs)) {
    problems.push(`${t.rel}：文件不存在，无法校验调度线程池配置。`);
    continue;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const clean = stripComments(raw);

  // --- 1) pool.size 必须显式声明 ---
  const sizeStr = readProp(clean, 'spring.task.scheduling.pool.size');
  if (sizeStr === null) {
    problems.push(
      `${t.rel}：缺少 spring.task.scheduling.pool.size。\n` +
      `    → 不配等于用Spring Boot 默认值 **1**，即单线程调度（${t.why}）。\n` +
      `    → 单线程下任一任务耗时都会推迟其余任务，且**不报任何错**。\n` +
      `    → 修法：加上 spring.task.scheduling.pool.size=4 与 thread-name-prefix=sched-。`
    );
    continue;
  }

  // --- 2) 值必须 > 1 ---
  const size = Number(sizeStr);
  if (!Number.isInteger(size)) {
    problems.push(`${t.rel}：spring.task.scheduling.pool.size="${sizeStr}" 不是整数。`);
  } else if (size <= 1) {
    problems.push(
      `${t.rel}：spring.task.scheduling.pool.size=${size}（${t.why} 仍是单线程）。\n` +
      `    → 值写成 1 与不写等价：退回到"任一任务卡住就推迟上课提醒"的状态，且不报错。\n` +
      `    → 若确认本服务任务都很轻，把下方 why 的理由一并改掉，不要留一条骗人的配置。`
    );
  } else {
    notes.push(`${t.rel}：pool.size=${size}（${t.why}）✓`);
  }

  // --- 3) thread-name-prefix 必须显式声明 ---
  const prefix = readProp(clean, 'spring.task.scheduling.thread-name-prefix');
  if (prefix === null) {
    problems.push(
      `${t.rel}：缺少 spring.task.scheduling.thread-name-prefix。\n` +
      `    → 默认线程名是 "scheduling-1"，与 Tomcat/业务线程混在一起；\n` +
      `      jstack 抓到线程时无法快速判断"这是定时任务还是处理用户请求的"。\n` +
      `    → 修法：spring.task.scheduling.thread-name-prefix=sched-`
    );
  } else if (!prefix.trim()) {
    problems.push(`${t.rel}：thread-name-prefix 值为空，等同于没配。`);
  } else {
    notes.push(`${t.rel}：thread-name-prefix="${prefix}"✓`);
  }

  // --- 4) 优雅停机（仅 api 要求）---
  if (t.mustShutdown) {
    const awaitTerm = readProp(clean, 'spring.task.scheduling.shutdown.await-termination');
    if (awaitTerm !== 'true') {
      problems.push(
        `${t.rel}：未开启 spring.task.scheduling.shutdown.await-termination=true。\n` +
        `    → systemctl stop / 发版重启会**硬砍**正在执行的那一轮 NotifyTask：\n` +
        `      已发的记了流水、没发的没记录，通知状态出现不一致。`
      );
    } else {
      notes.push(`${t.rel}：优雅停机已开启 ✓`);
    }
  }

  // --- 5) ★ 自建 TaskScheduler 必须叫 taskScheduler，否则上面 1~3 条全白配 ---
  {
    const srcDir = t.srcRel ? path.join(ROOT, t.srcRel) : null;
    const beans = collectSchedulerBeans(srcDir);
    if (beans.size === 0) {
      // 没有自建池 → @Scheduled 走 Boot 自动装配那个，properties 正常生效，无需额外要求
      notes.push(`${t.label}：未自建 TaskScheduler，@Scheduled 使用 Boot 自动装配池 ✓`);
    } else if (!beans.has('taskScheduler')) {
      problems.push(
        `${t.rel}：本服务声明了 TaskScheduler Bean（${[...beans.keys()].join(', ')}），` +
        `但没有一个是 **taskScheduler**。\n` +
        `    → Boot 的 TaskSchedulingAutoConfiguration 是 @ConditionalOnMissingBean(TaskScheduler.class)：\n` +
        `      已存在任何一个 TaskScheduler，它就不再创建默认的 taskScheduler。\n` +
        `    → 于是 ScheduledAnnotationBeanPostProcessor 按类型命中你这一个，\n` +
        `      全部 @Scheduled 挤进它的线程池，上面 pool.size / thread-name-prefix **静默失效**\n` +
        `      （2026-11-20 实测：pool.size=8 实际只有 2 线程，日志线程名 cb-retry-N）。\n` +
        `    → 修法：另加一个 @Bean("taskScheduler") ThreadPoolTaskScheduler 承接全部 @Scheduled，\n` +
        `      自建的那个用 @Qualifier 精确注入（见 api/classroom-service AsyncConfig.java）。`
      );
    } else {
      const f = beans.get('taskScheduler');
      const src = stripJavaComments(fs.readFileSync(f, 'utf8'));
      const seg = schedulerMethodSegment(src);
      // properties 的 spring.task.scheduling.shutdown.* 只被 Boot 自动装配那个 Bean 读取，
      // 自建 Bean 必须自己开，否则停机时正在跑的一轮被硬砍（扫描器扫到一半）。
      if (!seg) {
        problems.push(
          `${path.relative(ROOT, f)}：找到了名为 taskScheduler 的 Bean，但认不出它的方法签名。\n` +
          `    → 守卫按 "public [任意前缀]TaskScheduler taskScheduler(" 定位方法体；\n` +
          `      若你把返回类型改成别的写法（如返回自建的包装类），请同步更新本守卫。`
        );
      } else if (!/setWaitForTasksToCompleteOnShutdown\s*\(\s*true\s*\)/.test(seg)) {
        problems.push(
          `${path.relative(ROOT, f)}：自建的 taskScheduler 未调用 setWaitForTasksToCompleteOnShutdown(true)。\n` +
          `    → 注意 properties 里的 spring.task.scheduling.shutdown.await-termination 对**自建 Bean 无效**\n` +
          `      （那是 TaskSchedulingAutoConfiguration 的 Bean 才读的属性），配了也不会生效。\n` +
          `    → 停机/发版会硬砍正在执行的那一轮扫描器，留下半截状态。`
        );
      } else {
        notes.push(`${t.label}：taskScheduler 已显式声明且开启优雅停机 ✓`);
      }
      if (beans.size > 1) {
        notes.push(`${t.label}：共 ${beans.size} 个 TaskScheduler（${[...beans.keys()].join(', ')}），@Scheduled 走 taskScheduler ✓`);
      }
    }
  }
}

// --- 交叉校验：两个服务的日志目录不能相同（否则两个进程写同一文件，滚动互相踩）---
const logPaths = [];
for (const t of TARGETS) {
  const abs = path.join(ROOT, t.rel);
  if (!fs.existsSync(abs)) continue;
  const clean = stripComments(fs.readFileSync(abs, 'utf8'));
  // LOG_PATH 通常在 env 模板里而非 properties；这里只提示不判错
  const p = readProp(clean, 'logging.file.path');
  if (p) logPaths.push({ label: t.label, p });
}
if (logPaths.length > 1) {
  const dup = logPaths.filter((x, i) => logPaths.findIndex((y) => y.p === x.p) !== i);
  for (const d of dup) {
    problems.push(
      `${d.label}：logging.file.path 与其他服务相同（${d.p}）。\n` +
      `    → 两个进程写同一文件，logback 与 logrotate 会互相踩（fd 指向已重命名的 inode）。`
    );
  }
}

if (problems.length) {
  console.error(`✗ 调度线程池配置存在 ${problems.length} 处问题：\n`);
  for (const p of problems) console.error('  · ' + p + '\n');
  process.exit(1);
}

console.log('✓ 调度线程池配置正常');
for (const n of notes) console.log('  · ' + n);
process.exit(0);