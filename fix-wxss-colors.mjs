import fs from 'fs';
import path from 'path';

const root = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/miniprogram';
// 小程序内部统一：主蓝 -> #1677ff；弱文字灰 -> #6b7587（约 4.8:1 达标）
const rules = [
  [/＃1890ff/gi, '#1677ff'],
  [/#1890ff/gi, '#1677ff'],
  [/#aab2c0/gi, '#6b7587'],
  [/#8a94a6/gi, '#6b7587'],
  [/#999\b/gi, '#6b7587'],
];

let count = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.wxss')) continue;
    const buf = fs.readFileSync(p);
    let s = buf.toString('utf8');
    let changed = false;
    for (const [re, b] of rules) {
      if (re.test(s)) { s = s.replace(re, b); changed = true; }
    }
    if (changed) {
      fs.writeFileSync(p, Buffer.from(s, 'utf8'));
      console.log('updated', p.replace(root, '.'));
      count++;
    }
  }
}
walk(root);
console.log('total wxss updated:', count);
