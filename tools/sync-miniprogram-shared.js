#!/usr/bin/env node
'use strict';
/*
 * 同步「共享层」到小程序端镜像（整目录镜像）。
 *
 * 根 shared/ 是 Web 与小程序共享的唯一权威源（术语领域层、API 路径、常量、格式化等，均为零 DOM 纯逻辑）。
 * 小程序受工具链限制不能跨出 miniprogram/ 目录直接 import 根 shared，故在此把 shared/ 下全部
 * .js 逐字节镜像进 miniprogram/shared/（保留目录结构）。
 *
 * 改完根 shared/ 后跑本脚本即可保持 mp 同步；不要手动改 miniprogram/shared/ 里的逻辑（守卫会拦）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'shared');
const DST_DIR = path.join(ROOT, 'miniprogram', 'shared');

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, cb);
    else if (name.endsWith('.js')) cb(full);
  }
}

if (!fs.existsSync(SRC_DIR)) {
  console.error('source not found:', SRC_DIR);
  process.exit(1);
}

let count = 0;
walk(SRC_DIR, (src) => {
  const rel = path.relative(SRC_DIR, src);
  const dst = path.join(DST_DIR, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('  synced ->', path.join('miniprogram', 'shared', rel));
  count++;
});
console.log(`=== miniprogram/shared synced (${count} files) ===`);
