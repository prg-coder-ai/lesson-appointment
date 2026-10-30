// 前端全局标识符碰撞守卫
//
// 背景（2026-10-09 真实故障）：管理端「消息管理」页面显示
// 「消息管理模块未加载（admin-messageManage.js）」。
//
// 真相不是文件缺失、不是 404、也不是语法写错（node --check 通过、文件在、script 标签在），
// 而是**跨脚本的全局词法绑定冲突**：
//   - admin.html 先加载 js/public/termsFunction.js，其顶层是 `const EP`（第 10 行）
//   - 后加载 js/admin-messageManage.js，其顶层是 `var EP`（第 20 行）
//   ES 规范：全局词法绑定（const/let）不可被 var 重新声明 → 后者**整个脚本
//   在解析阶段就抛 SyntaxError**，一个函数都不注册。
//
// 为什么这类 bug 极难定位：
//   1. 控制台报错指向「admin-messageManage.js:1」，但真正原因是另一个文件的第 10 行；
//   2. 文件明明存在、单文件语法检查通过、script 标签正确、dist 产物也在；
//   3. 页面兜底文案主动把它伪装成「模块未加载」，把人引向"文件/路径/部署"方向；
//   4. 其余菜单全部正常，只有这一个坏 —— 典型的"局部坏掉"更难联想到全局作用域。
//
// 守卫判据（按页面而非按文件，因为冲突只在**同一页面同时加载**时才成立）：
//   对每个 frontend/*.html，按其 <script src> 顺序收集所有本地脚本，
//   凡「顶层 const/let 声明的名字」又被「另一个文件的顶层 var / function 声明」占用 → 报错。
//
// 为什么只看顶层（缩进 0）：包在 IIFE / 函数体内的声明是局部的，不进全局作用域。
// 这也是本守卫同时充当「该不该加 IIFE」的判据 —— 报出的文件必须加 IIFE 而不是改名字。
//
// 豁免：
//   SKIP_GLOBAL_COLLIDE=1   整体跳过
//   行尾 `// global-collision: allow <理由>`  —— 极少数确需共享全局符号的场景
//
// 用法：node tools/check-global-collide.mjs
// 退出码：0=通过；1=存在跨脚本全局标识符碰撞
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');

if (process.env.SKIP_GLOBAL_COLLIDE === '1') {
  console.log('[global-collide] SKIP_GLOBAL_COLLIDE=1，跳过');
  process.exit(0);
}

/**
 * 顶层（缩进 0）的 const/let 声明 → 会进全局词法作用域。
 * 返回 [{name, line}]
 */
function topLevelLexical(src) {
  const out = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (/^\s/.test(line)) return; // 缩进 ⇒ 在 IIFE/函数体内，不进全局
    const m = line.match(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/);
    if (m) out.push({ name: m[1], line: i + 1 });
  });
  return out;
}

/**
 * 顶层（缩进 0）的 var / function 声明 → 全局对象属性 / 全局绑定。
 * 返回 [{name, kind, line}]
 */
function topLevelVarFn(src) {
  const out = [];
  src.split(/\r?\n/).forEach((line, i) => {
    if (/^\s/.test(line)) return;
    let m = line.match(/^var\s+([A-Za-z_$][\w$]*)/);
    if (m) { out.push({ name: m[1], kind: 'var', line: i + 1 }); return; }
    m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (m) out.push({ name: m[1], kind: 'function', line: i + 1 });
  });
  return out;
}

/** 行内豁免：同一行带 allow 标记 */
function hasAllow(src, lineNo) {
  const line = src.split(/\r?\n/)[lineNo - 1] || '';
  return /\/\/\s*global-collision:\s*allow\b/.test(line);
}

const problems = [];
const notes = [];

// 桥接镜像：由frontend/tools/gen-shared-bridge.js 生成，内容整体已在 IIFE 内
// （局部函数，末尾才显式挂 window），本守卫的"顶层"判据对它无意义，且会
// 把"内联权威源"与"手写页面脚本"的正常重名报成冲突。与端点守卫同样排除。
const GENERATED = new Set(['js/shared-domain-bridge.js']);

const pages = fs.readdirSync(FRONTEND).filter((f) => f.endsWith('.html'));
if (pages.length === 0) {
  console.error('[global-collide] 致命：未找到任何 frontend/*.html，扫描范围失效');
  process.exit(1);
}

let totalScripts = 0;

for (const page of pages) {
  const html = fs.readFileSync(path.join(FRONTEND, page), 'utf8');

  // 按文档出现顺序收集本地脚本（顺序即加载顺序，冲突与顺序强相关）
  const scripts = [];
  for (const m of html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)) {
    const rel = m[1];
    if (/^https?:\/\//.test(rel)) continue;
    if (GENERATED.has(rel)) continue;
    const abs = path.join(FRONTEND, rel);
    if (!fs.existsSync(abs)) continue; // 404 由端点守卫/构建负责，不在本守卫报
    scripts.push({ rel, abs, src: fs.readFileSync(abs, 'utf8') });
  }
  totalScripts += scripts.length;
  if (scripts.length === 0) continue;

  // 收集全局词法绑定名
  const lexical = new Map(); // name -> [ 'file:line', ... ]
  for (const s of scripts) {
    for (const d of topLevelLexical(s.src)) {
      if (hasAllow(s.src, d.line)) continue;
      if (!lexical.has(d.name)) lexical.set(d.name, []);
      lexical.get(d.name).push(`${s.rel}:${d.line}`);
    }
  }
  // ⚠️ 这里**不能**写 `if (lexical.size === 0) continue;` ——
  // 情况③（同名顶层 function 静默覆盖）不需要任何 const/let 就能成立。
  // 曾经写了这行 early-return，结果情况③ 变成永不执行的死检查：
  // 反向测试用一个只含 function 的探针页打它，守卫输出"未发现碰撞"，
  // 而真实浏览器里后加载的函数确实覆盖了先加载的。已移除。

  // 情况 ①：两个 const/let 同名 —— 同样是解析期 SyntaxError，症状同样是"模块未加载"
  for (const [name, where] of lexical) {
    const files = new Set(where.map((w) => w.split(':')[0]));
    if (files.size > 1) {
      problems.push(
        `${page} → ${where.join(' / ')} 顶层 \`const/let ${name}\` 重复声明于 ${files.size} 个脚本。\n` +
        `    → 后加载的那个脚本会在**解析阶段**抛 SyntaxError（Identifier '${name}' has already been declared），\n` +
        `      整个文件一个函数都不注册，页面只会显示「模块未加载」的兜底文案。\n` +
        `    → 修法：给冲突文件整体包 (function(){ 'use strict'; ... })()，把对外入口显式挂 window。\n` +
        `      不要靠改名绕过 —— 下一个文件再加同名顶层声明还会复发。`
      );
    }
  }

  // 情况 ②：词法绑定被 var / function 撞 —— var 不能重声明全局词法绑定
  const reported = new Set();
  for (const s of scripts) {
    for (const d of topLevelVarFn(s.src)) {
      if (!lexical.has(d.name)) continue;
      if (hasAllow(s.src, d.line)) continue;
      const key = s.rel + '#' + d.name;
      if (reported.has(key)) continue;
      reported.add(key);
      problems.push(
        `${page} → ${s.rel}:${d.line} 顶层 \`${d.kind} ${d.name}\` ` +
        `与 ${lexical.get(d.name).join(' / ')} 的顶层 \`const/let ${d.name}\` 冲突。\n` +
        `    → 后加载的那个脚本会在**解析阶段**抛 SyntaxError（Identifier '${d.name}' has already been declared），\n` +
        `      整个文件一个函数都不注册，页面只会显示「模块未加载」的兜底文案。\n` +
        `    → 修法：给本文件整体包 (function(){ 'use strict'; ... })();，把对外入口显式挂 window。\n` +
        `      不要靠改名绕过 —— 下一个文件再加同名 var 还会复发。`
      );
    }
  }

  // 情况 ③：同名顶层 function 出现在两个脚本 —— 不报 SyntaxError，但后加载的**静默覆盖**
  // 前一个，是"能跑但行为是错的"那一类，更难查。同样要求 IIFE 隔离。
  const fnSeen = new Map(); // name -> [{file, line}]
  for (const s of scripts) {
    for (const d of topLevelVarFn(s.src)) {
      if (d.kind !== 'function') continue;
      if (hasAllow(s.src, d.line)) continue;
      if (!fnSeen.has(d.name)) fnSeen.set(d.name, []);
      fnSeen.get(d.name).push({ file: s.rel, line: d.line });
    }
  }
  for (const [name, occ] of fnSeen) {
    const files = new Set(occ.map((o) => o.file));
    if (files.size > 1) {
      problems.push(
        `${page} → ${occ.map((o) => `${o.file}:${o.line}`).join(' / ')} 顶层 \`function ${name}\` 重复定义于 ${files.size} 个脚本。\n` +
        `    → 浏览器**不会**报错，只是后加载的静默覆盖先加载的（表现为"功能串味/行为莫名"）。\n` +
        `    → 修法：给冲突文件整体包 (function(){ 'use strict'; ... })()，把对外入口显式挂 window。`
      );
    }
  }
}

console.log(`[global-collide] 扫描 ${pages.length} 个页面 / ${totalScripts} 个本地脚本引用\n`);

if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 处跨脚本全局标识符碰撞：\n`);
  for (const p of problems) console.error('  ' + p + '\n');
  process.exit(1);
}

console.log('✓ 未发现跨脚本全局标识符碰撞');
process.exit(0);