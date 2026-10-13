import fs from 'fs';
const p = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/css/admin.css';
let s = fs.readFileSync(p).toString('utf8');

// 1) 删除"第三套" Ant 色板按钮块（primary->success->warning->danger 连续，且在文件末尾覆盖一切）。
//    正则按该固定顺序连续匹配，不会命中第一套（第一套顺序是 primary/success/danger/warning）。
const reThird = /\.btn-primary\s*\{[^}]*\}\s*\.btn-success\s*\{[^}]*\}\s*\.btn-warning\s*\{[^}]*\}\s*\.btn-danger\s*\{[^}]*\}/;
if (reThird.test(s)) { s = s.replace(reThird, ''); console.log('removed 3rd button palette block'); }

// 2) 修复双分号
if (s.includes('#d48806;;')) { s = s.replace(/#d48806;;/, '#d48806;'); console.log('fixed double semicolon'); }

// 3) :root 加 --primary-color，并把 --warning-color 纠回 #d48806
if (!/--primary-color\s*:/.test(s)) {
  s = s.replace(/(:root\s*\{)/, '$1\n--primary-color: #722ed1;');
  console.log('added --primary-color to :root');
}
s = s.replace(/--warning-color:\s*#faad14;/, '--warning-color: #d48806;');

// 4) .js-teacher-name 游离蓝 -> 主色紫
s = s.replace(/(color:\s*)#409eff(;)/g, '$1#722ed1$2');

fs.writeFileSync(p, Buffer.from(s, 'utf8'));

console.log('--- verify ---');
console.log('has #409eff anywhere:', s.includes('#409eff'));
console.log('has #67c23a/#e6a23c/#f56c6c:', /#67c23a|#e6a23c|#f56c6c/.test(s));
console.log('btn-warning -> #d48806:', /\.btn-warning[^}]*#d48806/.test(s));
console.log('has --primary-color def:', /--primary-color\s*:/.test(s));
console.log('has --warning-color #d48806:', /--warning-color:\s*#d48806/.test(s));
console.log('no double semicolon:', !s.includes('#d48806;;'));
console.log('js-teacher-name purple:', /\.js-teacher-name[^}]*#722ed1/.test(s));
