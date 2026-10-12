#!/usr/bin/env node
'use strict';
// 把仓库根目录的 shared/ 同步进小程序项目（DevTools 要求项目自包含，不能引用项目外文件）。
// 这样 shared/ 作为唯一权威源，Web 端与小程序端共用同一份术语/常量/格式化逻辑，避免双份维护。
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.resolve(ROOT, '..', 'shared');
const DST = path.join(ROOT, 'shared');

function rmSync(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(p)) rmSync(path.join(p, n));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}

function copySync(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const n of fs.readdirSync(src)) copySync(path.join(src, n), path.join(dst, n));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

rmSync(DST);
copySync(SRC, DST);
console.log('[sync-shared] copied', SRC, '->', DST);
