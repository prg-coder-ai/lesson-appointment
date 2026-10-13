// 修正：桌面列数必须放在 @media 之前，否则末尾追加会被 media 覆盖导致平板/手机错位。
// 幂等：用新标记判断，并清理上一版末尾误加的块。
import * as fs from 'fs';
const root = 'frontend/css/';

// —— admin ——
let a = fs.readFileSync(root + 'admin.css', 'utf8');
a = a.replace(/\r?\n\/\* ADMIN_STATS_COLS[\s\S]*?\}/, ''); // 清理 v1 末尾误加块
if (!a.includes('/* ADMIN_STATS_DESKTOP */')) {
  const ins = '\n/* ADMIN_STATS_DESKTOP 数据总览桌面列数（base 提供 display 基础后补回，置于 media 之前避免被覆盖） */\n'
    + '.stats-panel { grid-template-columns: repeat(5, 1fr); }\n';
  a = a.replace(/(@media \(max-width: 768px\) \{)/, ins + '$1');
  fs.writeFileSync(root + 'admin.css', a);
  console.log('admin: 桌面 5 列已插入 media 之前');
} else {
  console.log('admin: 桌面列数已存在，跳过');
}

// —— student ——
let s = fs.readFileSync(root + 'student.css', 'utf8');
s = s.replace(/\r?\n\/\* STUDENT_STATS_COLS[\s\S]*?\}/, ''); // 清理 v1 末尾误加块
if (!s.includes('/* STUDENT_STATS_DESKTOP */')) {
  const ins = '\n/* STUDENT_STATS_DESKTOP 数据总览桌面列数（base 提供 display 基础后补回，置于 media 之前避免被覆盖） */\n'
    + '.stats-panel { grid-template-columns: repeat(3, 1fr); }\n';
  s = s.replace(/(@media \(max-width: 768px\) \{)/, ins + '$1');
  fs.writeFileSync(root + 'student.css', s);
  console.log('student: 桌面 3 列已插入 media 之前');
} else {
  console.log('student: 桌面列数已存在，跳过');
}

console.log('DONE');
