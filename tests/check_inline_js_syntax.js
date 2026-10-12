/**
 * 前端内联脚本语法体检（不执行、只编译）
 *
 * 用途：改了 html 里的内联 <script> 后，快速确认语法没问题——
 *   HTML 里的脚本无法用 `node --check` 直接检查，这里把它们抽出来逐个编译。
 *   同时校验页面引用的外部 js 文件。
 *
 * 用法：node tests/check_inline_js_syntax.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const HTMLS = ['teacherPublishedProfile.html', 'login.html', 'student-landing.html', 'index.html', 'booking.html'];
const EXTRA_JS = ['js/teacherCardCarousel.js'];

let fail = 0;
let total = 0;

function compile(code, label) {
  total++;
  try {
    new vm.Script(code, { filename: label });
    console.log('  OK   ' + label);
  } catch (e) {
    fail++;
    console.log('  FAIL ' + label + ' → ' + e.message);
  }
}

HTMLS.forEach((f) => {
  const p = path.join(FRONTEND, f);
  if (!fs.existsSync(p)) return;
  const html = fs.readFileSync(p, 'utf8');
  console.log(f);
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    i++;
    if (!m[1].trim()) continue;
    compile(m[1], f + ' #' + i);
  }
  if (i === 0) console.log('  (无内联脚本)');
});

EXTRA_JS.forEach((rel) => {
  const p = path.join(FRONTEND, rel);
  if (!fs.existsSync(p)) return;
  compile(fs.readFileSync(p, 'utf8'), rel);
});

console.log('\n共 ' + total + ' 段，失败 ' + fail + ' 段');
process.exit(fail ? 1 : 0);
