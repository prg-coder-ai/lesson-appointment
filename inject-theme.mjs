import fs from 'fs';
import path from 'path';
const root = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend';
// 这些页面使用了 admin/student/teacher 三套页面 CSS，需在页面 CSS 之前引入 theme.css
const htmls = ['admin.html', 'auditLog.html', 'platform_admin.html', 'logBrowser.html',
  'teacherInfo.html', 'student.html', 'teacher.html'];
for (const h of htmls) {
  const p = path.join(root, h);
  if (!fs.existsSync(p)) { console.log('skip (absent)', h); continue; }
  let s = fs.readFileSync(p).toString('utf8');
  if (s.includes('css/theme.css')) { console.log('already linked', h); continue; }
  // 在第一个页面 CSS link 之前插入 theme.css
  const re = /(<link[^>]*href="css\/(?:admin|student|teacher)\.css"[^>]*>)/;
  if (!re.test(s)) { console.log('no page-css link found', h); continue; }
  s = s.replace(re, '  <link rel="stylesheet" href="css/theme.css">\n  $1');
  fs.writeFileSync(p, Buffer.from(s, 'utf8'));
  console.log('linked theme.css in', h);
}
