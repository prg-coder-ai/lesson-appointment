/**
 * 学生端前端资源同步脚本
 * ==================================================================
 * 从仓库主前端 frontend/ 中，按「学生端白名单」抽取所需文件到 student-app/www/。
 *
 * 设计原则：
 *   - 单一事实源：业务 JS/CSS 仍以 frontend/ 为准，本脚本只做机械复制，不改写业务代码。
 *     这样主前端修复 bug 后，重跑本脚本即可同步，不会在 student-app 里产生第二份分叉实现。
 *   - 白名单显式：只拷学生端运行所需，避免把 admin/teacher 端代码打进 App 包。
 *   - 幂等：先清空 www/ 再复制，重复执行结果一致。
 *
 * 用法：node student-app/scripts/sync.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 以脚本位置反推仓库根，避免依赖 cwd
const SCRIPT_DIR = __dirname;
const APP_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const WWW = path.join(APP_DIR, 'www');

// ---- 学生端文件白名单（相对 frontend/）----
// 页面：学生工作台 + 登录入口 + 课堂（课堂页在 App 里通过桥接内嵌）
const PAGES = [
  'index.html',
  'login.html',
  'student.html',
  'classroom.html'
];

// 以下列表均为相对 frontend/ 的「完整路径」，源与目标同路径（copyFile 不做映射）。

// 公共脚本：登录、鉴权、请求、术语、租户、领域桥等（学生端页面实际引用的全集）
const PUBLIC_JS = [
  'js/public/api.js',
  'js/public/auth.js',
  'js/public/utility_request.js',
  'js/public/termsFunction.js',
  'js/public/documentTitle.js',
  'js/public/enumTerms.js',
  'js/public/workLanguage.js',
  'js/public/pagefoot.js',
  'js/public/feature-flags.js',
  'js/public/ui-kit.js',
  'js/public/dataFunctions.js',
  'js/public/courseAndBooking.js',
  'js/public/appointmentNotes.js',
  'js/public/login-guard.js',
  'js/public/promo.js',
  'js/public/missingPageGuard.js',
  'js/public/my-classroom-core.js',
  'js/public/classroom-ws.js',
  'js/public/qrcode.min.js'
];

// 学生端业务脚本
const STUDENT_JS = [
  'js/student-bookingCards.js',
  'js/student-bookingBrowserCards.js',
  'js/student-myClassroom.js',
  'js/student-joinClassroom.js',
  'js/student-lessonBalance.js',
  'js/student-profile.js'
];

// 课堂脚本（内嵌页需要）+ 其 rtc 子目录整体复制
const CLASSROOM_JS = [
  'js/classroom/media-devices.js',
  'js/classroom/classroom-rtc.js',
  'js/classroom/classroom-record.js',
  'js/classroom/classroom-whiteboard.js',
  'js/classroom/classroom-material.js',
  'js/classroom/classroom-panels.js',
  'js/classroom/classroom-video-focus.js',
  'js/classroom/classroom-chat.js',
  'js/classroom/classroom-controls.js',
  'js/classroom/classroom-teacher.js',
  'js/classroom/classroom-student.js',
  'js/classroom/classroom-admin.js',
  'js/classroom/classroom-main.js'
];

// 其他页面引用但要一起带的脚本
const EXTRA_JS = [
  'js/admin-AppointmentNotes.js',
  'js/messages-inbox.js',
  'js/shared-domain-bridge.js'
];

// CSS
const CSS = [
  'css/scheduleTable.css',
  'css/theme.css',
  'css/base.css',
  'css/student.css',
  'css/classroom.css'
];

// 第三方 vendor：目录整体复制（字体、pdf worker 等有相对路径依赖）
const VENDOR_DIRS = ['js/public/vendor/font-awesome'];
const VENDOR_FILES = [
  'js/public/vendor/axios.min.js',
  'js/public/vendor/fullcalendar.min.js',
  'js/public/vendor/html2canvas.min.js',
  'js/public/vendor/pdf.min.js',
  'js/public/vendor/pdf.worker.min.js'
];

// 图片 + favicon
const IMAGES = ['images/admin_icon.jpg', 'images/student_icon.jpg', 'images/teacher_icon.jpg'];

// ---- 工具函数 ----
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function copyFile(relFrom, relTo) {
  const from = path.join(FRONTEND, relFrom);
  const to = path.join(WWW, relTo || relFrom);
  if (!fs.existsSync(from)) {
    console.warn('  [跳过] 源文件不存在:', relFrom);
    return false;
  }
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return true;
}

function copyDir(relFrom, relTo) {
  const from = path.join(FRONTEND, relFrom);
  const to = path.join(WWW, relTo || relFrom);
  if (!fs.existsSync(from)) {
    console.warn('  [跳过] 源目录不存在:', relFrom);
    return;
  }
  fs.cpSync(from, to, { recursive: true });
}

// ---- 执行 ----
console.log('同步学生端前端资源 -> student-app/www/');
console.log('  源:', FRONTEND);

if (!fs.existsSync(FRONTEND)) {
  console.error('找不到主前端目录，同步终止:', FRONTEND);
  process.exit(1);
}

// 清空 www（保留 build.js 会重新生成的注入文件即可，这里全清更干净）
if (fs.existsSync(WWW)) {
  fs.rmSync(WWW, { recursive: true, force: true });
}
ensureDir(WWW);

let copied = 0;
function batch(label, list, toFn) {
  let n = 0;
  list.forEach((f) => {
    if (copyFile(f, toFn ? toFn(f) : f)) n++;
  });
  copied += n;
  console.log(`  ${label}: ${n}/${list.length}`);
}

batch('页面', PAGES);
batch('公共脚本', PUBLIC_JS);
batch('学生端脚本', STUDENT_JS);
batch('课堂脚本', CLASSROOM_JS);
batch('其他脚本', EXTRA_JS);
batch('样式', CSS);
batch('vendor 文件', VENDOR_FILES);
batch('图片', IMAGES);

VENDOR_DIRS.forEach((d) => copyDir(d, d));
copyDir('js/classroom/rtc', 'js/classroom/rtc');

// favicon（存在则拷）
copyFile('favicon.ico', 'favicon.ico');

// common.css 在 login.html 里以 /css/common.css 引用，主前端可能没有该文件；有则拷
copyFile('css/common.css', 'css/common.css');

console.log(`同步完成，共复制 ${copied} 个文件（另含 vendor/rtc 目录）。`);
console.log('下一步：node student-app/scripts/build.js');
