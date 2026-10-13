import fs from 'fs';
const dir = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/css/';
const files = ['student.css', 'teacher.css'];
for (const f of files) {
  const p = dir + f;
  let s = fs.readFileSync(p).toString('utf8');
  const b = s;
  // student 内部游离蓝 -> 引用主色 token
  s = s.replace(/#1a73e8/g, 'var(--primary-color)');
  // teacher 的 --warning-color 变量与统一值对齐
  s = s.replace(/--warning-color:\s*#faad14;/g, '--warning-color: #d48806;');
  if (s !== b) { fs.writeFileSync(p, Buffer.from(s, 'utf8')); console.log('updated', f); }
  else console.log('no change', f);
}
console.log('student has var(--primary-color) for tab:', /result-tab\.active[^}]*var\(--primary-color\)/.test(fs.readFileSync(dir+'student.css').toString('utf8')));
