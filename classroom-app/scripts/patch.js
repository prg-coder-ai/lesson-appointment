/**
 * 前端改动记录 · 构建期补丁应用器
 * ==================================================================
 * 职责：把 config/frontend-patches.js 里 status='active' 的条目，
 *       应用到 classroom-app/www/ 的副本上。
 *
 * ★ 安全纪律（不可违反）：
 *   1) 只读写 www/ 目录下的文件，绝不访问 frontend/ 源目录；
 *   2) rewrite 前校验锚点存在且唯一，漂移立即报错（fail-fast，不静默跳过）；
 *   3) CRLF 归一化：读取时把 \r\n 归一为 \n 再匹配，保留原行尾风格写回，
 *      规避 core.autocrlf=true 下 Git Bash 的 CRLF 毒害；
 *   4) 幂等：已应用过的补丁（检测到 replacement / marker）跳过不重复打。
 *
 * 用法：
 *   node classroom-app/scripts/patch.js          # 应用补丁到 www/
 *   node classroom-app/scripts/patch.js --check  # 只校验锚点，不写文件
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const WWW = path.join(APP_DIR, 'www');
const { PATCHES } = require(path.join(APP_DIR, 'config', 'frontend-patches.js'));

const CHECK_ONLY = process.argv.includes('--check');

let applied = 0;
let skipped = 0;
let failed = 0;

/**
 * 保留原行尾风格：读入归一化 → 处理 → 按原风格写回。
 * 返回 { text, newline, hadCRLF }。
 */
function readNormalized(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const hadCRLF = raw.indexOf('\r\n') !== -1;
  return { text: hadCRLF ? raw.replace(/\r\n/g, '\n') : raw, hadCRLF };
}

function writeRestored(file, text, hadCRLF) {
  fs.writeFileSync(file, hadCRLF ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

function countOccurrences(text, sub) {
  if (!sub) return 0;
  let n = 0;
  let i = 0;
  while ((i = text.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
  return n;
}

function applyRewrite(patch, file) {
  const { text, hadCRLF } = readNormalized(file);

  // 幂等：已应用
  if (text.indexOf(patch.replacement) !== -1) {
    console.log(`  [跳过] ${patch.id} ${patch.target}: 补丁已存在`);
    skipped++;
    return;
  }

  const hits = countOccurrences(text, patch.anchor);
  if (hits === 0) {
    console.error(`  [失败] ${patch.id} ${patch.target}: 锚点未找到 → ${patch.anchor}`);
    failed++;
    return;
  }
  if (hits > 1) {
    console.error(`  [失败] ${patch.id} ${patch.target}: 锚点不唯一（${hits} 处）→ ${patch.anchor}`);
    failed++;
    return;
  }

  if (!CHECK_ONLY) {
    const out = text.replace(patch.anchor, patch.replacement);
    writeRestored(file, out, hadCRLF);
  }
  console.log(`  ${CHECK_ONLY ? '[校验]' : '[应用]'} ${patch.id} ${patch.target}: OK`);
  applied++;
}

function applyInject(patch, file) {
  const { text, hadCRLF } = readNormalized(file);

  if (text.indexOf(patch.marker) !== -1) {
    console.log(`  [跳过] ${patch.id} ${patch.target}: 注入标记已存在`);
    skipped++;
    return;
  }

  const anchor = '</head>';
  if (text.indexOf(anchor) === -1) {
    console.error(`  [失败] ${patch.id} ${patch.target}: 未找到注入锚点 </head>`);
    failed++;
    return;
  }

  if (!CHECK_ONLY) {
    const block = `  ${patch.marker}\n  ${patch.inject}\n`;
    const out = text.replace(anchor, block + anchor);
    writeRestored(file, out, hadCRLF);
  }
  console.log(`  ${CHECK_ONLY ? '[校验]' : '[应用]'} ${patch.id} ${patch.target}: OK`);
  applied++;
}

console.log(CHECK_ONLY ? '校验前端补丁锚点（只读）...' : '应用前端补丁到 www 副本...');
console.log(`  补丁清单: config/frontend-patches.js (${PATCHES.length} 条)\n`);

// 分组：active 的走应用，deferred 的只打印记录
const active = PATCHES.filter((p) => p.status === 'active');
const deferred = PATCHES.filter((p) => p.status !== 'active');

active.forEach((patch) => {
  const file = path.join(WWW, patch.target);
  if (!fs.existsSync(file)) {
    console.error(`  [失败] ${patch.id} ${patch.target}: www 副本文件不存在（先跑 sync.js）`);
    failed++;
    return;
  }
  if (patch.mode === 'rewrite') applyRewrite(patch, file);
  else if (patch.mode === 'inject') applyInject(patch, file);
  else {
    console.error(`  [失败] ${patch.id}: 未知 mode=${patch.mode}`);
    failed++;
  }
});

if (deferred.length) {
  console.log('\n  仅记录（未自动应用，待上游修改）：');
  deferred.forEach((p) => console.log(`    - ${p.id} [${p.priority}] ${p.title} → ${p.target}`));
}

console.log(`\n结果：应用/校验 ${applied}，跳过 ${skipped}，失败 ${failed}`);
if (failed > 0) {
  console.error('补丁应用存在失败，构建终止。请核对锚点是否已在上游变更。');
  process.exit(1);
}
