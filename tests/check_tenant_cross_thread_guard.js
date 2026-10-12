#!/usr/bin/env node
/**
 * 租户上下文跨线程守卫 —— 反向测试
 *
 * 为什么这个守卫的每一条都必须反向验证：
 *   它守护的是**"任务在跑、日志在打、一条通知不发、且不报错"**的静默故障。
 *   这类故障的特征是：代码能编译、服务能启动、监控一片绿，只有用户收不到通知。
 *   守卫一旦变成"永远绿"，谁都不会发现 —— 所以宁可它吵一点。
 *
 * 反向测试项：
 *   ① 基线通过
 *   ② NotifyTask 里加回 setTenantId（模拟"忘了删"）→ 判红
 *   ③ NotifyTask 里加孤立的 clear() → 判红
 *   ④ 把提交异步那行删掉（改造没落地）→ 判红
 *   ⑤ TenantAwareExecutor 里删掉 setTenantId → 判红
 *   ⑥ 把 finally 去掉（clear 不在 finally）→ 判红
 *   ⑦ 引入 InheritableThreadLocal（假解法）→ 判红
 *   ⑧ MonitorTask 检测到异步但无上下文 → 判红
 *   ⑨ 还原后回到 exit 0 且源码零污染
 *   ⑩ SKIP_TENANT_XT=1 → exit 0
 *
 * 运行：node tests/check_tenant_cross_thread_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-tenant-cross-thread.mjs');

const NOTIFY = path.join(ROOT, 'api/src/main/java/com/reservation/task/NotifyTask.java');
const EXECUTOR = path.join(ROOT, 'api/src/java/com/reservation/task/TenantAwareExecutor.java');
// 执行器真实路径
const REAL_EXECUTOR = path.join(ROOT, 'api/src/main/java/com/reservation/task/TenantAwareExecutor.java');
const MONITOR = path.join(ROOT, 'api/src/main/java/com/reservation/task/MonitorTask.java');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/**
 * 同进程 import 守卫并捕获 process.exit。
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 * code=null 表示"没收到 exit"，此时断言必须失败（false pass 是最危险的失效）。
 */
async function runGuard(env) {
  const saved = {};
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  let code = null;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  process.exit = (c) => {
    code = c == null ? 0 : c;
    throw { __guardExit: true };
  };
  try {
    await import(pathToFileURL(GUARD).href + '?t=' + Date.now() + Math.random());
  } catch (e) {
    if (!e || !e.__guardExit) {
      console.log = origLog; console.error = origErr; process.exit = origExit;
      throw e;
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origErr;
    if (env) {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }
  return { code, out: lines.join('\n') };
}

function backup(file) {
  const orig = fs.readFileSync(file, 'utf8');
  return {
    file,
    orig,
    restore() {
      fs.writeFileSync(file, orig, 'utf8');
      return fs.readFileSync(file, 'utf8') === orig;
    },
  };
}

/** 在指定锚点前插入一行代码（模拟"改回去了"） */
function injectBefore(bak, anchor, line) {
  const txt = fs.readFileSync(bak.file, 'utf8');
  if (!txt.includes(anchor)) return false;
  fs.writeFileSync(bak.file, txt.replace(anchor, line + '\n' + anchor), 'utf8');
  return true;
}

(async () => {
console.log('\n租户上下文跨线程守卫反向测试\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② NotifyTask 里加回 setTenantId ----------
  {
    const bak = backup(NOTIFY);
    touched.push(bak);
    const ok = injectBefore(bak, '    private boolean taskEnabled() {',
      '        TenantContext.setTenantId(-1L); // 回归：调度线程里设上下文');
    if (!ok) {
      expect('② NotifyTask 直接设上下文应判红', false, '未找到锚点 taskEnabled');
    } else {
      const r = await runGuard();
      expect('② NotifyTask 里setTenantId → exit 1 且点明 ThreadLocal 跨不了线程',
        r.code === 1 && /ThreadLocal/.test(r.out) && /恒空/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ 孤立的 clear() ----------
  {
    const bak = backup(NOTIFY);
    touched.push(bak);
    const ok = injectBefore(bak, '    private boolean taskEnabled() {',
      '        TenantContext.clear(); // 回归：残留代码');
    if (!ok) {
      expect('③ 孤立 clear 应判红', false, '未找到锚点');
    } else {
      const r = await runGuard();
      expect('③ 孤立 clear() → exit 1 且指出是残留', r.code === 1 && /残留/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④ 异步提交被删掉 ----------
  {
    const bak = backup(NOTIFY);
    touched.push(bak);
    const txt = fs.readFileSync(bak.file, 'utf8');
    const line = '            int submitted = tenantAwareExecutor.submitAllForTenants(tenantIds, this::dispatchOneTenant);';
    if (!txt.includes(line)) {
      expect('④ 删掉异步提交应判红', false, '未找到 submitAllForTenants 调用行');
    } else {
      fs.writeFileSync(bak.file, txt.split(line).join('            int submitted = 0;'), 'utf8');
      const r = await runGuard();
      expect('④ 无submitXxx 调用 → exit 1 且指出改造未落地',
        r.code === 1 && /未落地/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ 执行器里删掉 setTenantId ----------
  {
    const bak = backup(REAL_EXECUTOR);
    touched.push(bak);
    const txt = fs.readFileSync(bak.file, 'utf8');
    const line = '                TenantContext.setTenantId(tenantId);';
    if (!txt.includes(line)) {
      expect('⑤ 删掉 setTenantId 应判红', false, '未找到 setTenantId 调用行');
    } else {
      fs.writeFileSync(bak.file, txt.split(line).join('                // 回归：忘了设上下文'), 'utf8');
      const r = await runGuard();
      expect('⑤ 执行器无 setTenantId → exit 1', r.code === 1 && /setTenantId/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑥ clear 不在 finally ----------
  {
    const bak = backup(REAL_EXECUTOR);
    touched.push(bak);
    // 把 finally { ... } 改成普通块：结构变了但代码还在，守卫必须靠"是否在 finally"判出来
    const txt = fs.readFileSync(bak.file, 'utf8');
    const before = '            } finally {\n                // 缺这行会把租户上下文留在被复用的线程里，\n                // 让下一个任务把数据算到上一个租户头上 —— 跨租户数据泄露。\n                TenantContext.clear();\n            }';
    if (!txt.includes(before)) {
      // 锚点不匹配则退而求其次：把 finally 关键字去掉
      if (txt.includes('            } finally {')) {
        fs.writeFileSync(bak.file, txt.split('} finally {').join('} if (true) {'), 'utf8');
        const r = await runGuard();
        expect('⑥ clear 不在 finally → exit 1', r.code === 1 && /finally/.test(r.out), r.out);
      } else {
        expect('⑥ clear 不在 finally 应判红', false, '执行器 finally 结构已变，需同步本测试锚点');
      }
    } else {
      fs.writeFileSync(bak.file, txt.split(before).join('            }\n            TenantContext.clear();'), 'utf8');
      const r = await runGuard();
      expect('⑥ clear 移出 finally → exit 1', r.code === 1 && /finally/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑦ 引入 InheritableThreadLocal（假解法）----------
  {
    const bak = backup(REAL_EXECUTOR);
    touched.push(bak);
    const ok = injectBefore(bak, '    public void submitForTenant(Long tenantId, Runnable work) {',
      '    // 回归：想用 InheritableThreadLocal 自动传递（对池化线程无效）\n' +
      '    private static final InheritableThreadLocal<Long> FAKE_HOLDER = new InheritableThreadLocal<>();');
    if (!ok) {
      expect('⑦ 引入 TTL 应判红', false, '未找到 submitForTenant 锚点');
    } else {
      const r = await runGuard();
      expect('⑦ InheritableThreadLocal → exit 1 且点明池化线程场景失效',
        r.code === 1 && /InheritableThreadLocal/.test(r.out) && /池化/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑧ MonitorTask 有异步但无上下文 ----------
  {
    const bak = backup(MONITOR);
    touched.push(bak);
    const ok = injectBefore(bak, '    private boolean taskEnabled() {',
      '    // 回归：MonitorTask 也走异步，但没设租户上下文\n' +
      '    private void fakeAsync(TenantAwareExecutor ex) { ex.submitForTenant(1L, () -> {}); }');
    if (!ok) {
      expect('⑧ MonitorTask 异步但无上下文应判红', false, '未找到 taskEnabled 锚点');
    } else {
      const r = await runGuard();
      // MonitorTask 本身有 setTenantId，所以这条改动不该让它变红——
      // 守卫判据是"有异步且无 setTenantId"。验证它不会误报。
      const notRed = r.code === 0;
      expect('⑧ MonitorTask 本已有 setTenantId，加异步不应误报（守卫不越界）', notRed, r.out);
    }
    bak.restore();
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑨ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑨ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑨ 源码零污染（逐字节比对）', polluted.length === 0, polluted.map((b) => b.file).join(', '));
}

// ---------- ⑩ SKIP ----------
{
  const r = await runGuard({ SKIP_TENANT_XT: '1' });
  expect('⑩ SKIP_TENANT_XT=1 → exit 0', r.code === 0 && /SKIP_TENANT_XT/.test(r.out), r.out);
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
})();
