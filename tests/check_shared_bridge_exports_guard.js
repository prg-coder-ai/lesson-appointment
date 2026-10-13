#!/usr/bin/env node
/**
 * 桥接导出对齐守卫 —— 反向测试（2026-10-12）
 *
 * 守卫抓的是「编译不失败、构建不失败、其它守卫全绿」的静默漂移，所以必须证明它真会红，
 * 否则它只是一个每次都打印 OK 的装饰品。逐项变异：
 *   ① 基线通过（exit 0）
 *   ② 生成器白名单删 messageStatusText → 判红（复现 2026-10-12 真实事故）
 *   ③ 源文件新增导出但未挂 window → 判红
 *   ④ 改了 shared/ 却没重跑生成器 → 判红（产物陈旧）
 *   ⑤ 产物里手工插入源文件没有的键 → 判红（跨域误挂）
 *   ⑥ 删掉 notExposed 豁免登记 → 判红（未登记遗漏）
 *   ⑦ notExposed 加一条与事实矛盾的登记 → 判红（死登记，防登记表腐化）
 *   ⑧ 还原后回到 exit 0，且生成器/产物/源文件/登记表 md5 逐字节还原（零污染）
 *
 * 运行：node tests/check_shared_bridge_exports_guard.js
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 *    重跑生成器改为「清 require.cache 后同进程调用」，不落子进程。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-shared-bridge-exports.mjs');
const GEN = path.join(ROOT, 'frontend/tools/gen-shared-bridge.js');
const BRIDGE = path.join(ROOT, 'frontend/js/shared-domain-bridge.js');
const MSG_DOMAIN = path.join(ROOT, 'shared/domain/message.js');
const TERM_DOMAIN = path.join(ROOT, 'shared/domain/term.js');
const REGISTRY = path.join(ROOT, 'shared/domain/bridge-exports.json');

const WATCHED = [GEN, BRIDGE, MSG_DOMAIN, TERM_DOMAIN, REGISTRY];

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 14).join('\n      '));
  }
}

function md5(p) {
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
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
      process.exit = origExit;
      console.log = origLog;
      console.error = origErr;
      throw e;
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origErr;
  }
  return { code: code == null ? 0 : code, out: lines.join('\n') };
}

/** 备份为 Buffer，还原即逐字节写回 */
function backup(file) {
  const orig = fs.readFileSync(file);
  return () => fs.writeFileSync(file, orig);
}

/** 同进程重跑生成器（清 CJS 缓存，避免拿到变异前的模块）；静音其日志以免污染测试输出 */
function regenerate() {
  const resolved = require.resolve(GEN);
  delete require.cache[resolved];
  const origLog = console.log;
  console.log = () => {};
  try {
    require(GEN).generateSharedBridge();
  } finally {
    console.log = origLog;
  }
}

function readText(f) {
  return fs.readFileSync(f, 'utf8');
}
function writeText(f, s) {
  fs.writeFileSync(f, s, 'utf8');
}
function readJson(f) {
  return JSON.parse(readText(f));
}
function writeJson(f, o) {
  writeText(f, JSON.stringify(o, null, 2) + '\n');
}

(async () => {
  console.log('\n桥接导出对齐守卫 —— 反向测试\n' + '='.repeat(60));

  const snapshots = new Map(WATCHED.map((f) => [f, md5(f)]));

  // ───────────────────────── ① 基线 ─────────────────────────
  {
    const r = await runGuard();
    expect(
      '① 基线通过（exit 0）',
      r.code === 0,
      r.code !== 0 ? `实际 exit=${r.code}\n输出：\n${r.out}` : ''
    );
  }

  // ─── ② 生成器白名单删 messageStatusText（复现 2026-10-12 真实事故）───
  {
    const rGen = backup(GEN);
    const rBridge = backup(BRIDGE);
    let out = '';
    let code = null;
    try {
      const ANCHOR = '  messageStatusText: messageStatusText,\n';
      // 工作区是 CRLF（core.autocrlf 检出），锚点按 LF 书写——不归一化会
      // "锚点明明在文件里却找不到"，用例退化成运行时异常（2026-10-13 实测）。
      const src = readText(GEN).replace(/\r\n/g, '\n');
      if (!src.includes(ANCHOR)) throw new Error('变异锚点未找到：' + ANCHOR.trim());
      writeText(GEN, src.replace(ANCHOR, ''));
      regenerate(); // 产物同步缺该键 → 只应触发「漏挂」，不该靠「陈旧」来报红
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rBridge();
      rGen();
    }
    expect(
      '② 白名单漏挂 messageStatusText → 判红且指出漏项',
      code !== 0 && out.includes('漏挂') && out.includes('messageStatusText'),
      `exit=${code}\n${out}`
    );
  }

  // ───────────── ③ 源文件新增导出但未挂 window ─────────────
  {
    const rMsg = backup(MSG_DOMAIN);
    const rBridge = backup(BRIDGE);
    let out = '';
    let code = null;
    try {
      writeText(MSG_DOMAIN, readText(MSG_DOMAIN) + '\nexport const BRIDGE_AUDIT_PROBE = 1;\n');
      regenerate();
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rBridge();
      rMsg();
    }
    expect(
      '③ 源文件新增导出未挂 window → 判红',
      code !== 0 && out.includes('BRIDGE_AUDIT_PROBE'),
      `exit=${code}\n${out}`
    );
  }

  // ─────────── ④ 改了 shared/ 却没重跑生成器（产物陈旧）───────────
  {
    const rMsg = backup(MSG_DOMAIN);
    let out = '';
    let code = null;
    try {
      const src = readText(MSG_DOMAIN);
      const anchor = "withdrawn: '已收回',";
      if (!src.includes(anchor)) throw new Error('变异锚点未找到：' + anchor);
      writeText(MSG_DOMAIN, src.replace(anchor, "withdrawn: '已收回(改)',"));
      // 刻意不重跑生成器
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rMsg();
    }
    expect(
      '④ 改 shared/ 未重跑生成器 → 判红（产物陈旧）',
      code !== 0 && out.includes('陈旧'),
      `exit=${code}\n${out}`
    );
  }

  // ───────── ⑤ 产物里手工插入源文件没有的键（跨域误挂）─────────
  {
    const rBridge = backup(BRIDGE);
    let out = '';
    let code = null;
    try {
      const src = readText(BRIDGE);
      const anchor = 'window.MessageDomain = {\n';
      if (!src.includes(anchor)) throw new Error('变异锚点未找到：' + anchor.trim());
      writeText(BRIDGE, src.replace(anchor, anchor + '  GHOST_PROBE: tenantText,\n'));
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rBridge();
    }
    expect(
      '⑤ 产物挂载源文件没有的键 → 判红（多余项）',
      code !== 0 && out.includes('源文件没有的键') && out.includes('GHOST_PROBE'),
      `exit=${code}\n${out}`
    );
  }

  // ───────────── ⑥ 删掉 notExposed 豁免登记 ─────────────
  {
    const rReg = backup(REGISTRY);
    let out = '';
    let code = null;
    try {
      const reg = readJson(REGISTRY);
      reg.notExposed = (reg.notExposed || []).filter((i) => i.name !== 'INDUSTRY_NAMES');
      writeJson(REGISTRY, reg);
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rReg();
    }
    expect(
      '⑥ 删除豁免登记 → 判红（未登记遗漏）',
      code !== 0 && out.includes('INDUSTRY_NAMES'),
      `exit=${code}\n${out}`
    );
  }

  // ───── ⑦ notExposed 加一条与事实矛盾的登记（死登记）─────
  {
    const rReg = backup(REGISTRY);
    let out = '';
    let code = null;
    try {
      const reg = readJson(REGISTRY);
      reg.notExposed = (reg.notExposed || []).concat([
        {
          file: 'message.js',
          name: 'messageStatusText',
          reason: '这条是反向测试注入的假登记：该导出实际上已经挂在 window.MessageDomain 上，因此守卫必须识别为死登记并要求清理。',
        },
      ]);
      writeJson(REGISTRY, reg);
      const r = await runGuard();
      code = r.code;
      out = r.out;
    } finally {
      rReg();
    }
    expect(
      '⑦ 与事实矛盾的豁免登记 → 判红（死登记）',
      code !== 0 && out.includes('死登记'),
      `exit=${code}\n${out}`
    );
  }

  // ───── ⑧ 还原后回归绿 + 零污染 ─────
  {
    const r = await runGuard();
    expect('⑧ 还原后基线回到 exit 0', r.code === 0, `exit=${r.code}\n${r.out}`);
  }
  {
    const polluted = WATCHED.filter((f) => md5(f) !== snapshots.get(f));
    expect(
      '⑨ 源码零污染（生成器/产物/源文件/登记表 md5 逐字节还原）',
      polluted.length === 0,
      polluted.map((f) => path.relative(ROOT, f)).join('\n')
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(60));
  console.log(
    failed.length === 0
      ? `[bridge-exports-guard] 反向测试全部通过（${results.length}/${results.length}）`
      : `[bridge-exports-guard] 反向测试失败 ${failed.length}/${results.length}：\n  ` +
        failed.map((f) => f.name).join('\n  ')
  );
  process.exit(failed.length === 0 ? 0 : 1);
})();
