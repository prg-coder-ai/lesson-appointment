#!/usr/bin/env node
'use strict';
/*
 * P0-1 md5 守卫：小程序端 shared/ 镜像必须与根 shared/ 逐文件一致（整目录镜像）。
 *
 * 不一致说明有人手改了 mp 副本而非根 shared —— 会导致 web/mp 逻辑分叉。
 * 构建前由 frontend/build.js 调用；也可单独运行做 CI 检查。
 * 紧急跳过：SKIP_SHARED_SYNC=1 node frontend/build.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'shared');
const MIRROR_DIR = path.join(ROOT, 'miniprogram', 'shared');

function md5(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
}

function fail(msg) {
  console.error('[shared-sync] FAIL:', msg);
  process.exit(1);
}

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, cb);
    else if (name.endsWith('.js')) cb(full);
  }
}

if (!fs.existsSync(SRC_DIR)) fail('根 shared/ 缺失 ' + path.relative(ROOT, SRC_DIR));

let count = 0;
const missing = [];
const diverge = [];
walk(SRC_DIR, (src) => {
  const rel = path.relative(SRC_DIR, src);
  const mirror = path.join(MIRROR_DIR, rel);
  count++;
  if (!fs.existsSync(mirror)) { missing.push(rel); return; }
  if (md5(src) !== md5(mirror)) diverge.push(rel);
});

if (missing.length) fail('小程序镜像缺失以下文件（请跑 tools/sync-miniprogram-shared.js）：\n  ' + missing.join('\n  '));
if (diverge.length) fail('小程序镜像与根 shared/ md5 不一致：\n  ' + diverge.join('\n  '));

checkWebTermDrift();

console.log(`[shared-sync] OK: 小程序 shared/ 镜像与根 shared/ 一致（${count} 文件）`);

// Web 端单源校验（P0-Web 收口）：frontend/js/public/terms.js 不得再携带硬编码词表，
// 否则即「第二份源」漂移。允许该文件作为委托 window.TermDomain 的 re-export 桩；
// 只要出现 TERM_DICT = { 字面量即判为漂移。文件不存在（已收口）时直接通过。
function checkWebTermDrift() {
  const webTerms = path.join(ROOT, 'frontend', 'js', 'public', 'terms.js');
  if (!fs.existsSync(webTerms)) return;
  const code = fs.readFileSync(webTerms, 'utf8');
  if (/\bTERM_DICT\s*=\s*\{/.test(code)) {
    fail('frontend/js/public/terms.js 仍含硬编码词表（TERM_DICT = {），违反 Web 单源约定。请改为委托 window.TermDomain 或直接删除该文件。');
  }
}
