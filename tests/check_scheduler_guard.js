#!/usr/bin/env node
/**
 * 调度线程池守卫 —— 反向测试
 *
 * 目的：证明 check-scheduler-guard.mjs 真会红，而不是一个恒绿的死检查。
 *
 * 背景（项目通用教训）：这个仓库之前踩过两次"守卫全绿但防护为零"——
 *   ① 守卫成功路径没写 process.exit(0)，反向测试拿到的 exit=null；
 *   ② `if (lexical.size === 0) continue` 这类 early-return 让某条检查分支从未执行，
 *      初版输出全绿，实际那一支是死代码。
 * 所以每条反向测试都必须**实际把守卫打红**，并断言"红的原因是预期的那一条"。
 *
 * 反向测试项：
 *   ① 基线：当前仓库通过
 *   ② pool.size 改回 1 → 必须 exit 1，且报错文本指向 pool.size
 *   ③ 整段删除 → 必须 exit 1，且报错文本说"缺少"
 *   ④ 注释里写pool.size=1（stripComments 必须剥离）→ 必须 exit 1
 *      ← 这条最容易写成假绿：注释里的大值会被当成真配置读到
 *   ⑤ 删掉 thread-name-prefix → 必须 exit 1 且指向 prefix
 *   ⑥ 关掉优雅停机 → 必须 exit 1 且指向 await-termination
 *   ⑦ pool.size 写成 "abc" → 必须 exit 1 且说"不是整数"
 *   ⑧ SKIP_SCHEDULER=1 → 必须 exit 0
 *   ⑨ @Bean("taskScheduler") 改名 → 必须 exit 1（2026-11-20 真实事故形态）
 *   ⑩ 注释掉 taskScheduler 的 setWaitForTasksToCompleteOnShutdown(true) → 必须 exit 1
 *      ← 定点测试"片段定位"：同文件 callbackExecutor 也有这句，整文件搜索会假绿
 *   ⑪ 删掉 classroom-service 的 pool.size → 必须 exit 1（证明该服务已被覆盖）
 *   ⑫ 还原后回到 exit 0，且文件逐字节还原（反向测试会污染源码，必须校验）
 *
 * 运行：node tests/check_scheduler_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-scheduler-guard.mjs');
const API_PROPS = path.join(ROOT, 'api/src/main/resources/application.properties');
const CS_PROPS = path.join(ROOT, 'api/classroom-service/src/main/resources/application.properties');
const ASYNC_CONFIG = path.join(
  ROOT,
  'api/classroom-service/src/main/java/com/classroom/config/AsyncConfig.java'
);

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) console.log('      ' + String(detail).split('\n').join('\n      '));
}

/**
 * 同进程 import 守卫，把 process.exit 捕获成 code。
 *
 * ⚠️ 为什么不用 spawnSync：本机node 子进程一律返回 EBUSY
 *    （error.message === 'spawnSync ... EBUSY'，status 为 null），
 *    照搬会得到"基线就红"的假失败 —— 本文件第一版就是这么写的，11 项里10 项假红。
 *    ESM 的模块缓存用 `?t=` query 绕开（守卫每次重新求值源码）。
 *
 * code 取null 而非 0：守卫必须以 process.exit 收尾；若压根没收到，
 * 说明它没跑到底，此时断言必须失败（false pass 是这类守卫最危险的失效方式）。
 */
async function runGuard(env) {
  if (env) {
    const saved = Object.assign({}, process.env);
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return await runGuardOnce();
    } finally {
      for (const k of Object.keys(process.env)) {
        if (!(k in saved)) delete process.env[k];
      }
      Object.assign(process.env, saved);
    }
  }
  return runGuardOnce();
}

async function runGuardOnce() {
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
  }
  return { code, out: lines.join('\n') };
}

/**
 * 备份文件；restore() 还原并返回"是否逐字节一致"。
 *
 * ⚠️ 第一版这里写的是 `const now = read(); write(orig); return now === orig;`
 *    —— now 读到的是**还没还原的变异内容**，与 orig 比必然不等，
 *    于是"还原后无残留"这项恒红。正确语义是：先还原，再读一次比对。
 */
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

console.log('\n调度线程池守卫反向测试\n' + '='.repeat(56));

(async () => {
const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线：当前仓库通过（exit 0）', r.code === 0, r.out);
  }

  // ---------- ② pool.size 改回 1 ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const mutated = bak.orig.replace(
      /^spring\.task\.scheduling\.pool\.size=4$/m,
      'spring.task.scheduling.pool.size=1'
    );
    if (mutated === bak.orig) {
      expect('② pool.size=1 应判红', false, '未找到锚点 spring.task.scheduling.pool.size=4 —— 守卫源码或配置已变，需同步本测试');
    } else {
      fs.writeFileSync(API_PROPS, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1 && /pool\.size=1/.test(r.out) && /单线程/.test(r.out);
      expect('② pool.size 改回 1 → exit 1 且报错指向 pool.size/单线程', ok, r.out);
    }
    const clean = bak.restore();
    expect('   ② 还原后无残留', clean, '文件内容与变异前不一致');
  }

  // ---------- ③ 整段删除 ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    // 删掉 pool.size 与 prefix 两行（模拟"回退到没配过的旧版本"）
    const mutated = bak.orig
      .replace(/^spring\.task\.scheduling\.pool\.size=.*$/m, '')
      .replace(/^spring\.task\.scheduling\.thread-name-prefix=.*$/m, '');
    fs.writeFileSync(API_PROPS, mutated, 'utf8');
    const r = await runGuard();
    const ok = r.code === 1 && /缺少 spring\.task\.scheduling\.pool\.size/.test(r.out);
    expect('③ 整段删除 → exit 1 且说"缺少"', ok, r.out);
    bak.restore();
  }

  // ---------- ④ 注释里的值必须被剥离 ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    // 把真配置注释掉，再在注释里放一个"看起来很大"的值
    const mutated = bak.orig
      .replace(/^spring\.task\.scheduling\.pool\.size=4$/m, '# spring.task.scheduling.pool.size=64')
      .replace(/^spring\.task\.scheduling\.thread-name-prefix=sched-$/m, '# spring.task.scheduling.thread-name-prefix=sched-x');
    if (mutated === bak.orig) {
      expect('④ 注释里的值不应被当成配置', false, '未找到锚点，无法构造注释态');
    } else {
      fs.writeFileSync(API_PROPS, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1 && /缺少/.test(r.out);
      // 反向断言：若守卫读到注释里的 64 / sched-x，就会exit 0
      expect('④ 注释中的 pool.size=64 不被误读（stripComments 生效）', ok, r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ 删掉 thread-name-prefix ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const mutated = bak.orig.replace(
      /^spring\.task\.scheduling\.thread-name-prefix=sched-$/m,
      ''
    );
    fs.writeFileSync(API_PROPS, mutated, 'utf8');
    const r = await runGuard();
    const ok = r.code === 1 && /thread-name-prefix/.test(r.out) && /缺少/.test(r.out);
    expect('⑤ 删掉 prefix → exit 1 且指向 thread-name-prefix', ok, r.out);
    bak.restore();
  }

  // ---------- ⑥ 关掉优雅停机 ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const mutated = bak.orig.replace(
      /^spring\.task\.scheduling\.shutdown\.await-termination=true$/m,
      'spring.task.scheduling.shutdown.await-termination=false'
    );
    if (mutated === bak.orig) {
      expect('⑥ 优雅停机关掉应判红', false, '未找到锚点 await-termination=true');
    } else {
      fs.writeFileSync(API_PROPS, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1 && /await-termination/.test(r.out);
      expect('⑥ await-termination=false → exit 1', ok, r.out);
    }
    bak.restore();
  }

  // ---------- ⑦ 非整数 ----------
  {
    const bak = backup(API_PROPS);
    touched.push(bak);
    const mutated = bak.orig.replace(
      /^spring\.task\.scheduling\.pool\.size=4$/m,
      'spring.task.scheduling.pool.size=abc'
    );
    fs.writeFileSync(API_PROPS, mutated, 'utf8');
    const r = await runGuard();
    const ok = r.code === 1 && /不是整数/.test(r.out);
    expect('⑦ pool.size=abc → exit 1 且说"不是整数"', ok, r.out);
    bak.restore();
  }

  // ---------- ⑧ SKIP ----------
  {
    const r = await runGuard({ SKIP_SCHEDULER: '1' });
    expect('⑧ SKIP_SCHEDULER=1 → exit 0', r.code === 0 && /SKIP_SCHEDULER/.test(r.out), r.out);
  }

  // ---------- ⑨ 自建 TaskScheduler 不叫 taskScheduler ----------
  // 这是 2026-11-20 那个真实事故的形态：AsyncConfig 只有一个 callbackRetryScheduler，
  // Boot 自动装配因 @ConditionalOnMissingBean 退让，@Scheduled 全被 2 线程的回调池吸走。
  {
    const bak = backup(ASYNC_CONFIG);
    touched.push(bak);
    const mutated = bak.orig.replace('@Bean("taskScheduler")', '@Bean("schedPool")');
    if (mutated === bak.orig) {
      expect('⑨ 自建池未命名 taskScheduler 应判红', false,
        '未找到锚点 @Bean("taskScheduler") —— AsyncConfig 签名已变，需同步本测试');
    } else {
      fs.writeFileSync(ASYNC_CONFIG, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1 && /没有一个是\s*\*\*taskScheduler\*\*/.test(r.out);
      expect('⑨ @Bean 改名 → exit 1 且说"没有一个是 taskScheduler"', ok, r.out);
    }
    bak.restore();
  }

  // ---------- ⑩ taskScheduler 忘了开优雅停机 ----------
  // 关键：同文件里 callbackExecutor 也有 `executor.setWaitForTasksToCompleteOnShutdown(true);`，
  // 若守卫在整文件里搜这一句，本条会**假绿**。这是对"片段定位"的定点测试。
  {
    const bak = backup(ASYNC_CONFIG);
    touched.push(bak);
    const mutated = bak.orig.replace(
      'scheduler.setWaitForTasksToCompleteOnShutdown(true);',
      '// scheduler.setWaitForTasksToCompleteOnShutdown(true);'
    );
    if (mutated === bak.orig) {
      expect('⑩ taskScheduler 关掉优雅停机应判红', false,
        '未找到锚点 scheduler.setWaitForTasksToCompleteOnShutdown(true);');
    } else {
      fs.writeFileSync(ASYNC_CONFIG, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1 && /未调用 setWaitForTasksToCompleteOnShutdown/.test(r.out);
      expect('⑩ 注释掉优雅停机 → exit 1（且未被 callbackExecutor 那句掩盖）', ok, r.out);
    }
    bak.restore();
  }

  // ---------- ⑪ classroom-service 必须真的被覆盖 ----------
  // 2026-11-20 之前 TARGETS 里只有 booking/message，classroom 的 9 个扫描器从未被校验过。
  {
    const bak = backup(CS_PROPS);
    touched.push(bak);
    const mutated = bak.orig.replace(/^spring\.task\.scheduling\.pool\.size=8$/m, '');
    if (mutated === bak.orig) {
      expect('⑪ classroom pool.size 缺失应判红', false,
        '未找到锚点 spring.task.scheduling.pool.size=8 —— 配置已变，需同步本测试');
    } else {
      fs.writeFileSync(CS_PROPS, mutated, 'utf8');
      const r = await runGuard();
      const ok = r.code === 1
        && /classroom-service\/src\/main\/resources\/application\.properties/.test(r.out)
        && /缺少 spring\.task\.scheduling\.pool\.size/.test(r.out);
      expect('⑪ 删掉 classroom 的 pool.size → exit 1（证明该服务已被校验）', ok, r.out);
    }
    bak.restore();
  }
} finally {
  // ---------- 还原 + 污染校验 ----------
  for (const bak of touched) bak.restore();
}

// ---------- ⑫ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑫ 还原后回到 exit 0', r.code === 0, r.out);
  expect(
    '   ⑫ 源码零污染（逐字节比对）',
    polluted.length === 0,
    polluted.map((b) => b.file).join(', ')
  );
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));

// ★ 必须以显式退出码收尾：漏掉这一行时，即使有用例失败，进程仍以 0 退出，
//   pre-commit / CI 一律认为通过 —— 这就是"反向测试全绿但防护为零"的成因之一。
process.exit(failed ? 1 : 0);
})();
