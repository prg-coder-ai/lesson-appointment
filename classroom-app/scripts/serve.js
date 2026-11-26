/**
 * 课堂独立 App · 本地预览服务器（静态 + 三服务同源反代）
 * ==========================================================================
 * 用法：node classroom-app/scripts/serve.js [port]   默认 8098
 *
 * 2026-11-26 修复（登录后不跳转、状态区吐 HTML 页面数据）：
 *   原实现是「纯静态 + 找不到就回落 index.html 且返回 200 + text/html」，
 *   于是 POST /api/v1/auth/login 拿到的是一整页 HTML。链路：
 *     ① www/app-config.js 是 server 模式（apiOrigin 为空），app-bridge 不改
 *        normalizeUrl，登录请求按同源相对路径打到 8098 自己；
 *     ② 8098 回落 www/index.html，返回 HTTP 200 + text/html；
 *     ③ utility_request.js 响应拦截器把 HTML 字符串当业务 res，
 *        res.code 为 undefined → showError(resolveResult(res).message)
 *        并且 Promise.reject(res)（reject 的正是那个 HTML 字符串）；
 *     ④ login.html 的 catch 里 typeof error === 'string' → 把整段 HTML
 *        写进 #login-error.textContent，状态区显示 HTML，流程被中断，
 *        永远走不到 redirectToUserPage()。
 *
 *   现改为复用 desktop/server.js 的 createAppServer：同一套
 *   「静态 + /api/v1/* 三服务分流 + /ws/* WebSocket 反代」。
 *   分流清单只有 resolveUpstream 一份（与 dev-proxy.js / nginx 由
 *   仓库根 npm run check:proxy 守着），静态缺失返回干净 404
 *   （与生产 nginx 同语义，不再兜首页）。
 *
 *   上游默认直连本地明文三服务；可用环境变量改指 dev-proxy 或线上域名：
 *     BOOKING_UPSTREAM / MESSAGE_UPSTREAM / CLASSROOM_UPSTREAM
 *   例：CLASSROOM_UPSTREAM=https://classroom.example.com node scripts/serve.js 8098
 */
'use strict';
const path = require('path');

const port = Number(process.argv[2] || 8098);
const WWW = path.resolve(__dirname, '..', 'www');

let createAppServer;
try {
  createAppServer = require('../desktop/server.js').createAppServer;
} catch (e) {
  console.error('[serve] 加载 desktop/server.js 失败，无法启用 API 反代：' + e.message);
  process.exit(1);
}

/** 环境变量 → upstream 配置。传完整 URL，如 http://127.0.0.1:8081 */
function upstream(name, fallback) {
  const raw = process.env[name] || fallback;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    console.error('[serve] ' + name + ' 不是合法 URL：' + raw + '（示例 http://127.0.0.1:8081）');
    process.exit(1);
  }
  const proto = (u.protocol || 'http:').replace(/:$/, '');
  return {
    protocol: proto,
    host: u.hostname,
    port: Number(u.port) || (proto === 'https' ? 443 : 80),
    hostHeader: u.host,
  };
}

const up = {
  api:       upstream('BOOKING_UPSTREAM',   'http://127.0.0.1:8081'),  // booking
  message:   upstream('MESSAGE_UPSTREAM',   'http://127.0.0.1:8090'),  // message-center
  classroom: upstream('CLASSROOM_UPSTREAM', 'http://127.0.0.1:8092'),  // classroom
};

const config = {
  // 保持原预览行为：/ → 分流首页（未登录跳 login.html，已登录进 my-classroom.html）
  startPage: 'index.html',
  upstream: up,
};

const made = createAppServer({ wwwDir: WWW, config });
made.server.listen(port, () => {
  const fmt = (x) => x.protocol + '://' + x.host + ':' + x.port;
  console.log('');
  console.log('  课堂 App 本地预览: http://localhost:' + port + '/');
  console.log('  ' + '-'.repeat(56));
  console.log('  静态根     : ' + made.wwwDir);
  console.log('  booking    : ' + fmt(up.api) + '   <- /api/v1/* 兜底（含登录）');
  console.log('  message    : ' + fmt(up.message) + '   <- /api/v1/message 等');
  console.log('  classroom  : ' + fmt(up.classroom) + '   <- 课堂 API + /ws/*');
  console.log('  ' + '-'.repeat(56));
  console.log('  与桌面版同源代理同一份实现；缺失静态文件返回 404（不兜首页）。');
  console.log('  Ctrl+C 停止');
  console.log('');
});
