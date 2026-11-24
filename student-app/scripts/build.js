/**
 * 一码多端 · Web 产物构建脚本
 * ==================================================================
 * 流水线：
 *   1) 调用 sync.js 抽取学生端静态资源到 www/
 *   2) 把 config/environments.js 渲染成 www/app-config.js（替换占位符）
 *   3) 复制 app-bridge.js / app.css 到 www/
 *   4) 给 4 个页面 <head> 注入 <script>/<link>（幂等：有标记则跳过）
 *   5) 生成/刷新 capacitor.config.json（appId、appName、webDir、server.url）
 *
 * 用法：node student-app/scripts/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');
const WWW = path.join(APP_DIR, 'www');
const SRC = path.join(APP_DIR, 'src');
const CONFIG = require(path.join(APP_DIR, 'config', 'environments.js'));

// ---- 1) 同步静态资源 ----
console.log('[1/5] 同步前端资源...');
execFileSync(process.execPath, [path.join(__dirname, 'sync.js')], { stdio: 'inherit' });

if (!fs.existsSync(WWW)) {
  console.error('www/ 未生成，构建终止');
  process.exit(1);
}

// ---- 2) 生成 app-config.js ----
console.log('[2/5] 注入运行时配置...');
const tplPath = path.join(SRC, 'core', 'app-config.js');
let cfgTpl = fs.readFileSync(tplPath, 'utf8');
const runtimeConfig = {
  env: CONFIG.env,
  frontendOrigin: CONFIG.frontendOrigin || '',
  apiOrigin: CONFIG.apiOrigin || '',
  wsOrigin: CONFIG.wsOrigin || '',
  classroomEmbed: true,
  exitOnBack: false
};
const cfgJson = JSON.stringify(runtimeConfig, null, 2);
cfgTpl = cfgTpl.replace(/\/\* __APP_CONFIG__ \*\/[\s\S]*?\/\* __APP_CONFIG_END__ \*\//, cfgJson);
fs.writeFileSync(path.join(WWW, 'app-config.js'), cfgTpl, 'utf8');

// ---- 3) 复制桥接文件 ----
console.log('[3/5] 复制适配层...');
fs.copyFileSync(path.join(SRC, 'core', 'app-bridge.js'), path.join(WWW, 'app-bridge.js'));
fs.copyFileSync(path.join(SRC, 'styles', 'app.css'), path.join(WWW, 'app.css'));

// ---- 4) 注入到页面 ----
console.log('[4/5] 注入桥接到 HTML...');
const MARKER = '<!-- app-bridge-injected -->';
// 注入点：</head> 前。桥需要在 shared-domain-bridge 之后；但页面 head 里通常已加载 shared-domain-bridge，
// 若没有，app-bridge.js 内部有 DOMContentLoaded 兜底重试，顺序安全。
const INJECT = MARKER + '\n'
  + '  <link rel="stylesheet" href="app.css">\n'
  + '  <script src="app-config.js"></script>\n'
  + '  <script src="app-bridge.js"></script>\n';

const PAGES = ['index.html', 'login.html', 'student.html', 'classroom.html'];
// index.html 用的是 student-app 自己的启动页，不需要重复注入（它已显式引用）
PAGES.forEach((page) => {
  const p = path.join(WWW, page);
  if (!fs.existsSync(p)) {
    console.warn('  [跳过] 页面不存在:', page);
    return;
  }
  let html = fs.readFileSync(p, 'utf8');
  if (page === 'index.html') {
    // 启动页由 src/pages/index.html 提供，覆盖同步来的版本
    fs.copyFileSync(path.join(SRC, 'pages', 'index.html'), p);
    console.log('  ' + page + ': 使用一码多端启动页');
    return;
  }
  if (html.indexOf(MARKER) >= 0) {
    console.log('  ' + page + ': 已注入，跳过');
    return;
  }
  if (html.indexOf('</head>') < 0) {
    console.warn('  [跳过] 未找到 </head>:', page);
    return;
  }
  html = html.replace('</head>', '  ' + INJECT + '  </head>');
  fs.writeFileSync(p, html, 'utf8');
  console.log('  ' + page + ': 已注入');
});

// ---- 5) 生成 capacitor.config.json ----
console.log('[5/5] 生成 Capacitor 配置...');
const capConfig = {
  appId: CONFIG.appId,
  appName: CONFIG.appName,
  webDir: CONFIG.webDir,
  // server 模式：frontendOrigin 非空时WebView直接加载线上前端（同源、零改动）
  // local 模式：不写 server 节点，加载本地 www
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
    Browser: { toolbarColor: '#1f6feb' }
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
console.log('\n后续：');
console.log('  npm install');
console.log('  npx cap add android   # 或 ios');
console.log('  npx cap sync');
