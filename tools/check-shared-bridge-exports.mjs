#!/usr/bin/env node
/**
 * 桥接导出对齐守卫（2026-10-12 新增，第 16 道）。
 *
 * 必要性：
 *   frontend/js/shared-domain-bridge.js 由 frontend/tools/gen-shared-bridge.js 生成，
 *   负责把 shared/domain/*.js 的纯函数挂到 window.*Domain，供 frontend 的 classic 脚本委托。
 *   但产物里的 `window.XxxDomain = { ... }` 是**手工白名单**——不自动跟随源文件的导出。
 *   于是「给 shared/domain 加了一个导出、忘了往白名单补一行」会静默漂移：
 *     · Web 端 `MD.xxx` 得到 undefined；
 *     · 调用点各自落进回退分支（`MD.xxx ? MD.xxx(v) : v`），**界面漏出裸英文/编码值**；
 *     · 编译不失败、构建不失败、守卫（shared-sync 只比 md5、global-collide 只扫顶层标识符）全绿。
 *   2026-10-12 的 `messageStatusText` 正是这样漏的（withdrawn 会显示成 "withdrawn"），
 *   且小程序端因走 ESM 具名导入而不受影响 —— 两端行为不一致，最难察觉。
 *
 * 三项检查：
 *   A. 产物新鲜度：把生成器的当前输出与磁盘产物逐字节（行尾归一后）比对 ——
 *      拦「改了 shared/ 或改了白名单却忘了重跑生成器」。
 *   B. 导出对齐：逐 domain 比对「源文件导出集合」与「实际挂到 window 的键集合」。
 *      遗漏项必须在 shared/domain/bridge-exports.json 的 notExposed 登记理由（≥20 字）；
 *      多余的键（挂载了源文件没有的名字，如跨域误挂）直接判红。
 *   C. 登记表有效性：notExposed 里的死条目（源已删该导出 / 实际已挂上 window）要求清理，
 *      防止这张表随时间腐化成装饰品。
 *
 * 紧急跳过：SKIP_BRIDGE_EXPORTS=1 git commit ...
 * 单独运行：node tools/check-shared-bridge-exports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const REGISTRY_REL = 'shared/domain/bridge-exports.json';
const BRIDGE_REL = 'frontend/js/shared-domain-bridge.js';
const GEN_REL = 'frontend/tools/gen-shared-bridge.js';
const BUILD_REL = 'frontend/build.js';

const REGISTRY = path.join(ROOT, REGISTRY_REL);
const BRIDGE = path.join(ROOT, BRIDGE_REL);
const DOMAIN_DIR = path.join(ROOT, 'shared', 'domain');

const problems = [];
const add = (title, detail) => problems.push({ title, detail: detail || '' });

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

/** 行尾归一：仓库可能被 git 以 CRLF 检出，新鲜度比对不应被行尾差异干扰 */
function normEol(s) {
  return s.replace(/\r\n/g, '\n');
}

/** 解析 ESM 源文件的导出名（export function/const/let/var/class + export { a, b as c }） */
function exportsOf(src) {
  const names = new Set();
  const re1 = /^[ \t]*export[ \t]+(?:async[ \t]+)?(?:function|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re1.exec(src))) names.add(m[1]);
  const re2 = /^[ \t]*export[ \t]*\{([^}]*)\}/gm;
  while ((m = re2.exec(src))) {
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (!t) continue;
      const as = t.split(/[ \t]+as[ \t]+/);
      names.add((as[as.length - 1] || '').trim());
    }
  }
  return names;
}

/**
 * 在 vm 沙箱里加载桥接产物，返回挂载结果与抛错信息。
 *
 * 产物拼接顺序是 constants + apiPaths + domain + adapters + body，而 `window.*` 的挂载语句
 * **全在末尾的 body 段**。适配层（net/storage/ui/router）会做运行时平台探测，本沙箱没有 wx/DOM，
 * 因此它一旦在顶层抛错，body 就不会执行、window.* 全缺。
 * 实测当前产物在沙箱中不抛错；若将来抛了，报告会同时给出「未挂载」与抛错信息，
 * 便于区分「导出真的漏挂」与「产物在沙箱里跑不起来」这两种成因。
 */
function loadBridge(code) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  let thrown = null;
  try {
    vm.runInContext(code, sandbox, { filename: BRIDGE_REL });
  } catch (e) {
    thrown = e;
  }
  return { win: sandbox, thrown };
}

function report() {
  console.log('\n❪ check:bridge-exports 失败\n');
  for (const p of problems) {
    console.log('  · ' + p.title);
    if (p.detail) {
      for (const line of p.detail.split('\n')) console.log('    ' + line);
    }
  }
  console.log('\n  紧急跳过：SKIP_BRIDGE_EXPORTS=1 git commit ...');
  console.log('  登记豁免：' + REGISTRY_REL + ' 的 notExposed（须写明 ≥20 字理由）');
  console.log('  重跑生成：node frontend/tools/gen-shared-bridge.js\n');
  process.exit(1);
}

function main() {
  if (process.env.SKIP_BRIDGE_EXPORTS === '1') {
    console.log('[bridge-exports] SKIP_BRIDGE_EXPORTS=1，跳过桥接导出对齐守卫');
    return;
  }

  // ---- 前置：登记表 ----
  if (!fs.existsSync(REGISTRY)) {
    add(`登记表缺失：${REGISTRY_REL}`, '本守卫需要它给出「domain 文件 → window 对象名」的权威映射。');
    return report();
  }
  let reg;
  try {
    reg = JSON.parse(readFile(REGISTRY));
  } catch (e) {
    add(`${REGISTRY_REL} 不是合法 JSON`, e.message);
    return report();
  }
  const domains = Array.isArray(reg.domains) ? reg.domains : [];
  if (!domains.length) {
    add(`${REGISTRY_REL} 的 domains 为空`, '至少应列出 8 个 domain 文件与对应的 window 对象名。');
    return report();
  }
  const globalOf = new Map(domains.map((d) => [d.file, d.global]));

  // ---- 检查 A：产物新鲜度 ----
  if (!fs.existsSync(BRIDGE)) {
    add(`桥接产物缺失：${BRIDGE_REL}`, '跑 node frontend/tools/gen-shared-bridge.js 生成。');
    return report();
  }
  const diskCode = readFile(BRIDGE);

  let gen = null;
  try {
    const requireCjs = createRequire(import.meta.url);
    gen = requireCjs(path.join(ROOT, GEN_REL));
  } catch (e) {
    add(`无法加载生成器 ${GEN_REL}`, e.message);
  }
  if (gen && typeof gen.buildBridgeContent !== 'function') {
    add('生成器未导出 buildBridgeContent()',
      '守卫靠它比对产物新鲜度；它必须是零副作用（不写盘、不打日志）的纯函数。');
  } else if (gen) {
    let fresh = null;
    try {
      fresh = gen.buildBridgeContent();
    } catch (e) {
      add('生成器 buildBridgeContent() 执行失败', e.message);
    }
    if (typeof fresh === 'string' && normEol(fresh) !== normEol(diskCode)) {
      add('桥接产物陈旧：与生成器当前输出不一致',
        '改了 shared/ 或生成器里的 window.* 清单后，没有重跑生成器。\n' +
        '修复：node frontend/tools/gen-shared-bridge.js（frontend/build.js 会自动调用它）。');
    }
  }

  // 产物应随构建自动重建：build.js 若不调用生成器，改了 shared/ 就没人同步产物
  try {
    if (!/gen-shared-bridge/.test(readFile(path.join(ROOT, BUILD_REL)))) {
      add(`${BUILD_REL} 不再引用 gen-shared-bridge`,
        '产物将不会随构建自动重建，pre-commit 会长期报"陈旧"。');
    }
  } catch { /* build.js 缺失由其它守卫负责，这里不重复报 */ }

  // ---- 加载产物，取得实际挂载事实 ----
  const { win, thrown } = loadBridge(diskCode);

  // ---- 检查 B：逐 domain 导出对齐 ----
  const notExposed = Array.isArray(reg.notExposed) ? reg.notExposed : [];
  const allowedMissing = new Set(notExposed.map((i) => `${i.file}::${i.name}`));
  let aligned = 0;

  for (const item of domains) {
    const { file, global: gname } = item;
    if (!file || !gname) {
      add(`${REGISTRY_REL} 的 domains 有缺 file/global 的条目`, JSON.stringify(item));
      continue;
    }
    const srcPath = path.join(DOMAIN_DIR, file);
    if (!fs.existsSync(srcPath)) {
      add(`源文件缺失：shared/domain/${file}`, '登记表里列了它，但文件不存在。');
      continue;
    }
    const ex = exportsOf(readFile(srcPath));
    const obj = win[gname];
    if (!obj || typeof obj !== 'object') {
      add(`${gname} 未挂载到 window`,
        `源文件 shared/domain/${file} 的全部导出在 Web 端均不可访问。\n` +
        (thrown ? `（产物在沙箱中执行时抛错：${thrown.message}）` : ''));
      continue;
    }
    const keys = new Set(Object.keys(obj));

    const missing = [...ex].filter((n) => !keys.has(n));
    const unregistered = missing.filter((n) => !allowedMissing.has(`${file}::${n}`));
    if (unregistered.length) {
      add(`${gname} 漏挂 ${unregistered.length} 个导出`,
        '源文件有、但没挂到 window → Web 端读到 undefined，调用点会静默落进回退分支。\n' +
        `漏项：${unregistered.join(', ')}\n` +
        `修复：在 ${GEN_REL} 的 window.${gname} 清单里补上；` +
        '若确实不需要 Web 消费，在 bridge-exports.json 的 notExposed 登记理由。');
    }

    const extra = [...keys].filter((n) => !ex.has(n));
    if (extra.length) {
      add(`${gname} 挂载了源文件没有的键`,
        `多余项：${extra.join(', ')}\n` +
        '常见成因：把别的 domain 的导出误挂到这里（生成器里能取到名字，故不报错），或拼写与源不一致。');
    }

    if (!unregistered.length && !extra.length) aligned++;
  }

  // ---- 检查 C：豁免登记的有效性（防登记表腐化）----
  for (const item of notExposed) {
    const label = `notExposed: ${item.file}::${item.name}`;
    if (!item.file || !item.name) {
      add(`${label} 缺 file/name`);
      continue;
    }
    const srcPath = path.join(DOMAIN_DIR, item.file);
    if (!fs.existsSync(srcPath)) {
      add(`${label} 的源文件不存在`, `shared/domain/${item.file} 找不到。`);
      continue;
    }
    const ex = exportsOf(readFile(srcPath));
    if (!ex.has(item.name)) {
      add(`${label} 是死登记：源文件已无此导出`,
        '请从 bridge-exports.json 的 notExposed 中删除该条。');
      continue;
    }
    const gname = globalOf.get(item.file);
    const obj = gname ? win[gname] : null;
    if (obj && Object.prototype.hasOwnProperty.call(obj, item.name)) {
      add(`${label} 是死登记：该导出实际已挂到 ${gname}`,
        '登记与事实矛盾，请从 notExposed 中删除该条。');
      continue;
    }
    if (String(item.reason || '').trim().length < 20) {
      add(`${label} 的 reason 不足 20 字`,
        '理由要能被复核：说清「谁在消费它 / 为什么 Web 不需要」。');
    }
  }

  if (problems.length) return report();

  console.log(
    `[bridge-exports] OK: ${domains.length} 个域对象与源导出逐项对齐` +
    `（豁免登记 ${notExposed.length} 项），产物与生成器输出一致`
  );
}

main();
