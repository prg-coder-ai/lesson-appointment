/**
 * 桌面版内置 server（纯 Node，不依赖 electron）
 * ==========================================================================
 * 独立成模块的两个理由：
 *   1) 可以脱离 Electron 用 node 直接跑，CI 与本地都能验证静态服务与分流；
 *   2) main.js 只负责窗口，职责清晰。
 *
 * 架构：一个 127.0.0.1 上的 HTTP server，同时承担
 *   · 静态：把 classroom-app/www 当站点根（页面是裸相对路径，必须按站点根解析）
 *   · 同源代理：/api/v1/* 与 /ws/classrooms/* 按清单转发到三个后端
 *
 * 为什么不直接 loadFile('www/launch.html')：
 *   file:// 不是安全上下文 → navigator.mediaDevices 为 undefined → 课堂采不到
 *   摄像头/麦克风。http://127.0.0.1 是安全上下文，getUserMedia 正常。
 *
 * ⚠ 分流清单必须与 doc-develop/90-tools/dev-proxy.js 的 PREFIXES、
 *   deploy/nginx/booking*.conf 三处一致；改动同步，仓库根有 npm run check:proxy。
 */
'use strict';
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');

/* ---------- 分流清单（与 dev-proxy.js / nginx 保持一致）---------- */
const MSG_PREFIXES = ['/api/v1/message', '/api/v1/sse', '/api/v1/users/', '/api/v1/sensitive'];
// 课堂 WebSocket 三通道（heartbeat / signal / whiteboard）：
//   /ws/classrooms/<scheduleId>/<channel>?access_token=…&traceId=…
// ★ 这条路径不在 /api 下，2026-11-26 首次做桌面端时漏了，后果很重：
//   upstreamOf 返回 null → proxyWs 第一行就 socket.destroy()，WS 永远建不起来，
//   课堂页一直显示「连接中断，正在重连…」。而浏览器访问 8080 是正常的
//   （dev-proxy 用 urlPath.startsWith('/ws/') 判定），生产 nginx 也有
//   /ws/classrooms/ 的 location —— 所以这个坑只出现在 exe 里，极易误判成网络问题。
//   判定口径与 dev-proxy 保持一致：所有 /ws/ 都归课堂上游。
const WS_PREFIXES = ['/ws/'];
const CLS_PREFIXES = [
  '/api/v1/classrooms/',
  '/api/v1/attendance/',
  '/api/v1/recordings/',
  '/api/v1/uploads/',
  '/api/v1/files/',
  '/api/v1/schedules/',
  '/api/v1/rtc/',
  '/api/v1/admin/classrooms/',
  '/api/v1/admin/monitor/',
  '/api/v1/admin/reports/',
  '/api/v1/admin/reconcile/',
  '/api/v1/admin/audit/',
  '/api/v1/admin/contract/',
  '/api/v1/admin/exports/',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.map': 'application/json',
};

/**
 * 路径 → 上游服务（纯函数，模块级）。
 *
 * 之所以提到模块级并导出，而不是留在 createAppServer 闭包里：
 * 分流清单是「三处必须一致」的东西（dev-proxy / nginx / 这里的 server.js），
 * 前两者有 tools/check-proxy-routes.mjs 守着，只有本文件漏在外面 ——
 * 2026-11-26 就因为漏了 /ws/ 导致 exe 里课堂一直「连接中断，正在重连…」，
 * 而浏览器与生产都正常。导出后守卫可以直接调这份实现，不必再抄一份清单。
 *
 * @param {string} rawPath 含 query 的请求路径
 * @param {object} UP      config.upstream（{api,message,classroom}）
 * @returns {object|null}  命中的上游配置；null 表示非 API，走静态文件
 */
function resolveUpstream(rawPath, UP) {
  const p = String(rawPath || '').split('?')[0];
  if (p === '/api/v1/admin/classrooms') return UP.classroom || null;   // 无尾斜杠的精确端点
  for (const x of MSG_PREFIXES) if (p === x || p.startsWith(x)) return UP.message || null;
  // WS 必须在 /api 兜底之前判：/ws/... 不带 /api 前缀，落到兜底会走错上游或返回 null
  for (const x of WS_PREFIXES) if (p.startsWith(x)) return UP.classroom || null;
  for (const x of CLS_PREFIXES) if (p.startsWith(x)) return UP.classroom || null;
  if (p.startsWith('/api/') || p.startsWith('/actuator/')) return UP.api || null;
  return null;
}

/**
 * @param {{wwwDir:string, config:object}} opts
 * @returns {{server:http.Server, upstreamOf:Function, wwwDir:string}}
 */
function createAppServer(opts) {
  const WWW = path.resolve(opts.wwwDir);
  const CFG = opts.config || {};
  const UP = CFG.upstream || {};
  const START_PAGE = CFG.startPage || 'launch.html';

  if (!fs.existsSync(path.join(WWW, 'launch.html'))) {
    throw new Error('www 目录里没有 launch.html：' + WWW + '（先跑 node scripts/build.js）');
  }

  /** 路径 → 上游；返回 null 表示非 API，走静态 */
  function upstreamOf(rawPath) {
    return resolveUpstream(rawPath, UP);
  }

  function upstreamOpts(up) {
    const isHttps = String(up.protocol || 'https').toLowerCase() === 'https';
    return {
      isHttps,
      host: up.host,
      port: up.port || (isHttps ? 443 : 80),
      hostHeader: up.hostHeader || up.host,
    };
  }

  function serveStatic(req, res) {
    let p;
    try { p = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]); }
    catch (e) { res.writeHead(400); res.end('bad request'); return; }
    if (p === '/' || p === '') p = '/' + START_PAGE;

    const abs = path.normalize(path.join(WWW, p));
    // 目录穿越防护
    if (abs !== WWW && !abs.startsWith(WWW + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }
    fs.readFile(abs, (err, buf) => {
      if (err) {
        // 与生产 nginx 同语义：www 没有就干净 404，不兜登录页
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found: ' + p);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    });
  }

  function proxyHttp(req, res, up) {
    if (!up || !up.host) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('上游未配置：检查 config.json 的 upstream');
      return;
    }
    const o = upstreamOpts(up);
    const mod = o.isHttps ? https : http;
    const method = req.method || 'GET';
    const rawUrl = req.url || '';
    const urlForLog = rawUrl.length > 96 ? rawUrl.slice(0, 96) + '…' : rawUrl;
    // 无请求体才允许重试（body 是流，重放不了）
    const hasBody = !!(req.headers['content-length'] && req.headers['content-length'] !== '0')
      || !!req.headers['transfer-encoding'];
    const retryable = !hasBody && (method === 'GET' || method === 'HEAD' || method === 'OPTIONS');

    let current = null;
    let clientAborted = false;

    const forward = (triesLeft) => {
      const preq = mod.request({
        protocol: o.isHttps ? 'https:' : 'http:',
        hostname: o.host,
        port: o.port,
        method,
        path: rawUrl,
        headers: Object.assign({}, req.headers, { host: o.hostHeader }),
        rejectUnauthorized: false,   // 允许内网自签证书
      }, (pres) => {
        res.writeHead(pres.statusCode || 502, pres.headers);
        pres.pipe(res);
      });
      current = preq;

      preq.on('error', (e) => {
        const code = e.code || '';
        // 客户端先断开（关窗口 / 切页 / 取消上传）：销毁上游时的 ECONNRESET 不是故障
        if (clientAborted || req.destroyed) {
          if (process.env.DESKTOP_VERBOSE) {
            console.log(`[upstream aborted] ${method} ${urlForLog} ${code}`);
          }
          return;
        }
        // 残留 keep-alive 连接被对端关闭：无 body 请求重试一次
        if (retryable && triesLeft > 0 && (code === 'ECONNRESET' || code === 'EPIPE')) {
          console.warn(`[upstream retry] ${method} ${urlForLog} -> ${code}`);
          forward(triesLeft - 1);
          return;
        }
        console.error(`[upstream error] ${method} ${urlForLog} -> ${o.host}:${o.port} ${code} ${e.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('上游错误：' + e.message);
        } else {
          res.destroy();
        }
      });

      if (hasBody) req.pipe(preq); else preq.end();
    };

    res.on('close', () => {
      if (!res.writableFinished) clientAborted = true;
      if (current) current.destroy();
    });

    forward(1);
  }

  function proxyWs(req, socket, head) {
    const up = upstreamOf(req.url);
    if (!up || !up.host) { socket.destroy(); return; }
    const o = upstreamOpts(up);

    const onConn = () => {
      let raw = req.method + ' ' + req.url + ' HTTP/1.1\r\n';
      const h = req.headers;
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() === 'host') continue;
        const v = h[k];
        if (Array.isArray(v)) for (const one of v) raw += k + ': ' + one + '\r\n';
        else raw += k + ': ' + v + '\r\n';
      }
      raw += 'Host: ' + o.hostHeader + '\r\n\r\n';
      conn.write(raw);
      if (head && head.length) conn.write(head);
      socket.pipe(conn);
      conn.pipe(socket);
    };

    const conn = o.isHttps
      ? tls.connect({ host: o.host, port: o.port, servername: o.host, rejectUnauthorized: false }, onConn)
      : net.connect(o.port, o.host, onConn);

    conn.on('error', () => socket.destroy());
    socket.on('error', () => conn.destroy());
    conn.on('close', () => socket.destroy());
    socket.on('close', () => conn.destroy());
  }

  const server = http.createServer((req, res) => {
    const up = upstreamOf(req.url);
    if (up) proxyHttp(req, res, up);
    else serveStatic(req, res);
  });
  server.on('upgrade', (req, socket, head) => proxyWs(req, socket, head));

  return { server, upstreamOf, wwwDir: WWW };
}

module.exports = { createAppServer, resolveUpstream, MSG_PREFIXES, CLS_PREFIXES, WS_PREFIXES };

/* ---------- 单跑入口：node server.js [端口] ----------
 * 不启 Electron，直接把同一套静态+代理跑起来，方便：
 *   · 用浏览器验证页面渲染（无需装 GUI）
 *   · 对比「桌面壳里的表现」与「纯浏览器里的表现」是否一致
 * 端口默认 8096，可用 DESKTOP_PORT 或第一个位置参数覆盖。
 */
if (require.main === module) {
  const port = parseInt(process.argv[2] || process.env.DESKTOP_PORT || '8096', 10);
  const cfgFile = path.join(__dirname, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const made = createAppServer({ wwwDir: path.resolve(__dirname, '../www'), config: cfg });
  made.server.listen(port, '127.0.0.1', () => {
    const u = cfg.upstream || {};
    const fmt = (x) => x && x.host ? (x.protocol || 'https') + '://' + x.host + ':' + (x.port || 443) : '(未配置)';
    console.log('');
    console.log('  云课堂桌面版 · 内置 server 单跑');
    console.log('  ' + '-'.repeat(56));
    console.log('  页面地址   :  http://127.0.0.1:' + port + '/' + (cfg.startPage || 'launch.html'));
    console.log('  静态根     :  ' + made.wwwDir);
    console.log('  api 上游   :  ' + fmt(u.api));
    console.log('  消息 上游  :  ' + fmt(u.message));
    console.log('  课堂 上游  :  ' + fmt(u.classroom));
    console.log('  ' + '-'.repeat(56));
    console.log('  这个地址就是桌面窗口加载的那个地址，表现应与 Electron 内一致。');
    console.log('  Ctrl+C 停止');
    console.log('');
  });
}

