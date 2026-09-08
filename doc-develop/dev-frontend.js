#!/usr/bin/env node
/**
 * 本地前端开发代理 —— 以远程 API 服务器为目标，纯前端在本地运行
 *
 * 原理（为什么用代理而不是改 API_BASE_URL）：
 *   前端 utility_request.js 默认 API_BASE_URL=''，所有请求走相对路径 /api/v1/...；
 *   而 axios 对以 "/" 开头的 url 会忽略 baseURL，所以设 window.API_BASE_URL 指远程主机无效。
 *   因此用「同源(localhost) + 反向代理」：浏览器只访问 http://localhost:PORT，
 *   本脚本把 /api/v1 转发到远程 booking(:8081)，把消息/推送类转发到 message-service(:8090)。
 *   这样对浏览器是同源、无 CORS 问题。
 *
 * 仅依赖 Node 内置模块（http/fs/path/url），无需 npm install。
 *
 * 用法：
 *   node dev-frontend.js
 * 环境变量（均可覆盖）：
 *   FRONTEND_ROOT  静态根目录，默认 ../frontend（源码）；可指向 ../frontend/dist 跑生产构建
 *   DEV_PORT       本地监听端口，默认 8080
 *                   —— 必须与前端 js/public/api.js 中 FRONTEND_ORIGIN 默认端口(:8080)一致，
 *                      否则登录成功后会跳到一个没有服务的端口。如需换端口，同时设置
 *                      前端 window.FRONTEND_ORIGIN（或保持默认 8080）。
 *   API_HOST       远程 API 服务器 IP/域名，默认 152.136.254.127
 *   BOOKING_PORT   booking 端口，默认 8081
 *   MSG_PORT       message-service 端口，默认 8090
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, process.env.FRONTEND_ROOT || '../frontend');
const LISTEN_PORT = parseInt(process.env.DEV_PORT || '8080', 10);
const API_HOST = process.env.API_HOST || '152.136.254.127';
const BOOKING_PORT = parseInt(process.env.BOOKING_PORT || '8081', 10);
const MSG_PORT = parseInt(process.env.MSG_PORT || '8090', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
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
};

// 消息/推送类走 message-service（与部署手册第 7 章 Nginx 分流规则一致）
function toMessageService(url) {
  return (
    url.startsWith('/api/v1/message') ||
    url.startsWith('/api/v1/sse') ||
    url.startsWith('/api/v1/users/')
  );
}

function proxy(req, res, targetPort) {
  const headers = { ...req.headers };
  headers.host = `${API_HOST}:${targetPort}`;
  const options = {
    host: API_HOST,
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
    if (!res.headersSent) res.writeHead(502);
    res.end('Bad Gateway: ' + e.message);
  });
  req.pipe(p);
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = path.normalize(path.join(ROOT, rel));
  // 防目录穿越
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + rel);
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath.startsWith('/api/v1')) {
    return proxy(req, res, toMessageService(urlPath) ? MSG_PORT : BOOKING_PORT);
  }
  return serveStatic(req, res, urlPath);
});

server.listen(LISTEN_PORT, () => {
  console.log('==================================================');
  console.log(' 本地前端开发代理已启动');
  console.log(`   浏览器访问:  http://localhost:${LISTEN_PORT}`);
  console.log(`   静态根目录:  ${ROOT}`);
  console.log('--------------------------------------------------');
  console.log(`   普通 API  :  /api/v1/*  ->  http://${API_HOST}:${BOOKING_PORT}`);
  console.log(`   消息/SSE   :  /api/v1/{message,sse,users/*}  ->  http://${API_HOST}:${MSG_PORT}`);
  console.log('==================================================');
  console.log(' 按 Ctrl+C 停止');
});
