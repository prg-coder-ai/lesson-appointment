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
    const p = String(rawPath || '').split('?')[0];
    if (p === '/api/v1/admin/classrooms') return UP.classroom || null;   // 无尾斜杠的精确端点
    for (const x of MSG_PREFIXES) if (p === x || p.startsWith(x)) return UP.message || null;
    for (const x of CLS_PREFIXES) if (p.startsWith(x)) return UP.classroom || null;
    if (p.startsWith('/api/') || p.startsWith('/actuator/')) return UP.api || null;
    return null;
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
    const preq = mod.request({
      protocol: o.isHttps ? 'https:' : 'http:',
      hostname: o.host,
      port: o.port,
      method: req.method,
      path: req.url,
      headers: Object.assign({}, req.headers, { host: o.hostHeader }),
      rejectUnauthorized: false,   // 允许内网自签证书
    }, (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    });
    preq.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('上游错误：' + e.message);
    });
    req.pipe(preq);
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

module.exports = { createAppServer, MSG_PREFIXES, CLS_PREFIXES };
