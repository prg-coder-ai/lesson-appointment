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

/**
 * 是否属于 classroom-service（8092 在线课堂）。
 *
 * <p>前缀清单必须与 deploy/nginx/booking.conf 保持一致 —— 两边不同步会出现
 * 「本地能跑、上线 404」或反过来，而这类偏差在单机联调时完全不报错，最难查。
 *
 * <p>两个易错点：
 * <ul>
 *   <li>{@code /api/v1/schedules/}（复数）是课堂的排期事件接收；主服务是
 *       <b>单数</b> {@code /api/v1/schedule}，前端全部走单数，两者不冲突；</li>
 *   <li>{@code /api/v1/admin/*} 不能整片划给课堂 —— 主服务也有 admin 语义接口，
 *       必须逐个精确前缀，与 nginx 同一策略。</li>
 * </ul>
 */
function toClassroomService(urlPath) {
  const PREFIXES = [
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
  for (const p of PREFIXES) {
    // 【2026-11-19 修】只 startsWith 会漏掉「前缀本身就是完整路径」的端点：
    // POST /api/v1/admin/classrooms（创建临时课堂）没有子路径，请求路径恰好等于
    // '/api/v1/admin/classrooms'，永远匹配不到 '/api/v1/admin/classrooms/'，
    // 于是被兜底送到 8081 booking —— 主服务没有这个映射，被 SecurityConfig 判 403，
    // 前端只看到「无权限访问该资源」，看起来像权限问题，实际是分流漏了。
    // 判等时去掉前缀末尾的斜杠，nginx 侧对应 `location = /api/v1/admin/classrooms`。
    if (urlPath === p.replace(/\/$/, '') || urlPath.startsWith(p)) return true;
  }
  return false;
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
 * 只有看匿名 identity 端点返回的 service 字段才能确认到底打到了谁。
 * 两个服务都实现了这个匿名端点（各自白名单里），所以拿它当身份牌最稳。
 *
 * ★ 为什么要按服务传不同 path（2026-11-04）：
 *   服务器端口收紧后默认走 **80 单入口**，由 Nginx 按路径分流。
 *   若两个上游都用 `/api/v1/system/info` 探身份，消息服务的请求也会被 Nginx 送到
 *   booking，于是"服务自述"恒显示 booking_api，并弹出「msgHost 指向的不是消息服务」的
 *   假警报——而实际 `/api/v1/message/*` 分流完全正常。
 *   消息服务用 `/api/v1/message/system/info`（它自己的白名单端点）探，才能穿过 Nginx
 *   验证分流是否真的生效；直连 8090 或云托管独立域名时同样有效。
 *
 * @param {{protocol?:string, host:string, port?:number|string, hostHeader?:string}} targetRaw
 * @param {string} [path] 身份端点，默认 booking 的 `/api/v1/system/info`
 * @returns {Promise<string|null>} 如 'booking_api' / 'message-service'；失败为 null
 */
function identify(targetRaw, path, timeout = 4000) {
  const target = normalizeTarget(targetRaw);
  const mod = target.protocol === 'https' ? https : http;
  const opt = {
    host: target.host,
    port: target.port,
    path: path || '/api/v1/system/info',
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

function serveStatic(req, res, root, urlPath) {  const rel = urlPath === '/' ? '/index.html' : urlPath;
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
 * 解析本地监听用的 TLS 证书（DEV_TLS=1 时由入口脚本传入 tls:true）。
 *
 * <p><b>为什么缺证书要抛错而不是退回 http</b>：本地监听改 HTTPS 的实际动机多半是
 * 「局域网另一台电脑要用摄像头/麦克风」—— getUserMedia 只在安全上下文可用。
 * 若证书缺失却静默退回 http，现象是「页面能开、但摄像头还是被禁」，排查成本极高。
 * 宁可启动失败并打印生成命令。
 *
 * @param {boolean|Object} opt  true=用默认 certs 目录；{certPath,keyPath} 可覆盖
 * @returns {{key:Buffer, cert:Buffer}|null}
 */
function resolveTls(opt) {
  if (!opt) return null;
  const defDir = path.resolve(__dirname, '../certs');
  const certPath = path.resolve(typeof opt === 'object' && opt.certPath
    ? opt.certPath : path.join(defDir, 'dev.crt'));
  const keyPath = path.resolve(typeof opt === 'object' && opt.keyPath
    ? opt.keyPath : path.join(defDir, 'dev.key'));
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      'DEV_TLS=1 但缺少证书：' + certPath + ' 或 ' + keyPath + '\n' +
      '   在 doc-develop 目录下执行（IP 换成你本机局域网地址）：\n' +
      '     openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/ca.key -out certs/ca.crt -days 3650 -subj "/CN=WorkBuddy Dev CA"\n' +
      '     openssl req -newkey rsa:2048 -nodes -keyout certs/dev.key -out certs/dev.csr -subj "/CN=localhost"\n' +
      '     printf "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<本机IP>\\n" > certs/san.ext\n' +
      '     openssl x509 -req -in certs/dev.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/dev.crt -days 825 -extfile certs/san.ext\n' +
      '   注意：SAN 里没有的 IP，浏览器会直接拒绝连接（不是警告，是连不上）。'
    );
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

/** 本机所有非回环 IPv4（打印局域网访问地址用；含虚拟网卡，因为没法可靠区分） */
function lanAddresses() {
  const os = require('os');
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((it) => {
      if (it.family === 'IPv4' && !it.internal) out.push(it.address);
    });
  });
  return out;
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
 * @param {boolean|Object} [o.tls] 本地监听走 HTTPS：true=用 doc-develop/certs/{dev.crt,dev.key}，
 *                                 {certPath,keyPath} 可覆盖路径；缺省/ false = HTTP（默认）。
 *                                 局域网另一台电脑要用摄像头/麦克风时必须开（安全上下文要求）。
 * @returns {Promise<http.Server>}
 */
/**
 * 课堂 App 产物目录（classroom-app/www）——「同源同根部署」的本地模拟。
 *
 * <p><b>为什么需要</b>：课堂页已按 classroom-app 重做，生产上由 nginx 把
 * /launch.html、/classroom.html、/classroom-prep.html 这些路径指向 www 产物；
 * 本地若只伺服 frontend，点「进入课堂」会 404，链路根本没法验收。
 *
 * <p><b>只接管 www 独有的资源，不劫持主站页面</b>：www 与 frontend 有 6 个同名页
 * （classroom.html / classroom-prep.html / index.html / login.html / student.html /
 * teacher.html）。index.html / login.html / student.html / teacher.html 必须继续由
 * frontend 提供（它们是主站页面），所以这里用**显式白名单**而不是整目录切换。
 *
 * <p><b>存在才接管，缺则回落 frontend</b>：www 是构建产物，可能只同步了部分文件
 * （如 css/common.css 就缺失）。某个资源在 www 不存在时回落到 frontend，避免 404
 * 打断页面加载——验证阶段要的是"能点通"，不是"www 完整性审计"。
 *
 * <p>开关：命令行 --app-www[=路径] 或环境变量 APP_WWW。不传则不启用，行为与改造前完全一致。
 */
function resolveAppWww(o) {
  let p = o.appWww || process.env.APP_WWW || '';
  if (!p) {
    const flag = process.argv.slice(2).find((a) => a === '--app-www' || a.startsWith('--app-www='));
    if (flag) p = flag.indexOf('=') > 0 ? flag.slice(flag.indexOf('=') + 1) : path.resolve(__dirname, '../../classroom-app/www');
  }
  if (!p) return '';
  const abs = path.resolve(p);
  if (!fs.existsSync(path.join(abs, 'launch.html'))) {
    console.warn(`  ⚠ --app-www 指向的目录没有 launch.html，已忽略：${abs}`);
    console.warn('    先构建课堂 App：cd classroom-app && node scripts/sync.js && node scripts/build.js');
    return '';
  }
  return abs;
}

// www 独有 / 需要「用 App 版」的路径白名单
const APP_WWW_PAGES = new Set([
  'launch.html',        // 课堂入口页（www 独有）
  'classroom.html',     // 课堂本体（与 frontend 同名，验证时要用 App 版即补丁版）
  'classroom-prep.html',// 课前检测（同上）
  'my-classroom.html',  // 我的课堂（www 独有）
  'ops.html',           // 轻运营台（www 独有）
  'verify.html'         // 设备自检（www 独有）
]);

function toAppWww(urlPath) {
  const name = urlPath.replace(/^\//, '');
  if (name.indexOf('/') < 0) return APP_WWW_PAGES.has(name);
  if (urlPath.startsWith('/js/classroom/')) return true;                    // 课堂本体 JS（含补丁）
  if (/^\/(app-[a-z-]+\.js|role-router\.js|ops-lite\.js|verify\.js|app\.css)$/.test(urlPath)) return true;
  if (urlPath === '/css/classroom.css') return true;
  return false;
}

function startProxy(o) {
  const root = path.resolve(o.root);
  // 课堂 App 产物（同源同根部署的本地模拟）；未传 --app-www / APP_WWW 时为空，行为不变
  const appWww = resolveAppWww(o);
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
  // 课堂服务是可选的：不传 classroomPort 时行为与改造前完全一致（不启用任何课堂路由）
  const classroomTarget = o.classroomPort
    ? normalizeTarget({
      protocol: o.classroomProtocol || o.apiProtocol,
      host: o.classroomHost || o.apiHost,
      port: o.classroomPort,
      hostHeader: o.classroomHostHeader || o.apiHostHeader,
    })
    : null;
  // 本地监听协议：DEV_TLS 开启且证书可用时走 HTTPS，否则保持 HTTP（默认，零回归）
  const tls = resolveTls(o.tls);
  const scheme = tls ? 'https' : 'http';
  const handler = (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/api/v1')) {
      if (toMessageService(urlPath)) {
        return proxy(req, res, msgTarget, 'message-service');
      }
      // 课堂前缀优先于 booking 兜底：否则课堂接口会被送到 8081 变成 401/404
      if (classroomTarget && toClassroomService(urlPath)) {
        return proxy(req, res, classroomTarget, 'classroom');
      }
      return proxy(req, res, apiTarget, 'booking');
    }
    // 课堂 App 产物优先：www 里存在就用 www 的，缺则回落 frontend（见 resolveAppWww 注释）
    if (appWww && toAppWww(urlPath) && fs.existsSync(path.join(appWww, urlPath))) {
      return serveStatic(req, res, appWww, urlPath);
    }
    return serveStatic(req, res, root, urlPath);
  };
  // HTTPS 只换「监听侧」：上游后端仍是内网 http，无需任何改动。
  // WS 升级由 Node 的 TLS 层处理后，upgrade 事件的 req/socket 与 http 下完全一致。
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);

  // WebSocket 转发：课堂的信令/白板/心跳三条通道
  //
  // 为什么不走 http.request：WS 升级成功后连接变成裸 TCP，http 模块的回调模型
  // 无法双向透传帧。这里用 net.connect 拿到底层 socket，把「原始 HTTP 升级请求」
  // 手写过去，然后双向 pipe —— 升级后的一切字节（含 ping/pong）原样过。
  // ★ 上游协议不再限定 http（2026-11-21）：云托管里 classroom-service 是 https/wss。
  //   原来只在 protocol === 'http' 时注册 upgrade，于是云托管模式下课堂的
  //   信令 / 白板 / 心跳三条 WS 通道**一条都连不上** —— 表现为「课堂页一直重连中」
  //   或在线人数恒为 0，而 HTTP 接口（进入课堂、成员列表）却完全正常，
  //   极容易被判成「前端信令写错了」。
  if (classroomTarget) {
    server.on('upgrade', (req, socket, head) => {
      const urlPath = (req.url || '/').split('?')[0];
      if (!urlPath.startsWith('/ws/')) {
        // 非课堂 WS 一律拒绝：不静默回退到其他上游，避免把连接挂死
        socket.destroy();
        return;
      }
      // 连接建立后把「原始 HTTP 升级请求」手写过去，之后双向 pipe（升级后是裸 TCP，
      // http 模块的回调模型透传不了帧，所以只能用底层 socket）。
      const onConnect = () => {
        const headers = { ...req.headers, host: classroomTarget.hostHeader };
        let raw = `GET ${req.url} HTTP/1.1\r\n`;
        for (const [k, v] of Object.entries(headers)) {
          if (v === undefined || v === null) continue;
          raw += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`;
        }
        raw += '\r\n';
        upstream.write(raw);
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      };
      // https 上游必须 tls.connect 且显式带 servername（SNI）：
      // 云托管按 SNI 选证书，缺了会拿到默认证书 → 握手失败，
      // 而 Node 的报错只有 ECONNRESET / socket hang up，看不出是 SNI 问题。
      const upstream = classroomTarget.protocol === 'https'
        ? require('tls').connect({
          host: classroomTarget.host,
          port: classroomTarget.port,
          servername: classroomTarget.hostHeader || classroomTarget.host,
        }, onConnect)
        : net.connect(classroomTarget.port, classroomTarget.host, onConnect);
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
      // 浏览器端断开时释放上游，否则每次切页都留一条半开连接（长连接场景会累积）
      socket.on('close', () => upstream.destroy());
    });
  }

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
      console.log(`   浏览器访问 :  ${scheme}://localhost:${o.listenPort}`);
      if (tls) {
        // 局域网地址逐个打出来：证书 SAN 里没有的 IP 浏览器会"连不上"而不是弹警告，
        // 与其让人自己猜，不如启动时就把可用地址摆出来。
        const lan = lanAddresses();
        if (lan.length) {
          lan.forEach((ip) => console.log(`   局域网访问 :  ${scheme}://${ip}:${o.listenPort}`));
        }
        console.log('   HTTPS 证书 :  doc-develop/certs/dev.crt（自签 CA 签发，含 SAN：localhost/127.0.0.1/本机 IP）');
        console.log('                 其他电脑首次访问点「高级 → 继续前往」即可用；');
        console.log('                 想免警告：把 doc-develop/certs/ca.crt 导入「受信任的根证书颁发机构」。');
      }
      const isDist = /(^|[\\/])dist$/.test(root);
      console.log(`   静态根目录 :  ${root}`);
      console.log(`   资源模式   :  ${isDist ? 'dist 构建产物（需先 npm run build / maven prepare-package）'
        : '源码目录，未打包 —— 改完 js/html 直接刷新浏览器即生效'}`);
      if (appWww) {
        console.log(`   课堂 App   :  /launch.html、/classroom*.html、/my-classroom.html、/js/classroom/* ->  ${appWww}`);
        console.log('                 （www 存在则用 www，缺失回落静态根；模拟生产同源同根部署）');
      } else {
        console.log('   课堂 App   :  未启用（加 --app-www 后 /launch.html 才可访问）');
      }
      console.log('   ' + '-'.repeat(58));
      const fmt = (t) => `${t.protocol}://${t.host}${(t.port === 80 || t.port === 443) ? '' : ':' + t.port}`;
      console.log(`   普通 API   :  /api/v1/*                    ->  ${fmt(apiTarget)}`);
      console.log(`   消息/SSE   :  /api/v1/{message,sse,users/*} ->  ${fmt(msgTarget)}`);
      if (classroomTarget) {
        console.log(`   在线课堂   :  /api/v1/{classrooms,uploads,files,recordings,...} + /ws/* ->  ${fmt(classroomTarget)}`);
      }
      // Host 头是排查云托管 404 / 证书不匹配的第一手信息（云托管按 Host + SNI 路由），
      // 三个上游 Host 不同时必须都打出来 —— 只打前两个会让人误以为课堂也走 api 域名。
      const hostHeaders = [apiTarget.hostHeader];
      if (msgTarget.hostHeader && msgTarget.hostHeader !== apiTarget.hostHeader) hostHeaders.push(msgTarget.hostHeader);
      if (classroomTarget && classroomTarget.hostHeader
        && classroomTarget.hostHeader !== apiTarget.hostHeader
        && classroomTarget.hostHeader !== msgTarget.hostHeader) {
        hostHeaders.push(classroomTarget.hostHeader);
      }
      console.log(`   上游 Host  :  ${hostHeaders.join('  /  ')}`);
      console.log(line);
      if (o.probe !== false) {
        Promise.all([
          probe(o.apiHost, o.bookingPort),
          probe(o.msgHost, o.msgPort),
          classroomTarget ? probe(classroomTarget.host, classroomTarget.port) : Promise.resolve(null),
        ]).then(([okBooking, okMsg, okClassroom]) => {
          console.log(`   连通性检查 :  booking ${okBooking ? '✅ 可达' : '❌ 不可达'}`
            + `    message-service ${okMsg ? '✅ 可达' : '❌ 不可达'}`
            + (classroomTarget ? `    课堂 ${okClassroom ? '✅ 可达' : '❌ 不可达'}` : ''));
          if (o.onProbe) o.onProbe({ okBooking, okMsg, okClassroom });
          // 端口通不等于走对了服务：再看两个上游的「自述身份」（/api/v1/system/info 的 service 字段）
          if (!okBooking && !okMsg) { console.log(line); console.log(' 按 Ctrl+C 停止'); return; }
          return Promise.all([
            identify(apiTarget, '/api/v1/system/info'),
            identify(msgTarget, '/api/v1/message/system/info')
          ]).then(([idApi, idMsg]) => {
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

module.exports = { startProxy, toMessageService, toClassroomService, probe };
