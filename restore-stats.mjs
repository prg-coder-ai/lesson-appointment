// 修复：base.css 抽取时误删了三端共享的 .stats-* / .table-* 布局（admin/student 桌面丢失 display:grid）
// 幂等：已含标记则跳过。
import * as fs from 'fs';
const root = 'frontend/css/';

// 1) base.css：补共享骨架（display 基础 + 卡片/文字/表格），用 theme token
const bp = root + 'base.css';
let b = fs.readFileSync(bp, 'utf8');
if (!b.includes('/* STATS_TABLE_SHARED */')) {
  b += '\r\n'
    + '/* STATS_TABLE_SHARED 数据总览/统计面板 + 表格 共享骨架（原三端逐字相同，统一抽入 base.css 作单一来源；列数由各页面 CSS 自行定义） */\r\n'
    + '.stats-panel { display: grid; gap: 20px; margin-bottom: 20px; }\r\n'
    + '.stats-item { padding: 20px; background: #fff; border-radius: 8px; box-shadow: var(--shadow-card); }\r\n'
    + '.stats-label { font-size: 14px; color: var(--text-light-color); margin-bottom: 8px; }\r\n'
    + '.stats-value { font-size: 24px; font-weight: 600; color: var(--text-color); margin-bottom: 8px; }\r\n'
    + '.stats-desc { font-size: 12px; color: #666; }\r\n'
    + '.table-container { padding-left: 20px; padding-right: 20px; overflow-x: auto; }\r\n'
    + '.data-table { width: 100%; border-collapse: collapse; }\r\n'
    + '.data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid var(--border-color); text-align: left; }\r\n'
    + '.data-table th { background: #f8f9fa; font-weight: 600; }\r\n';
  fs.writeFileSync(bp, b);
  console.log('base.css: 已补共享 stats/table 骨架');
} else {
  console.log('base.css: 已含共享块，跳过');
}

// 2) admin.css：补桌面 5 列（base 已提供 display/gap/margin）
const ap = root + 'admin.css';
let a = fs.readFileSync(ap, 'utf8');
if (!a.includes('/* ADMIN_STATS_COLS */')) {
  a += '\r\n/* ADMIN_STATS_COLS 数据总览桌面列数（base.css 抽取 display 基础后补回，修复桌面卡片堆叠回归） */\r\n'
    + '.stats-panel { grid-template-columns: repeat(5, 1fr); }\r\n';
  fs.writeFileSync(ap, a);
  console.log('admin.css: 已补桌面 5 列');
} else {
  console.log('admin.css: 已含桌面列数，跳过');
}

// 3) student.css：补桌面 3 列（原核心段缺列数，base 提供 display 后并排）
const sp = root + 'student.css';
let s = fs.readFileSync(sp, 'utf8');
if (!s.includes('/* STUDENT_STATS_COLS */')) {
  s += '\r\n/* STUDENT_STATS_COLS 数据总览桌面列数（base.css 抽取 display 基础后补回） */\r\n'
    + '.stats-panel { grid-template-columns: repeat(3, 1fr); }\r\n';
  fs.writeFileSync(sp, s);
  console.log('student.css: 已补桌面 3 列');
} else {
  console.log('student.css: 已含桌面列数，跳过');
}

// 4) teacher.css：桌面已有完整定义（121-147 行），无需改动
console.log('teacher.css: 不动（桌面定义完整）');
console.log('DONE');
