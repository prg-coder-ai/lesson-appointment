// 检测小程序里所有 ENDPOINTS.X 引用是否都在根 shared/apiPaths.js 的 ENDPOINTS 中定义。
// 用法：node tools/check-endpoints-refs.mjs
// 退出码：0=无缺失；1=有缺失（列出 引用文件:行 号）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPaths = await import('file://' + path.join(ROOT, 'shared/apiPaths.js'));
const defined = new Set(Object.keys(apiPaths.ENDPOINTS));

const MP_DIR = path.join(ROOT, 'miniprogram');
const refs = new Map(); // name -> ["相对路径:行"]

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(fp); continue; }
    if (!entry.name.endsWith('.js')) continue;
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      const re = /\bENDPOINTS\.([A-Z_][A-Z0-9_]*)/g;
      let m;
      while ((m = re.exec(ln))) {
        const name = m[1];
        if (!refs.has(name)) refs.set(name, []);
        refs.get(name).push(`${path.relative(ROOT, fp)}:${i + 1}`);
      }
    });
  }
}
walk(MP_DIR);

const missing = [...refs.keys()].filter(n => !defined.has(n));
console.log(`ENDPOINTS 定义常量数: ${defined.size}`);
console.log(`小程序引用到的常量数: ${refs.size}`);
if (missing.length === 0) {
  console.log('✅ 无缺失：所有 ENDPOINTS.X 引用都在根 shared/apiPaths.js 中定义');
  process.exit(0);
}
console.log(`❌ 缺失 ${missing.length} 个（被引用但未定义，必然导致 undefined→畸形 URL→网络错）：`);
for (const n of missing) console.log(`  - ${n}\n      <- ${refs.get(n).join('\n      <- ')}`);
process.exit(1);
