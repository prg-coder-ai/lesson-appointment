#!/usr/bin/env node
'use strict';
/*
 * P0-1 md5 守卫：小程序端术语镜像必须与根领域层一致，且 terms.js 必须是纯 re-export 桩。
 *
 * 不一致说明有人改了 mp 副本而非根 shared —— 会导致 web/mp 术语分叉。
 * 构建前由 frontend/build.js 调用；也可单独运行做 CI 检查。
 * 紧急跳过：SKIP_SHARED_SYNC=1 node frontend/build.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'shared', 'domain', 'term.js');
const MIRROR = path.join(ROOT, 'miniprogram', 'shared', 'domain', 'term.js');
const STUB = path.join(ROOT, 'miniprogram', 'shared', 'terms.js');

function md5(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
}

function fail(msg) {
  console.error('[shared-sync] FAIL:', msg);
  process.exit(1);
}

if (!fs.existsSync(SRC)) fail('根领域层缺失 ' + path.relative(ROOT, SRC));

const srcMd5 = md5(SRC);
const mirrorMd5 = md5(MIRROR);
if (mirrorMd5 === null) {
  fail('小程序镜像缺失 ' + path.relative(ROOT, MIRROR) + '（请跑 tools/sync-miniprogram-shared.js）');
}
if (srcMd5 !== mirrorMd5) {
  fail('小程序镜像与根领域层 md5 不一致：' + path.relative(ROOT, MIRROR));
}

if (!fs.existsSync(STUB)) fail('小程序 terms.js 桩缺失 ' + path.relative(ROOT, STUB));
const stub = fs.readFileSync(STUB, 'utf8');
if (!/export\s*\*\s*from\s*['"]\.\/domain\/term\.js['"]/.test(stub)) {
  fail(path.relative(ROOT, STUB) + ' 未 re-export ./domain/term.js');
}
// 桩若退化成又一份独立术语实现（旧副本残留），守卫必须拦下
const forbidden = /export\s+const\s+TERM_DICT|export\s+function\s+getTerms|export\s+const\s+INDUSTRY_NAMES/;
if (forbidden.test(stub)) {
  fail(path.relative(ROOT, STUB) + ' 仍含独立术语逻辑（应改为纯 re-export 桩）');
}

console.log('[shared-sync] OK: 小程序术语镜像与根领域层一致');
