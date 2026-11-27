/**
 * 屏幕区域录制器 · Electron 主进程
 *
 * 与浏览器版的差异：
 *  1. 用 desktopCapturer 枚举窗口，前端可下拉选择，不再弹系统选择器
 *  2. setDisplayMediaRequestHandler 直接授权选中的源（零弹窗）
 *  3. audio: 'loopback' 采集系统声音（Windows WASAPI 回环）
 *  4. 绿色版：用户数据写到 exe 同级目录，不污染 %APPDATA%
 */
'use strict';

const { app, BrowserWindow, session, desktopCapturer, ipcMain, Menu, shell, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_TITLE = '屏幕区域录制器';

/* ---------------------------------------------------------
 * 自定义协议 app://
 * 必须在 app ready 之前声明。作用是把页面从 file:// 迁到
 * 一个 secure context，这样 fetch / Worker / WebAssembly
 * 才能正常加载内置的 FFmpeg 引擎（file:// 下会被安全策略拦截）。
 * -------------------------------------------------------*/
const APP_SCHEME = 'app';
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

/* ---------------------------------------------------------
 * 启动跟踪：写到 %TEMP%，即使 userData 还没就绪也能记录
 * 排查"双击没反应"时看这个文件
 * -------------------------------------------------------*/
const TRACE_FILE = path.join(process.env.TEMP || process.env.TMP || '.', 'screenrec-trace.log');
function trace(msg) {
  try {
    fs.appendFileSync(TRACE_FILE, new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) { /* ignore */ }
}
// 每次启动覆盖，避免日志无限增长
try { fs.writeFileSync(TRACE_FILE, ''); } catch (e) { /* ignore */ }
trace('=== boot pid=' + process.pid + ' portable=' + (process.env.PORTABLE_EXECUTABLE_DIR || '-') + ' ===');
process.on('uncaughtException', (err) => trace('uncaughtException: ' + (err && err.stack || err)));
process.on('unhandledRejection', (err) => trace('unhandledRejection: ' + (err && err.stack || err)));

/* ---------------------------------------------------------
 * 数据目录：优先放在程序自己旁边，做到不留痕迹
 *  1) portable 单文件：运行时解压到临时目录，用注入的 exe 真实位置
 *  2) 绿色目录版：exe 同级可写就写在同级
 *  3) 都不可用（如装在 Program Files）：回落到 %APPDATA%
 * -------------------------------------------------------*/
function resolveDataDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'ScreenRecorderData');
  }
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    // 开发模式（electron.exe 在 node_modules 里）不启用，避免污染工程目录
    if (exeDir.indexOf('node_modules') >= 0) return null;
    fs.accessSync(exeDir, fs.constants.W_OK);   // 不可写会抛错
    return path.join(exeDir, 'ScreenRecorderData');
  } catch (err) {
    return null;
  }
}

const DATA_DIR = resolveDataDir();
if (DATA_DIR) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    app.setPath('userData', DATA_DIR);
    // 缓存也一并搬走，避免 %APPDATA% 残留
    app.setPath('sessionData', DATA_DIR);
  } catch (err) {
    // 无写权限时静默回落到默认路径
    console.warn('[data] 无法写入程序同级目录，改用默认 userData:', err.message);
  }
}

let mainWin = null;
let pickedSourceId = null;   // 渲染层选定的窗口 id，如 "window:12345:0"
let pickedAudio = false;     // 本次捕获是否需要系统声音

/**
 * 出错时写文件：绿色版的 stdout 在 Windows GUI 下看不到，
 * 排查问题看 <userData>/error.log 即可
 */
function logErr(tag) {
  try {
    const args = Array.prototype.slice.call(arguments, 1);
    const p = path.join(app.getPath('userData'), 'error.log');
    const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    fs.appendFileSync(p, '[' + new Date().toISOString() + '] ' + tag + ' ' + text + '\n');
  } catch (e) { /* 写不了就算了 */ }
}

/** 启动标记：确认窗口确实起来了 */
function markStarted(ok) {
  try {
    const p = path.join(app.getPath('userData'), 'startup.log');
    fs.writeFileSync(p, (ok ? 'OK' : 'FAIL') + ' ' + new Date().toISOString() + '\n');
  } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------
 * 单实例锁：绿色版常被重复双击，避免开出多个窗口
 * -------------------------------------------------------*/
if (!app.requestSingleInstanceLock()) {
  trace('singleInstanceLock 获取失败，退出');
  app.quit();
} else {
  trace('singleInstanceLock OK');

  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.whenReady().then(() => {
    trace('whenReady');
    bootstrap();
  }).catch((err) => {
    trace('whenReady rejected: ' + (err && err.stack || err));
  });

  app.on('window-all-closed', () => {
    // Windows 上直接退出，不留后台进程
    app.quit();
  });
}

/* ---------------------------------------------------------
 * 启动装配
 * -------------------------------------------------------*/
function bootstrap() {
  try {
    trace('bootstrap start, userData=' + app.getPath('userData'));
    Menu.setApplicationMenu(null);   // 去掉菜单栏，更像原生工具
    installAppProtocol();
    installDisplayMediaHandler();
    installDownloadHandler();
    registerIpc();
    createWindow();
    trace('bootstrap done');
  } catch (err) {
    trace('bootstrap error: ' + (err && err.stack || err));
    throw err;
  }
}

/* ---------------------------------------------------------
 * app:// 静态资源服务：把 asar 内的文件按 MIME 返回
 * -------------------------------------------------------*/
const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function installAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      // app://local/a/b.js → a/b.js
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!rel) rel = 'screen-region-recorder.html';

      const filePath = path.join(__dirname, rel);
      // 防目录穿越
      if (!filePath.startsWith(__dirname)) {
        return new Response('Forbidden', { status: 403 });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      // HEAD 只回头信息，避免为了探测把 31MB 的 wasm 整个读出来
      if (request.method === 'HEAD') {
        const st = await fs.promises.stat(filePath);
        return new Response(null, {
          status: 200,
          headers: { 'content-type': contentType, 'content-length': String(st.size) }
        });
      }

      const data = await fs.promises.readFile(filePath);
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'content-type': contentType,
          'content-length': String(data.length),
          'cache-control': 'no-cache'
        }
      });
    } catch (err) {
      trace('[protocol] 404 ' + request.url + ' ' + err.message);
      return new Response('Not Found', { status: 404 });
    }
  });
}

/**
 * 核心：拦截 getDisplayMedia，直接返回前端选定的源
 * 必须把 useSystemPicker 设为 false，否则系统选择器会绕过我们的逻辑
 */
function installDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      // 只要 id，不要缩略图：thumbnailSize 置 0 可跳过截图开销
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      if (!sources.length) {
        callback(null);
        return;
      }

      let target = null;
      if (pickedSourceId) {
        target = sources.find((s) => s.id === pickedSourceId);
      }

      // 选中的窗口可能已被关闭，回落到第一个源并告知前端
      if (!target) {
        target = sources[0];
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('source-fallback', target.name);
        }
      }

      const grant = { video: target };
      if (pickedAudio) grant.audio = 'loopback';
      callback(grant);
    } catch (err) {
      console.error('[capture] 获取捕获源失败:', err);
      callback(null);
    }
  }, { useSystemPicker: false });
}

/** 让 <a download> 弹出系统保存对话框，而不是静默存到下载目录 */
function installDownloadHandler() {
  session.defaultSession.on('will-download', (event, item) => {
    try {
      item.setSaveDialogOptions({
        title: '保存录制文件',
        defaultPath: item.getFilename()
      });
    } catch (err) {
      /* 老版本不支持时忽略，Electron 会走默认行为 */
    }
  });
}

function registerIpc() {
  // 枚举可捕获的窗口 / 屏幕（带缩略图，供前端列表展示）
  ipcMain.handle('list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });

    // 过滤掉本程序自己的窗口，避免"套娃"
    const selfId = mainWin && !mainWin.isDestroyed() && mainWin.getMediaSourceId
      ? mainWin.getMediaSourceId()
      : '';

    return sources
      .filter((s) => s.id !== selfId && !String(s.name || '').includes(APP_TITLE))
      .map((s) => ({
        id: s.id,
        name: s.name || '(未命名窗口)',
        isScreen: s.id.startsWith('screen'),
        thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
      }));
  });

  // 记录前端选定的源与音频需求
  ipcMain.handle('set-source', (_event, id, wantAudio) => {
    pickedSourceId = id || null;
    pickedAudio = !!wantAudio;
    return true;
  });
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1340,
    height: 940,
    minWidth: 980,
    minHeight: 700,
    title: APP_TITLE,
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 录制长时任务，禁用后台节流，避免切到后台掉帧
      backgroundThrottling: false
    }
  });

  mainWin.once('ready-to-show', () => {
    mainWin.show();
    markStarted(true);
    trace('ready-to-show');
    console.log('[startup] window shown');
  });
  mainWin.loadURL(APP_SCHEME + '://local/screen-region-recorder.html');
  trace('loadURL app://local/screen-region-recorder.html');

  mainWin.webContents.on('did-finish-load', () => trace('did-finish-load'));

  /* ---------- 排错用：把渲染进程的异常记录到 error.log ---------- */
  // Electron 45 起只传一个事件对象，使用旧的多参数签名会触发弃用警告
  mainWin.webContents.on('console-message', (event) => {
    const msg = event && event.message;
    const lv = event && event.level;
    if (!msg) return;
    console.log('[renderer]', msg);
    trace('[renderer] ' + msg);
    if (lv === 'warning' || lv === 'error') logErr('[renderer]', msg);
  });
  mainWin.webContents.on('preload-error', (_e, preloadPath, error) => {
    logErr('[preload-error]', preloadPath, String(error && error.stack || error));
    console.error('[preload-error]', preloadPath, error);
  });
  mainWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logErr('[did-fail-load]', code, desc, url);
    console.error('[did-fail-load]', code, desc, url);
  });
  mainWin.webContents.on('render-process-gone', (_e, details) => {
    logErr('[render-process-gone]', details);
    console.error('[render-process-gone]', details);
  });

  // 页面里的外链一律交给系统浏览器，不在应用内跳转
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}
