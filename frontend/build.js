#!/usr/bin/env node
'use strict';
/*
 * 业务前端压缩混淆构建脚本（vanilla 多文件 + 跨文件全局引用安全）
 * 产出目录：frontend/dist/（结构镜像 frontend/，文件名保持不变，便于 HTML 直接引用）
 *
 * 安全原则：
 *  - terser 默认只混淆「局部变量」，顶层全局函数/const（如 ADMIN_ORIGIN、request）
 *    不会被重命名，跨文件引用不会断裂。
 *  - 不开启 mangle.toplevel / module，避免误删被其它文件调用的顶层声明。
 *  - HTML 内联脚本默认不做 JS 压缩（minifyJS:false），仅压缩 HTML 结构与内联 CSS，
 *    以避免 html-minifier 误判跨文件全局引用而破坏页面；重逻辑都在外部 js，已被压缩。
 */
const fs = require('fs');
const path = require('path');
const terser = require('terser');
const CleanCSS = require('clean-css');
const { minify: minifyHtml } = require('html-minifier-terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'target') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (p.replace(/\\/g, '/').endsWith('/js/test')) continue; // 测试目录不进生产构建
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

async function buildJs() {
  const files = walk(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const code = fs.readFileSync(f, 'utf8');
    const result = await terser.minify(code, {
      compress: true,
      mangle: true,
      module: false
    });
    if (result.error) {
      console.error('  [JS ERROR]', rel, result.error);
      process.exitCode = 1;
      continue;
    }
    const dest = path.join(DIST, rel);
    ensureDir(dest);
    fs.writeFileSync(dest, result.code);
    console.log('  JS  ', rel.padEnd(40), code.length + ' -> ' + result.code.length);
  }
}

function buildCss() {
  const files = walk(path.join(ROOT, 'css')).filter(f => f.endsWith('.css'));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const code = fs.readFileSync(f, 'utf8');
    const out = new CleanCSS({}).minify(code);
    if (out.errors && out.errors.length) {
      console.error('  [CSS ERROR]', rel, out.errors);
      process.exitCode = 1;
      continue;
    }
    const dest = path.join(DIST, rel);
    ensureDir(dest);
    fs.writeFileSync(dest, out.styles);
    console.log('  CSS ', rel.padEnd(40), code.length + ' -> ' + out.styles.length);
  }
}

async function buildHtml() {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const min = await minifyHtml(code, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: false,
      caseSensitive: true,
      keepClosingSlash: true
    });
    const dest = path.join(DIST, f);
    ensureDir(dest);
    fs.writeFileSync(dest, min);
    console.log('  HTML', f.padEnd(40), code.length + ' -> ' + min.length);
  }
}

function copyAssets() {
  // 根级构建元文件与测试目录不进入生产 dist
  const SKIP_ROOT = new Set(['package.json', 'build.js', '.gitignore', 'README.md', 'pom.xml', 'package-lock.json', '.npmrc']);
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f);
    if (/(^|\/)(node_modules|dist)(\/|$)/.test(rel)) continue;
    if (/\.(js|css|html)$/i.test(rel)) continue;
    if (/(^|\/)js\/test(\/|$)/.test(rel)) continue;
    const base = path.basename(rel);
    if (path.dirname(rel) === '.' && SKIP_ROOT.has(base)) continue;
    const dest = path.join(DIST, rel);
    ensureDir(dest);
    fs.copyFileSync(f, dest);
  }
  console.log('  assets copied (images/fonts/others)');
}

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  console.log('[build] JS');
  await buildJs();
  console.log('[build] CSS');
  buildCss();
  console.log('[build] HTML');
  await buildHtml();
  console.log('[build] assets');
  copyAssets();
  console.log('=== frontend build done ->', DIST, '===');
})();
