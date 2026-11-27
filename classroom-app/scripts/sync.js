/**
 * 课堂独立 App · 前端资源同步脚本
 * ==================================================================
 * 从主前端 frontend/ 按「课堂白名单」抽取静态资源到 classroom-app/www/。
 *
 * 设计原则（与 student-app 一致）：
 *   - 单一事实源：业务 JS/CSS 仍以 frontend/ 为准，本脚本只做机械复制，不改业务代码。
 *     需要改动的部分由 patch.js 打到 www 副本，原文件只读。
 *   - 白名单显式：课堂页 + 三角色入口 + 公共依赖，不含无关工作台代码。
 *   - 幂等：先清空 www/ 再复制。
 *
 * 用法：node classroom-app/scripts/sync.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const APP_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const WWW = path.join(APP_DIR, 'www');

// ---- 页面：登录 + 三角色入口 + 课堂本体 + 课前准备 ----
const PAGES = [
  'index.html',
  'login.html',
  'student.html',       // 学生工作台（含我的课堂入口）
  'teacher.html',       // 教师工作台（含我的课堂入口）
  'classroom.html',     // 课堂本体（师生管共用）
  'classroom-prep.html' // 课前设备检测（双模式）
];

// 以下均为相对 frontend/ 的「完整路径」，源与目标同路径。

// 公共脚本：鉴权、请求、术语、租户、领域桥、守卫等
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

// 三角色入口脚本（我的课堂 / 加入课堂 / 课前准备）
const ENTRY_JS = [
  'js/student-myClassroom.js',
  'js/student-joinClassroom.js',
  'js/teacher-myClassroom.js',
  'js/classroom/classroom-prep.js'
];

// 课堂本体脚本（含 rtc 子目录整体复制）
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
  'js/shared-domain-bridge.js',
  // 课堂 App 安装包下载（teacher.html / student.html 菜单 key="app_package" 共用）。
  // 依赖 window.ApiPaths.ENDPOINTS（shared-domain-bridge.js，head 中先加载）与 window.request；
  // 端点走 EP.*，不硬编码路径。漏此项会让页面脚本 404，switch 分支落到「模块未加载」兜底提示。
  'js/admin-appPackage.js'
];

// CSS
const CSS = [
  'css/scheduleTable.css',
  'css/theme.css',
  'css/base.css',
  'css/student.css',
  'css/classroom.css',
  'css/teacher.css'
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
console.log('同步课堂前端资源 -> classroom-app/www/');
console.log('  源:', FRONTEND);

if (!fs.existsSync(FRONTEND)) {
  console.error('找不到主前端目录，同步终止:', FRONTEND);
  process.exit(1);
}

if (fs.existsSync(WWW)) {
  fs.rmSync(WWW, { recursive: true, force: true });
}
ensureDir(WWW);

let copied = 0;
function batch(label, list) {
  let n = 0;
  list.forEach((f) => { if (copyFile(f)) n++; });
  copied += n;
  console.log(`  ${label}: ${n}/${list.length}`);
}

batch('页面', PAGES);
batch('公共脚本', PUBLIC_JS);
batch('三角色入口脚本', ENTRY_JS);
batch('课堂脚本', CLASSROOM_JS);
batch('其他脚本', EXTRA_JS);
batch('样式', CSS);
batch('vendor 文件', VENDOR_FILES);
batch('图片', IMAGES);

VENDOR_DIRS.forEach((d) => copyDir(d, d));
copyDir('js/classroom/rtc', 'js/classroom/rtc');

copyFile('favicon.ico', 'favicon.ico');
copyFile('css/common.css', 'css/common.css');

console.log(`同步完成，共复制 ${copied} 个文件（另含 vendor/rtc 目录）。`);
