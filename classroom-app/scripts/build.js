/**
 * 课堂独立 App · Web 产物构建脚本
 * ==================================================================
 * 流水线：
 *   1) sync.js        抽取课堂静态资源到 www/
 *   2) patch.js       把 FRONTEND-PATCHES 的 active 补丁打到 www 副本（原前端不动）
 *   3) 渲染 app-config.js（三套地址 + 运行时配置）
 *   4) 复制适配层（app-bridge / app-entry-guard / role-router / app.css）
 *   5) 给页面 <head> 注入脚本引用（幂等）
 *   6) 生成 capacitor.config.json（appId/appName/server.url）
 *
 * 用法：node classroom-app/scripts/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');
const WWW = path.join(APP_DIR, 'www');
const SRC = path.join(APP_DIR, 'src');
const CONFIG = require(path.join(APP_DIR, 'config', 'environments.js'));

function run(label, script, args) {
  console.log(label);
  execFileSync(process.execPath, [path.join(__dirname, script), ...(args || [])], { stdio: 'inherit' });
}

// ---- 1) 同步静态资源 ----
run('[1/6] 同步前端资源...', 'sync.js');
if (!fs.existsSync(WWW)) {
  console.error('www/ 未生成，构建终止');
  process.exit(1);
}

// ---- 2) 应用前端补丁（只打 www 副本）----
run('\n[2/6] 应用前端改动记录补丁...', 'patch.js');

// ---- 3) 生成 app-config.js ----
console.log('\n[3/6] 注入运行时配置...');
const tplPath = path.join(SRC, 'core', 'app-config.js');
let cfgTpl = fs.readFileSync(tplPath, 'utf8');
const runtimeConfig = {
  env: CONFIG.env,
  frontendOrigin: CONFIG.frontendOrigin || '',
  apiOrigin: CONFIG.apiOrigin || '',
  classroomApiOrigin: CONFIG.classroomApiOrigin || '',
  classroomWsOrigin: CONFIG.classroomWsOrigin || '',
  wsOrigin: CONFIG.classroomWsOrigin || '',
  classroomEmbed: CONFIG.classroomEmbed !== false,
  exitOnBack: CONFIG.exitOnBack !== false
};
const cfgJson = JSON.stringify(runtimeConfig, null, 2);
const cfgReplaced = cfgTpl.replace(/\/\* __APP_CONFIG__ \*\/[\s\S]*?\/\* __APP_CONFIG_END__ \*\//, cfgJson);
if (cfgReplaced === cfgTpl && !cfgTpl.includes('__APP_CONFIG_END__')) {
  console.error('app-config.js 占位符缺失，构建终止');
  process.exit(1);
}
fs.writeFileSync(path.join(WWW, 'app-config.js'), cfgReplaced, 'utf8');

// ---- 4) 复制适配层文件 ----
console.log('\n[4/6] 复制适配层...');
const copyMap = {
  'core/app-bridge.js': 'app-bridge.js',
  'core/app-entry-guard.js': 'app-entry-guard.js',
  'core/app-permissions.js': 'app-permissions.js',
  'core/role-router.js': 'role-router.js',
  'core/verify.js': 'verify.js',
  'styles/app.css': 'app.css'
};
Object.entries(copyMap).forEach(([from, to]) => {
  const src = path.join(SRC, from);
  if (!fs.existsSync(src)) {
    console.error('适配层文件缺失:', src);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(WWW, to));
  console.log('  ' + to);
});

// ---- 5) 注入页面 ----
console.log('\n[5/6] 注入桥接到 HTML...');
const MARKER = '<!-- classroom-app-injected -->';
const INJECT = MARKER + '\n'
  + '  <link rel="stylesheet" href="app.css">\n'
  + '  <script src="app-config.js"></script>\n'
  + '  <script src="app-bridge.js"></script>\n'
  + '  <script src="role-router.js"></script>\n';

// 启动页用新工程自己的版本；课堂页的 app-entry-guard 由 patch.js 单独注入。
const PAGES = ['login.html', 'student.html', 'teacher.html', 'classroom.html', 'classroom-prep.html'];

// 启动页 + 统一入口页覆盖（新工程自有页面，不参与注入，避免重复引用）
const OWN_PAGES = ['index.html', 'my-classroom.html', 'verify.html'];
OWN_PAGES.forEach((page) => {
  const src = path.join(SRC, 'pages', page);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(WWW, page));
    console.log(`  ${page}: 使用课堂 App 自有页面（已覆盖）`);
  }
});

PAGES.forEach((page) => {
  const p = path.join(WWW, page);
  if (!fs.existsSync(p)) { console.warn('  [跳过] 页面不存在:', page); return; }
  let html = fs.readFileSync(p, 'utf8');
  if (html.indexOf(MARKER) >= 0) { console.log('  ' + page + ': 已注入，跳过'); return; }
  if (html.indexOf('</head>') < 0) { console.warn('  [跳过] 未找到 </head>:', page); return; }
  html = html.replace('</head>', '  ' + INJECT + '  </head>');
  fs.writeFileSync(p, html, 'utf8');
  console.log('  ' + page + ': 已注入');
});

// ---- 6) 生成 capacitor.config.json ----
console.log('\n[6/6] 生成 Capacitor 配置...');
const capConfig = {
  appId: CONFIG.appId,
  appName: CONFIG.appName,
  webDir: CONFIG.webDir,
  ...(CONFIG.frontendOrigin ? { server: { url: CONFIG.frontendOrigin, androidScheme: 'https' } } : {}),
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: CONFIG.webviewDebugging
  },
  ios: {
    contentInset: 'always',
    webContentsDebuggingEnabled: CONFIG.webviewDebugging
  },
  plugins: {
    Browser: { toolbarColor: '#1f6feb' },
    App: {}
  }
};
fs.writeFileSync(
  path.join(APP_DIR, 'capacitor.config.json'),
  JSON.stringify(capConfig, null, 2) + '\n',
  'utf8'
);

console.log('\n构建完成。');
console.log('  运行模式:', CONFIG.frontendOrigin ? 'server（加载 ' + CONFIG.frontendOrigin + '）' : 'local（本地 www）');
console.log('  产物目录:', WWW);
console.log('\n后端地址三套（server 模式留空走同源代理）：');
console.log('  ① apiOrigin         =', CONFIG.apiOrigin || '(同源)');
console.log('  ② classroomApiOrigin =', CONFIG.classroomApiOrigin || '(同源)');
console.log('  ③ classroomWsOrigin  =', CONFIG.classroomWsOrigin || '(同源)');
