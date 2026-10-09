#!/usr/bin/env node
'use strict';
/*
 * 前端全局标识符碰撞守卫自测（tests/check_global_collide_guard.js）
 *
 * 目的：证明 tools/check-global-collide.mjs **真的会失败**。
 * 「守卫全绿」只有在守卫被证明会变红时才有意义；否则它可能只是恰好没扫到
 * （死检查与真检查的输出长得一模一样）。
 *
 * 覆盖用例：
 *   ① 基线：当前仓库通过
 *   ② 复现原始故障：顶层 `var EP` 撞顶层 `const EP` → 必须 exit 1
 *   ③ 反向对照：把 var 缩进（放进 IIFE）→ 必须 exit 0，证明判据确实是"顶层"而非"文件里出现"
 *   ④ 豁免标记 `// global-collision: allow <理由>` → 必须 exit 0
 *   ④b 环境变量 SKIP_GLOBAL_COLLIDE=1 跳过 → 必须 exit 0
 *   ⑤ const + const 同名（情况①）→ 必须 exit 1
 *   ⑤b 同名顶层 function（情况③，浏览器不报错只静默覆盖）→ 必须 exit 1
 *   ⑥ 还原后回到 exit 0
 *
 * 实现说明：不能用 child_process 再起一个 node —— 从 node 里 spawn 托管版node.exe
 * 会 EBUSY（沙箱/文件锁）。改为**同进程动态导入**守卫，临时接管 process.exit 取退出码，
 * 每次导入用 cache-busting query 保证模块体重新执行。
 *
 * 注入方式：新建一个**临时 HTML + 临时 JS**（不改真实源码），因为冲突只在
 * 「同一页面同时加载两个脚本」时才成立，单独改一个真实文件造不出这个条件。
 * 所有改动走 finally 兜底还原。
 *
 * 用法：node tests/check_global_collide_guard.js
 * 退出码：0=全部断言符合预期；1=有不符合项
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools', 'check-global-collide.mjs');

// 探针必须落在 frontend/ 根下（守卫只扫 frontend/*.html 及其引用的本地脚本）
const PROBE_HTML = path.join(ROOT, 'frontend', '_tmp_collide_probe.html');
const PROBE_A = path.join(ROOT, 'frontend', 'js', '_tmp_collide_a.js');
const PROBE_B = path.join(ROOT, 'frontend', 'js', '_tmp_collide_b.js');

const STALE = [PROBE_HTML, PROBE_A, PROBE_B];
// 上次运行崩溃可能残留：残留会让基线用例直接失败，先把现场清干净再测。
for (const p of STALE) {
  if (fs.existsSync(p)) {
    console.warn('⚠ 发现上次运行残留的探针文件，已清理：' + path.relative(ROOT, p));
    fs.unlinkSync(p);
  }
}

async function runGuard() {
  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  // null 而非 0：守卫每次都应以 process.exit 收尾；若没收到，说明它没跑到底，
  // 此时必须让断言失败（false pass 是这类守卫最危险的失效方式）。
  let code = null;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  process.exit = (c) => { code = (c == null ? 0 : c); throw { __guardExit: true }; };
  try {
    const url = pathToFileURL(GUARD).href + '?t=' + Date.now() + Math.random();
    await import(url);
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

const results = [];
function expect(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) console.log('    ' + String(detail).split('\n').slice(0, 14).join('\n    '));
}

function writeProbeA(body) {
  fs.writeFileSync(PROBE_A, body.join('\n') + '\n', 'utf8');
}
function writeProbeB(body) {
  fs.writeFileSync(PROBE_B, body.join('\n') + '\n', 'utf8');
}
function writeProbeHtml() {
  fs.writeFileSync(PROBE_HTML, [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head><body>',
    '  <script src="js/_tmp_collide_a.js"></script>',
    '  <script src="js/_tmp_collide_b.js"></script>',
    '</body></html>',
    ''
  ].join('\n'), 'utf8');
}

// 载荷A：全局词法绑定（模拟真实的 termsFunction.js）
const A_LEXICAL = [
  '// 临时探针 A（反向测试用，会被删除）',
  '// 模拟 termsFunction.js：顶层 const 会占用全局词法绑定',
  'const EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};',
  ''
];
// 载荷 B-var：顶层 var（模拟出问题的 admin-messageManage.js）
const B_TOP_VAR = [
  '// 临时探针 B（反向测试用，会被删除）',
  '// 顶层 var EP → 解析期 SyntaxError: Identifier EP has already been declared',
  'var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};',
  'function probeB() { return EP; }',
  ''
];

(async () => {
  try {
    // ---- ① 基线 ----
    {
      const r = await runGuard();
      expect('① 基线：当前仓库通过（exit 0）', r.code === 0, `exit=${r.code}\n${r.out}`);
      expect('① 基线报告了扫描规模', /扫描 \d+ 个页面 \/ \d+ 个本地脚本引用/.test(r.out), r.out);
    }

    writeProbeHtml();

    // ---- ② 复现原始故障 ----
    writeProbeA(A_LEXICAL);
    writeProbeB(B_TOP_VAR);
    {
      const r = await runGuard();
      expect('② 顶层 var 撞顶层 const → exit 1', r.code === 1, `exit=${r.code}\n${r.out}`);
      expect('② 报出变量名 EP', r.out.includes('EP'), r.out);
      expect('② 报出后加载的探针 B', r.out.includes('_tmp_collide_b.js'), r.out);
      expect('② 报出占用方探针 A', r.out.includes('_tmp_collide_a.js'), r.out);
      expect('② 报出页面名', r.out.includes('_tmp_collide_probe.html'), r.out);
      // 注意：守卫的建议文案里**没有** "IIFE" 字样，给的是具体代码形态
// (function(){ 'use strict'; ... })()。断言必须匹配真实文案，
// 否则这条断言会永远红，且容易被误读成"守卫没输出"。
expect('② 修法建议给出 IIFE 代码形态',
        r.out.includes("(function(){ 'use strict'; ... })()"), r.out);
expect('② 修法建议反对靠改名绕过',
        r.out.includes('不要靠改名绕过'), r.out);
    }

    // ---- ③ 反向对照：缩进到 IIFE 内 → 必须通过 ----
    // 这一条最关键：若守卫只是"文件里出现同名就报"，缩进后仍会红，
    // 说明它无法区分顶层/局部，是个假守卫。
    writeProbeB([
      '// 临时探针 B（反向测试用，会被删除）',
      '// 同一个EP，但放进 IIFE → 局部作用域，与探针 A 的 const EP 不冲突',
      '(function () {',
      "    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};",
      '    function probeB() { return EP; }',
      '    window.probeB = probeB;',
      '})();',
      ''
    ]);
    {
      const r = await runGuard();
      expect('③ 缩进进 IIFE 后 → exit 0（证明判据是"顶层"而非"文件内出现"）',
        r.code === 0, `exit=${r.code}\n${r.out}`);
    }

    // ---- ④ 豁免标记 ----
    writeProbeB([
      '// 临时探针 B（反向测试用，会被删除）',
      'var EP = {}; // global-collision: allow 反向测试：验证豁免通道',
      ''
    ]);
    {
      const r = await runGuard();
      expect('④ 行内 global-collision: allow → exit 0（豁免通道有效）',
        r.code === 0, `exit=${r.code}\n${r.out}`);
    }

    // ---- ④b 环境变量跳过 ----
    // 复用 ② 的载荷（此时应为红），验证 SKIP_GLOBAL_COLLIDE=1 能放行
    writeProbeB(B_TOP_VAR);
    {
      const orig = process.env.SKIP_GLOBAL_COLLIDE;
      process.env.SKIP_GLOBAL_COLLIDE = '1';
      let r;
      try { r = await runGuard(); } finally {
        if (orig === undefined) delete process.env.SKIP_GLOBAL_COLLIDE;
        else process.env.SKIP_GLOBAL_COLLIDE = orig;
      }
      expect('④b SKIP_GLOBAL_COLLIDE=1 → exit 0（跳过通道有效）',
        r.code === 0, `exit=${r.code}\n${r.out}`);
    }

    // ---- ⑤ const + const 同名（情况①） ----
    writeProbeA([
      '// 临时探针 A（反向测试用，会被删除）',
      'const DUP_NAME = 1;',
      ''
    ]);
    writeProbeB([
      '// 临时探针 B（反向测试用，会被删除）',
      'const DUP_NAME = 2;',
      ''
    ]);
    {
      const r = await runGuard();
      expect('⑤ const+const 同名碰撞 → exit 1', r.code === 1, `exit=${r.code}\n${r.out}`);
      expect('⑤ 报出 DUP_NAME 与两个探针文件',
        r.out.includes('DUP_NAME') && r.out.includes('_tmp_collide_a.js')
        && r.out.includes('_tmp_collide_b.js'), r.out);
    }

    // ---- ⑤b 同名顶层 function（情况③） ----
    // 与①②的区别：浏览器**不报错**，只是静默覆盖 —— 属于"能跑但行为是错的"。
    // 本仓库真实踩过：admin-dataMaintainPage.js 的死代码 localsearchCourse 覆盖了
    // admin-course.js 的同名函数，导致课程管理页搜索按钮调到另一个页面的取数函数。
    writeProbeA([
      '// 临时探针 A（反向测试用，会被删除）',
      'function dupFn() { return "A"; }',
      ''
    ]);
    writeProbeB([
      '// 临时探针 B（反向测试用，会被删除）',
      'function dupFn() { return "B"; }',
      ''
    ]);
    {
      const r = await runGuard();
      expect('⑤b 同名顶层 function → exit 1', r.code === 1, `exit=${r.code}\n${r.out}`);
      expect('⑤b 说明了"不报错只静默覆盖"',
        r.out.includes('静默覆盖'), r.out);
    }

    // ---- ⑥ 还原后回到 exit 0 ----
    // ⚠️ 必须**先删探针再断言**：探针 HTML 还引用着两个故意冲突的脚本，
    // 只要它在，守卫就该判红。放在 finally 之后断言等于测"探针还在时全绿"。
    for (const p of STALE) if (fs.existsSync(p)) fs.unlinkSync(p);
    {
      const r = await runGuard();
      expect('⑥ 删除探针后回到 exit 0', r.code === 0, `exit=${r.code}\n${r.out}`);
    }
    expect('⑥b 探针文件确已清理',
      STALE.every((p) => !fs.existsSync(p)),
      STALE.filter((p) => fs.existsSync(p)).join(', '));
  } finally {
    for (const p of STALE) if (fs.existsSync(p)) fs.unlinkSync(p);
    console.log('\n（探针文件已删除）');
  }

  const bad = results.filter(r => !r.ok);
  console.log(`\n反向测试：${results.length - bad.length}/${results.length} 项符合预期`);
  process.exitCode = bad.length ? 1 : 0;
})();