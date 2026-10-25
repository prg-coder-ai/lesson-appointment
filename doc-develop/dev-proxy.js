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
 * 仅依赖 Node 内置模块（http/https/fs/path/net），无需 npm install。
 *
 * 上游支持两种形态（2026-10-24 起）：
 *   明文 http（本地 127.0.0.1:8081 / 裸 IP:80）—— 默认
 *   https + 域名（云托管）—— 传 { apiProtocol:'https', apiHost:'api-xxx.tcloudbase.com',
 *                             bookingPort:443, apiHostHeader:'api-xxx.tcloudbase.com' }
 *   或直接用入口脚本的环境变量 API_URL=https://api-xxx.tcloudbase.com（见 dev-frontend-remote.js）
 *
 * API：
 *   const { startProxy } = require('./dev-proxy');
 *   startProxy({ label, root, listenPort, apiHost, bookingPort, msgHost, msgPort, probe: true });
 */
'use strict';
const http = require('http');
const https = require('https');
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
    urlPath.startsWith('/api/v1/sensitive') ||
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

/**
 * 服务自述：**端口通 ≠ 走对了服务**。
 *
 * 背景（2026-10-25）：云托管里 booking 与 message-service 是两个独立实例、两个域名，
 * 但都监听在各自的 443 上。把 MSG_HOST 误指向 booking 域名（或者写成不存在的
 * message-329614-… 之类）时，TCP 探活照样 ✅（连的是同一个网关），
 * 只有看 /api/v1/system/info 返回的 service 字段才能确认到底打到了谁。
 * 两个服务都实现了这个匿名端点（白名单里），所以拿它当身份牌最稳。
 *
 * @returns {Promise<string|null>} 如 'booking_api' / 'message-service'；失败为 null
 */
function identify(targetRaw, timeout = 4000) {
  const target = normalizeTarget(targetRaw);
  const mod = target.protocol === 'https' ? https : http;
  const opt = {
    host: target.host,
    port: target.port,
    path: '/api/v1/system/info',
    method: 'GET',
    headers: { Host: target.hostHeader, Accept: 'application/json' },
  };
  if (target.protocol === 'https') {
    opt.servername = target.hostHeader.replace(/:\d+$/, '');
    opt.rejectUnauthorized = true;
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const req = mod.request(opt, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { buf += d; if (buf.length > 8192) req.destroy(); });
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          finish((j && j.data && j.data.service) || null);
        } catch (e) { finish(null); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); finish(null); });
    req.on('error', () => finish(null));
    req.end();
  });
}


/**
 * 归一化上游目标。**协议差异只允许出现在这里**，分流规则（toMessageService）永远只有一份。
 *
 * 背景（2026-10-24）：本地后端是明文 http://127.0.0.1:8081，云托管是
 * https://api-xxx.tcloudbase.com（TLS + 域名 + SNI）。若再写一个"远程版代理"文件，
 * 分流规则立刻变成两份，必然漂移 —— 本项目已经在 nginx/dev-proxy/部署手册之间对齐过一次了。
 *
 * @param {{protocol?:string, host:string, port?:number|string, hostHeader?:string}} t
 * @returns {{protocol:'http'|'https', host:string, port:number, hostHeader:string}}
 */
function normalizeTarget(t) {
  const protocol = String((t && t.protocol) || 'http').toLowerCase() === 'https' ? 'https' : 'http';
  const host = t.host;
  const port = Number(t.port || (protocol === 'https' ? 443 : 80));
  // Host 头：显式给了就用给的；否则 80/443 省略端口（云托管网关对带端口的 Host 会挑剔）
  const raw = t.hostHeader == null ? '' : String(t.hostHeader).trim();
  const hostHeader = raw || (port === 80 || port === 443 ? host : host + ':' + port);
  return { protocol, host, port, hostHeader };
}

function proxy(req, res, targetRaw, label) {
  const target = normalizeTarget(targetRaw);
  const targetHost = target.host;
  const targetPort = target.port;
  const mod = target.protocol === 'https' ? https : http;
  const headers = { ...req.headers };
  headers.host = target.hostHeader;

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
  if (target.protocol === 'https') {
    // SNI 必须带：云托管按 servername 选证书，缺了会握手失败或拿到默认站点的证书。
    // 用 hostHeader 去掉端口作为 servername（它就是原域名）。
    options.servername = target.hostHeader.replace(/:\d+$/, '');
    // 校验证书链。本地调试若遇自签/代理 MITM 才临时改成 false，别默认关掉。
    options.rejectUnauthorized = true;
  }
  const p = mod.request(options, (pres) => {
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

/**
 * 源码直出模式的构建信息合成：build-info.json 是构建产物（仅 frontend/dist 里有），
 * 伺服 frontend/ 源码目录时物理文件不存在——用当前源码的 git 状态动态合成一份，
 * 保证「程序信息」页在开发态也能显示前端信息（mode:'source' 标记来源）。
 */
function synthesizeBuildInfo() {
  function git(cmd) {
    try {
      return require('child_process').execSync(cmd, { cwd: __dirname, encoding: 'utf8' }).trim();
    } catch (e) { return ''; }
  }
  return {
    mode: 'source',
    buildTime: new Date().toISOString(),
    gitCommit: git('git rev-parse HEAD'),
    gitBranch: git('git rev-parse --abbrev-ref HEAD'),
    gitDirty: git('git status --porcelain') !== ''
  };
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
      // build-info.json 缺失（源码直出模式）→ 合成而非 404，让前端「程序信息」页有数据可显示
      if (rel === '/build-info.json') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(synthesizeBuildInfo()));
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
 * @param {string} [o.apiProtocol] 上游协议 'http'|'https'（默认 http；云托管传 https）
 * @param {string} [o.msgProtocol] 消息服务协议，缺省跟随 apiProtocol
 * @param {string} [o.apiHostHeader] 覆盖 Host 头（https + 域名场景传原域名，省略 :443）
 * @param {string} [o.msgHostHeader] 覆盖消息服务的 Host 头，缺省跟随 apiHostHeader
 * @param {boolean} [o.probe]     启动前是否探活（默认 true）
 * @returns {Promise<http.Server>}
 */
function startProxy(o) {
  const root = path.resolve(o.root);
  // 上游目标：默认 http（本地/裸 IP），传 apiProtocol:'https' 即支持云托管
  const apiTarget = normalizeTarget({
    protocol: o.apiProtocol,
    host: o.apiHost,
    port: o.bookingPort,
    hostHeader: o.apiHostHeader,
  });
  const msgTarget = normalizeTarget({
    protocol: o.msgProtocol || o.apiProtocol,
    host: o.msgHost,
    port: o.msgPort,
    hostHeader: o.msgHostHeader || o.apiHostHeader,
  });
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/api/v1')) {
      const isMsg = toMessageService(urlPath);
      return proxy(req, res, isMsg ? msgTarget : apiTarget, isMsg ? 'message-service' : 'booking');
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
      const fmt = (t) => `${t.protocol}://${t.host}${(t.port === 80 || t.port === 443) ? '' : ':' + t.port}`;
      console.log(`   普通 API   :  /api/v1/*                    ->  ${fmt(apiTarget)}`);
      console.log(`   消息/SSE   :  /api/v1/{message,sse,users/*} ->  ${fmt(msgTarget)}`);
      console.log(`   上游 Host  :  ${apiTarget.hostHeader}${msgTarget.hostHeader !== apiTarget.hostHeader ? '  /  ' + msgTarget.hostHeader : ''}`);
      console.log(line);
      if (o.probe !== false) {
        Promise.all([
          probe(o.apiHost, o.bookingPort),
          probe(o.msgHost, o.msgPort),
        ]).then(([okBooking, okMsg]) => {
          console.log(`   连通性检查 :  booking ${okBooking ? '✅ 可达' : '❌ 不可达'}    message-service ${okMsg ? '✅ 可达' : '❌ 不可达'}`);
          if (o.onProbe) o.onProbe({ okBooking, okMsg });
          // 端口通不等于走对了服务：再看两个上游的「自述身份」（/api/v1/system/info 的 service 字段）
          if (!okBooking && !okMsg) { console.log(line); console.log(' 按 Ctrl+C 停止'); return; }
          return Promise.all([identify(apiTarget), identify(msgTarget)]).then(([idApi, idMsg]) => {
            const show = (v) => (v || '（未返回身份）');
            console.log(`   服务自述   :  booking → ${show(idApi)}    message-service → ${show(idMsg)}`);
            const isMsg = (v) => /message/i.test(v || '');
            if (isMsg(idApi)) {
              console.warn('   ⚠ apiHost 指向的其实是消息服务？两个上游写反了。');
            }
            if (idMsg && !isMsg(idMsg)) {
              console.warn(`   ⚠ msgHost 指向的不是消息服务（自述为 ${idMsg}）——`);
              console.warn('     多半是 MSG_URL 没给 / 指到了 booking 域名 / 域名拼错（如 message- 少了 -service-）。');
              console.warn('     症状：页面能开、登录正常，但消息中心一直转圈、SSE 每秒重连。');
            }
            if (!idMsg) {
              console.warn('   ⚠ 消息服务没有返回身份（可能域名不存在、或返回的不是 JSON）。');
              console.warn('     云托管写错域名会返回 {"code":"INVALID_HOST"} 的 404，TCP 照样连得上。');
            }
            console.log(line);
            console.log(' 按 Ctrl+C 停止');
          });
        });
      } else {
        console.log(' 按 Ctrl+C 停止');
      }
      resolve(server);
    });
  });
}

module.exports = { startProxy, toMessageService, probe };
