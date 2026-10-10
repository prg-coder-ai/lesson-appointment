#!/usr/bin/env node
/**
 * itest 被测快照同步守卫 —— 反向测试（薄弱环节报告 2026-10-10 P0-2 / N1）
 *
 * 反向测试项：
 *   ① 基线通过
 *   ② login-flow.mjs 删掉 rmSync 先删后拷行 → 判红（副本幽灵文件回归）
 *   ③ logic.mjs 删掉 cpSync(join(SRC 拷贝 → 判红（副本不再自重建）
 *   ④ .gitignore 删掉 _sut* 条目 → 判红（生成文件重新入库的历史回归）
 *   ⑤ logic.mjs 加 import(...SRC...) 直连源目录 → 判红（wx mock 与副本双轨分裂）
 *   ⑥ 还原后回到 exit 0 且源码零污染（逐字节比对）
 *
 * 运行：node tests/check_itest_sut_sync_guard.js
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-itest-sut-sync.mjs');

const LOGIC = path.join(ROOT, 'tests/miniprogram-itest/logic.mjs');
const LOGIN = path.join(ROOT, 'tests/miniprogram-itest/login-flow.mjs');
const GITIGNORE = path.join(ROOT, '.gitignore');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 12).join('\n      '));
  }
}

/** 同进程 import 守卫并捕获 process.exit（模式与 check_result_contract_guard.js 一致） */
async function runGuard() {
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

(async () => {
console.log('\nitest 快照同步守卫反向测试\n' + '='.repeat(56));

const touched = [];
try {
  // ---------- ① 基线 ----------
  {
    const r = await runGuard();
    expect('① 基线通过', r.code === 0, r.out);
  }

  // ---------- ② login-flow 删 rmSync ----------
  {
    const bak = backup(LOGIN);
    touched.push(bak);
    const anchor = "rmSync(SUT, { recursive: true, force: true });";
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('② 删 rmSync 应判红', false, '未找到锚点 rmSync(SUT（harness 结构已变，需同步本测试）');
    } else {
      fs.writeFileSync(bak.file, txt.split(anchor).join('// 回归：先删后拷被移除'), 'utf8');
      const r = await runGuard();
      expect('② 缺 rmSync → exit 1 且点名 login-flow.mjs',
        r.code === 1 && /rmSync/.test(r.out) && /login-flow\.mjs/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ③ logic 删 cpSync(join(SRC ----------
  {
    const bak = backup(LOGIC);
    touched.push(bak);
    const anchor = 'cpSync(join(SRC';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('③ 删 cpSync 应判红', false, '未找到锚点 cpSync(join(SRC');
    } else {
      fs.writeFileSync(bak.file, txt.split(anchor).join('copySync(join(SRC'), 'utf8');
      const r = await runGuard();
      expect('③ 缺 cpSync → exit 1 且点名 logic.mjs',
        r.code === 1 && /cpSync/.test(r.out) && /logic\.mjs/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ④ .gitignore 删 _sut* 条目 ----------
  {
    const bak = backup(GITIGNORE);
    touched.push(bak);
    const anchor = 'tests/miniprogram-itest/_sut*';
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('④ 删 gitignore 条目应判红', false, '未找到锚点 tests/miniprogram-itest/_sut*');
    } else {
      fs.writeFileSync(bak.file, txt.split(anchor + '\n').join('').split(anchor).join(''), 'utf8');
      const r = await runGuard();
      expect('④ gitignore 缺 _sut* 条目 → exit 1',
        r.code === 1 && /\.gitignore/.test(r.out), r.out);
    }
    bak.restore();
  }

  // ---------- ⑤ logic 加 import(...SRC...) ----------
  {
    const bak = backup(LOGIC);
    touched.push(bak);
    const anchor = "// ---- load real modules ----";
    const txt = fs.readFileSync(bak.file, 'utf8');
    if (!txt.includes(anchor)) {
      expect('⑤ 加 import(...SRC...) 应判红', false, '未找到锚点 // ---- load real modules ----');
    } else {
      fs.writeFileSync(bak.file,
        txt.replace(anchor, anchor + "\nconst evil = await import(SRC + '/core/evil.js'); // 回归：直连源目录"), 'utf8');
      const r = await runGuard();
      expect('⑤ 直连源目录 import → exit 1 且点名 logic.mjs',
        r.code === 1 && /从源目录 import/.test(r.out) && /logic\.mjs/.test(r.out), r.out);
    }
    bak.restore();
  }
} finally {
  for (const bak of touched) bak.restore();
}

// ---------- ⑥ 还原校验 ----------
{
  const r = await runGuard();
  const polluted = touched.filter((b) => fs.readFileSync(b.file, 'utf8') !== b.orig);
  expect('⑥ 还原后回到 exit 0', r.code === 0, r.out);
  expect('   ⑥ 源码零污染（逐字节比对）', polluted.length === 0, polluted.map((b) => b.file).join(', '));
}

const passed = results.filter((x) => x.ok).length;
const failed = results.length - passed;
console.log('='.repeat(56));
console.log(`反向测试：${passed}/${results.length} 通过` + (failed ? `，${failed} 项失败` : ''));
process.exit(failed ? 1 : 0);
})();
