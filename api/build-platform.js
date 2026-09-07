#!/usr/bin/env node
'use strict';
/*
 * 平台管理端 JS 压缩混淆构建（仅 platform-admin-*，随 api jar 打包）
 *
 * 输入：api/src/main/resources/static/js/platform-admin-*.js（源码，保持可读、不改动）
 * 输出：api/target/classes/static/js/platform-admin-*.js（覆盖 process-resources 已复制的未混淆版）
 *
 * 原理：Maven 的 process-resources 阶段已把 static/ 复制到 target/classes/static/（未混淆）。
 *       本脚本在 prepare-package 阶段对 platform-admin-*.js 做 terser 压缩后原地覆盖 target/classes，
 *       随后 spring-boot:repackage 把 target/classes 打进 jar —— 即「生产 jar 含混淆版、源码保持未混淆」。
 *
 * 安全：terser 默认仅混淆「局部变量」，顶层全局（ADMIN_ORIGIN / FRONTEND_ORIGIN / request 等
 *       由公共 js 定义、被平台端跨文件引用）不重命名，多文件引用不会断裂。
 */
const fs = require('fs');
const path = require('path');
const terser = require('terser');

const ROOT = __dirname;
const SRC_JS = path.join(ROOT, 'src/main/resources/static/js');
const OUT_JS = path.join(ROOT, 'target/classes/static/js');

function listPlatformJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^platform-admin-.*\.js$/.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .map(f => path.join(dir, f));
}

(async () => {
  const files = listPlatformJs(SRC_JS);
  if (!files.length) {
    console.warn('[build-platform] 未找到 src/main/resources/static/js/platform-admin-*.js，跳过');
    return;
  }
  fs.mkdirSync(OUT_JS, { recursive: true });
  let ok = 0;
  for (const f of files) {
    const rel = path.basename(f);
    const code = fs.readFileSync(f, 'utf8');
    const result = await terser.minify(code, { compress: true, mangle: true, module: false });
    if (result.error) {
      console.error('  [PLATFORM JS ERROR]', rel, result.error);
      process.exitCode = 1;
      continue;
    }
    fs.writeFileSync(path.join(OUT_JS, rel), result.code);
    console.log('  PLATFORM JS', rel.padEnd(38), code.length + ' -> ' + result.code.length);
    ok++;
  }
  console.log('=== platform-admin build done: ' + ok + ' file(s) -> ' + OUT_JS + ' ===');
})();
