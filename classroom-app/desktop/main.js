/**
 * 云课堂桌面版主进程（Windows / macOS / Linux）
 * ==========================================================================
 * 为什么是 Electron 而不是 Capacitor：
 *   Capacitor 官方只有 iOS / Android 两个 target，**没有桌面**。Windows 桌面
 *   只能另选壳。备选 Tauri 体积更小，但要 Rust 工具链 + WebView2 运行时，
 *   且 WebSocket 代理需另写；本项目已有完整 www 静态包，Electron 是最短路径。
 *
 * 为什么开本地 HTTP server 而不是 loadFile：
 *   file:// 不是安全上下文 → navigator.mediaDevices 为 undefined → 课堂采不到
 *   摄像头/麦克风。http://127.0.0.1 是安全上下文，getUserMedia 正常。
 *   （详见 server.js 头部注释）
 *
 * 职责边界：本文件只管「找一个空闲端口 → 起 server → 开窗口 → 放行设备权限」，
 * 静态服务与 API/WS 分流全在 server.js，可用 node 单独验证。
 */
'use strict';
const { app, BrowserWindow, shell, session, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { createAppServer } = require('./server');

/* ══════════════════ 路径解析（开发态 / 打包后） ══════════════════ */
function configPath() {
  const dev = path.join(__dirname, 'config.json');
  if (fs.existsSync(dev)) return dev;                       // 开发：desktop/config.json
  return path.join(process.resourcesPath, 'config.json');   // 打包：<resources>/config.json
}

function resolveWww() {
  const dev = path.resolve(__dirname, '../www');
  if (fs.existsSync(path.join(dev, 'launch.html'))) return dev;
  const packed = path.join(process.resourcesPath, 'www');   // extraResources 带进来的
  if (fs.existsSync(path.join(packed, 'launch.html'))) return packed;
  throw new Error('找不到 www（其中必须有 launch.html）。先执行：node ../scripts/build.js');
}

const CFG = JSON.parse(fs.readFileSync(configPath(), 'utf8'));

/* ══════════════════ 窗口 ══════════════════ */
let mainWindow = null;
let appServer = null;
let listenPort = 0;

function createWindow() {
  const w = CFG.window || {};
  mainWindow = new BrowserWindow({
    width: w.width || 1280,
    height: w.height || 800,
    minWidth: w.minWidth || 960,
    minHeight: w.minHeight || 640,
    title: CFG.appName || '云课堂',
    backgroundColor: '#f5f7fa',
    autoHideMenuBar: true,
    webPreferences: {
      // 纯前端静态包，不需要任何 Node 能力；三项全关是桌面壳的安全底线
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  // 外链（回放、帮助页等）交系统浏览器，不在壳里开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL('http://127.0.0.1:' + listenPort + '/' + (CFG.startPage || 'launch.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.env.CLASSROOM_DESKTOP_DEV === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/* ══════════════════ 启动 ══════════════════ */
app.whenReady().then(async () => {
  // 摄像头 / 麦克风：Electron 默认不允许，必须显式放行，否则课堂无法开采集。
  // permission 传进来的是字符串（不是对象），这里直接按白名单判断。
  const ALLOW = ['media', 'mediaKeySystem', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(ALLOW.indexOf(permission) !== -1);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    return ALLOW.indexOf(permission) !== -1;
  });

  try {
    const made = createAppServer({ wwwDir: resolveWww(), config: CFG });
    appServer = made.server;
    await new Promise((resolve, reject) => {
      appServer.once('error', reject);
      appServer.listen(0, '127.0.0.1', () => {   // 0 = 由系统分配空闲端口，避免固定端口冲突
        listenPort = appServer.address().port;
        resolve();
      });
    });
    console.log('[classroom-desktop] serving ' + made.wwwDir + ' on http://127.0.0.1:' + listenPort);
    createWindow();
  } catch (e) {
    dialog.showErrorBox('云课堂启动失败', String((e && e.message) || e));
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (appServer) { try { appServer.close(); } catch (e) { /* ignore */ } appServer = null; }
  if (process.platform !== 'darwin') app.quit();   // macOS 习惯：关窗不退出
});
