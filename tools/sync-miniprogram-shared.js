#!/usr/bin/env node
'use strict';
/*
 * 同步「共享术语领域层」到小程序端镜像（P0-1/2 配套工具）。
 *
 * 根 shared/domain/term.js 是 Web 与小程序术语的唯一权威源（P1 领域层下沉 + P0 词典归一）。
 * 小程序受工具链限制不能跨出 miniprogram/ 目录直接 import 根 shared，故在此：
 *   1) 把领域层逐字节拷贝进 miniprogram/shared/domain/term.js（镜像）；
 *   2) 把 miniprogram/shared/terms.js 改写为纯 re-export 桩。
 * 改完根领域层后跑本脚本即可保持 mp 同步；不要手动改 mp 镜像/桩里的逻辑（守卫会拦）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'shared', 'domain', 'term.js');
const DST_DIR = path.join(ROOT, 'miniprogram', 'shared', 'domain');
const DST = path.join(DST_DIR, 'term.js');
const STUB = path.join(ROOT, 'miniprogram', 'shared', 'terms.js');

if (!fs.existsSync(SRC)) {
  console.error('source not found:', SRC);
  process.exit(1);
}

fs.mkdirSync(DST_DIR, { recursive: true });
fs.copyFileSync(SRC, DST);
console.log('  synced ->', path.relative(ROOT, DST));

const stub = `// 小程序端术语镜像桩（由 tools/sync-miniprogram-shared.js 自动生成，请勿手改逻辑）。
// 唯一权威实现见 ../../shared/domain/term.js（与 Web / P0 构建桥接共用同一份）。
export * from './domain/term.js';
`;
fs.writeFileSync(STUB, stub);
console.log('  stub   ->', path.relative(ROOT, STUB));
console.log('=== miniprogram shared/terms synced ===');
