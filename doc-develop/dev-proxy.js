#!/usr/bin/env node
/**
 * 前端本地开发代理 —— 公共引擎（被 dev-frontend-local.js / dev-frontend-remote.js 调用）
 *
 * 原理（为什么用代理而不是改 API_BASE_URL）：
 *   前端 utility_request.js 默认 API_BASE_URL=''，请求走相对路径 /api/v1/...；
 *   axios 对以 "/" 开头的 url 会忽略 baseURL，所以设 window.API_BASE_URL 指外部主机无效。
 *   因此采用「同源(localhost) + 反向代理」：浏览器只访问 http://localhost:PORT，
 *   本引擎把 /api/v1 普通请求转发到 booking，把消息/SSE/用户类转发到 message-service。
 *   对浏览器而言是同源，天然无 CORS 问题。
 *
 * 仅依赖 Node 内置模块（http/fs/path/net），无需 npm install。
 *
 * API：
 *   const { startProxy } = require('./dev-proxy');
 *   startProxy({ label, root, listenPort, apiHost, bookingPort, msgHost, msgPort, probe: true });
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

/** 消息/推送类走 message-service（与部署手册 Nginx 分流规则一致） */
function toMessageService(urlPath) {
  return (
    urlPath.startsWith('/api/v1/message') ||
    urlPath.startsWith('/api/v1/sse') ||
    urlPath.startsWith('/api/v1/users/')
  );
}

/** TCP 探活：目标端口是否可连（1.5s 超时） */
function probe(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function proxy(req, res, targetHost, targetPort, label) {
  const headers = { ...req.headers };
  headers.host = `${targetHost}:${targetPort}`;

  // 与生产 Nginx 保持一致：补 X-Forwarded-* / X-Real-IP
  // 否则后端永远走「直连」分支，本地无法复现反代链路（后台信息页的 viaProxy 会一直是 false）
  const clientIp = (req.socket && req.socket.remoteAddress) || '';
  const priorXff = headers['x-forwarded-for'];
  headers['x-forwarded-for'] = priorXff ? `${priorXff}, ${clientIp}` : clientIp;
  headers['x-real-ip'] = clientIp;
  headers['x-forwarded-proto'] = req.socket && req.socket.encrypted ? 'https' : 'http';
  headers['x-forwarded-host'] = req.headers.host || '';
  const options = {
    host: targetHost,
    port: targetPort,
    method: req.method,
    path: req.url,
    headers,
  };
  const p = http.request(options, (pres) => {
    const outHeaders = { ...pres.headers };
    const ct = pres.headers['content-type'] || '';
    // SSE 不缓冲，保证实时推送
    if (ct.includes('text/event-stream')) {
      outHeaders['Cache-Control'] = 'no-cache';
      outHeaders['X-Accel-Buffering'] = 'no';
    }
    res.writeHead(pres.statusCode, outHeaders);
    pres.pipe(res);
  });
  p.on('error', (e) => {
    console.error(`  [代理失败] ${label} -> ${targetHost}:${targetPort}  ${e.code || ''} ${e.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Bad Gateway: ${label} (${targetHost}:${targetPort}) 不可达 —— ${e.message}`);
  });
  // 客户端中断时（如关闭 SSE 页面）及时销毁上游连接
  res.on('close', () => p.destroy());
  req.pipe(p);
}

function serveStatic(req, res, root, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = path.normalize(path.join(root, rel));
  // 防目录穿越
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      // 缺省页图标：无图标时返回 204，避免刷屏 404
      if (rel === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + rel);
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * 启动代理服务
 * @param {Object} o
 * @param {string} o.label        模式名（打印用），如 "本地 API"
 * @param {string} o.root         静态根目录绝对路径
 * @param {number} o.listenPort   本地监听端口
 * @param {string} o.apiHost      booking 主机
 * @param {number} o.bookingPort  booking 端口
 * @param {string} o.msgHost      message-service 主机
 * @param {number} o.msgPort      message-service 端口
 * @param {boolean} [o.probe]     启动前是否探活（默认 true）
 * @returns {Promise<http.Server>}
 */
function startProxy(o) {
  const root = path.resolve(o.root);
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/api/v1')) {
      const isMsg = toMessageService(urlPath);
      const host = isMsg ? o.msgHost : o.apiHost;
      const port = isMsg ? o.msgPort : o.bookingPort;
      return proxy(req, res, host, port, isMsg ? 'message-service' : 'booking');
    }
    return serveStatic(req, res, root, urlPath);
  });

  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${o.listenPort} 已被占用，请关闭占用进程或设置 DEV_PORT 换端口`));
      } else {
        reject(e);
      }
    });
    server.listen(o.listenPort, () => {
      const line = '='.repeat(62);
      console.log(line);
      console.log(` 前端开发代理已启动 —— 模式：${o.label}`);
      console.log(line);
      console.log(`   浏览器访问 :  http://localhost:${o.listenPort}`);
      const isDist = /(^|[\\/])dist$/.test(root);
      console.log(`   静态根目录 :  ${root}`);
      console.log(`   资源模式   :  ${isDist ? 'dist 构建产物（需先 npm run build / maven prepare-package）'
        : '源码目录，未打包 —— 改完 js/html 直接刷新浏览器即生效'}`);
      console.log('   ' + '-'.repeat(58));
      console.log(`   普通 API   :  /api/v1/*                    ->  http://${o.apiHost}:${o.bookingPort}`);
      console.log(`   消息/SSE   :  /api/v1/{message,sse,users/*} ->  http://${o.msgHost}:${o.msgPort}`);
      console.log(line);
      if (o.probe !== false) {
        Promise.all([
          probe(o.apiHost, o.bookingPort),
          probe(o.msgHost, o.msgPort),
        ]).then(([okBooking, okMsg]) => {
          console.log(`   连通性检查 :  booking ${okBooking ? '✅ 可达' : '❌ 不可达'}    message-service ${okMsg ? '✅ 可达' : '❌ 不可达'}`);
          if (o.onProbe) o.onProbe({ okBooking, okMsg });
          console.log(line);
          console.log(' 按 Ctrl+C 停止');
        });
      } else {
        console.log(' 按 Ctrl+C 停止');
      }
      resolve(server);
    });
  });
}

module.exports = { startProxy, toMessageService, probe };
