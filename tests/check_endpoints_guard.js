#!/usr/bin/env node
'use strict';
/*
 * 端点守卫自测（tests/check_endpoints_guard.js）
 *
 * 目的：证明 tools/check-endpoints-refs.mjs 的三项检查**真的会失败**。
 * 「守卫全绿」只有在守卫被证明会变红时才有意义；否则它可能只是恰好没扫到。
 * 本自测注入三类缺陷并断言守卫确实报错，最后还原。
 *
 * 实现说明：不能用 child_process 再起一个 node —— 从 node 里 spawn 托管版 node.exe
 * 会 EBUSY（沙箱/文件锁）。改为**同进程动态导入**守卫，临时接管 process.exit 取退出码，
 * 每次导入用 cache-busting query 保证模块体重新执行。
 *
 * 临时改动一律还原（finally 兜底）；若上次运行中途崩溃可能残留探针文件，
 * 本脚本启动时会先清掉它（见 STALE_PROBE 处理）。
 *
 * 用法：node tests/check_endpoints_guard.js
 * 退出码：0=三项断言全部符合预期；1=有不符合项
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools', 'check-endpoints-refs.mjs');
const PROBE = path.join(ROOT, 'frontend', 'js', '_tmp_guard_probe.js');
const SNAP = path.join(ROOT, 'frontend', 'js', 'platform-admin-backend-info.js');

// 上次运行崩溃可能残留：残留会让基线用例直接失败，先把现场清干净再测。
if (fs.existsSync(PROBE)) {
  console.warn('⚠ 发现上次运行残留的探针文件，已清理：' + path.relative(ROOT, PROBE));
  fs.unlinkSync(PROBE);
}

async function runGuard() {
  const origExit = process.exit;
  const origLog = console.log;
  // null 而非 0：守卫每次都应以 process.exit 收尾；若没收到，说明它没跑到底，
  // 此时必须让断言失败（false pass 是这类守卫最危险的失效方式）。
  let code = null;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  process.exit = (c) => { code = (c == null ? 0 : c); throw { __guardExit: true }; };
  try {
    const url = pathToFileURL(GUARD).href + '?t=' + Date.now() + Math.random();
    await import(url);
  } catch (e) {
    if (!e || !e.__guardExit) {
      console.log = origLog; process.exit = origExit;
      throw e;
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
  }
  return { code, out: lines.join('\n') };
}

const results = [];
function expect(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) console.log('    ' + String(detail).split('\n').slice(0, 12).join('\n    '));
}

let snapBackup = null;

(async () => {
  try {
    // ---- 基线：当前应通过 ----
    {
      const r = await runGuard();
      expect('基线：当前仓库通过（exit 0）', r.code === 0, `exit=${r.code}\n${r.out}`);
    }

    // ---- ①② 注入硬编码 + 未定义引用 ----
    fs.writeFileSync(PROBE, [
      '// 临时探针（反向测试用，会被删除）',
      "var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};",
      'var a = EP.NOT_DEFINED_XYZ;',
      "var b = '/api/v1/bogus/thing';",
      ''
    ].join('\n'), 'utf8');
    {
      const r = await runGuard();
      expect('注入探针 → exit 1', r.code === 1, `exit=${r.code}`);
      expect('② 报出注入的硬编码', /②\s*硬编码防回归/.test(r.out) && r.out.includes('bogus/thing'), r.out);
      expect('① 报出未定义的 EP.NOT_DEFINED_XYZ', /①\s*引用完整性/.test(r.out) && r.out.includes('NOT_DEFINED_XYZ'), r.out);
      expect('硬编码命中定位到探针文件', r.out.includes('_tmp_guard_probe.js'), r.out);
    }
    fs.unlinkSync(PROBE);

    // ---- ③ 快照漂移 ----
    snapBackup = fs.readFileSync(SNAP, 'utf8');
    const drift = snapBackup.replace("prefix: '/api/v1/message'", "prefix: '/api/v9/message'");
    if (drift === snapBackup) throw new Error('未能构造快照漂移（锚点未命中）');
    fs.writeFileSync(SNAP, drift, 'utf8');
    {
      const r = await runGuard();
      expect('快照漂移 → exit 1', r.code === 1, `exit=${r.code}`);
      expect('③ 报出快照不一致', /③\s*快照一致性/.test(r.out) && r.out.includes('不一致'), r.out);
    }
    fs.writeFileSync(SNAP, snapBackup, 'utf8');
    snapBackup = null;

    // ---- 还原后应重新通过 ----
    {
      const r = await runGuard();
      expect('还原后回到 exit 0', r.code === 0, `exit=${r.code}\n${r.out}`);
    }
  } finally {
    if (snapBackup !== null) fs.writeFileSync(SNAP, snapBackup, 'utf8');
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
    console.log('\n（探针文件已删除，快照已还原）');
  }

  const bad = results.filter(r => !r.ok);
  console.log(`\n反向测试：${results.length - bad.length}/${results.length} 项符合预期`);
  process.exitCode = bad.length ? 1 : 0;
})();
