#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【服务器（远程）API】
 *
 * 拓扑（全远程，密钥域一致，可正常联调）：
 *   浏览器 -> http://localhost:8080（本代理）
 *              ├─ /api/v1/*                    -> <API_HOST>:8081  远程 booking_api
 *              └─ /api/v1/{message,sse,users/} -> <API_HOST>:8090  远程 message-service
 *
 * ⚠ 密钥域铁律（务必遵守）：
 *   token 只能被「与其同源密钥」的服务校验。
 *   远程 booking 与远程 message-service 使用同一套系统 jwt 密钥，因此两端必须同时指向远程。
 *   若把 MSG_HOST 指向本地 127.0.0.1 而 booking 仍走远程（或反之），跨服务 token 验签失败，
 *   表现为「加载接收人 401」「SSE 401」——这不是 session 失效，是密钥不一致。
 *   （本地 message-service 用的是源码 application.properties 里的 jwt.secret，与远程系统密钥不同。）
 *
 * ✅ 当前推荐（也是脚本默认）：服务器已收紧后端端口
 *   （`SERVER_ADDRESS=127.0.0.1` + 安全组只放 80/443），8081/8090 从外网不可达。
 *   此时本代理统一打远程 **80**，由远程 Nginx 按 /api/v1/{message,sse,users/} 自建分流：
 *       node dev-frontend-remote.js            （默认即 BOOKING_PORT=80 MSG_PORT=80）
 *   实测：这是端口收紧后唯一可用的本地联调方式，密钥域仍然一致（同一台远程服务）。
 *
 * 早期部署（后端端口对外放行）才需要显式指定旧端口：
 *       BOOKING_PORT=8081 MSG_PORT=8090 node dev-frontend-remote.js
 *
 * 用法：
 *   node dev-frontend-remote.js
 *
 * 环境变量（均可覆盖）：
 *   FRONTEND_ROOT  静态根目录，默认 ../frontend（源码）；设 DIST=1 则指向 ../frontend/dist
 *   DEV_PORT       本地监听端口，默认 8080（须与前端 FRONTEND_ORIGIN 默认端口一致）
 *   NO_PROBE=1     跳过启动前连通性检查
 *
 *   ── 写法 A：云托管域名（https，推荐，2026-10-24 新增）─────────────────────
 *     API_URL=https://api-329614-8-1475810246.sh.run.tcloudbase.com \
 *       node dev-frontend-remote.js
 *     协议/端口/Host 头全部从 URL 推导（https → 443，Host 头 = 域名），无需再传下面几项。
 *     MSG_URL 可单独指定消息服务；不传则跟随 API_URL（同一密钥域，务必保持这个默认）。
 *
 *   ── 写法 B：裸 IP 老部署（明文 http）──────────────────────────────────────
 *     API_HOST=152.136.254.127 BOOKING_PORT=80 node dev-frontend-remote.js
 *   API_HOST       远程 API 服务器 IP/域名，默认 152.136.254.127（写法 B 用）
 *   API_PROTOCOL   'http' | 'https'，默认 http；给 API_URL 时忽略
 *   BOOKING_PORT   默认 80（走远程 Nginx 统一入口；旧部署需设 8081）
 *   API_HOST_HEADER 覆盖 Host 头（给 API_URL 时自动推导，一般不用手填）
 *   MSG_HOST / MSG_PORT / MSG_PROTOCOL / MSG_HOST_HEADER 同义，默认跟随 API_*
 */
'use strict';
const path = require('path');
const { startProxy } = require('./dev-proxy');

const DIST = process.env.DIST === '1';
const ROOT = path.resolve(
  __dirname,
  process.env.FRONTEND_ROOT || (DIST ? '../frontend/dist' : '../frontend')
);
const LISTEN_PORT = parseInt(process.env.DEV_PORT || '8080', 10);

/**
 * 解析完整 URL —— 支持两种入口写法（2026-10-24 新增）：
 *   ① API_URL=https://api-329614-8-1475810246.sh.run.tcloudbase.com   ← 云托管（https + 域名 + SNI）
 *   ② API_HOST=152.136.254.127 BOOKING_PORT=80                        ← 早期裸 IP（明文 http）
 * 给了 API_URL 时，协议 / 主机 / 端口 / Host 头全部从它推导，API_HOST 与 BOOKING_PORT 被忽略。
 *
 * 为什么必须显式带 Host 头：云托管按 Host + SNI 路由，Node 默认会写成 "ip:port" 或省略 SNI，
 * 表现是 404 或证书不匹配（看起来像 DNS/网络问题，实际是路由没对上）。
 */
function parseApiUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    console.error('!! API_URL 不是合法 URL：' + raw);
    console.error('!! 正确写法：API_URL=https://api-329614-8-1475810246.sh.run.tcloudbase.com');
    process.exit(1);
  }
  const protocol = u.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    console.error('!! API_URL 协议只支持 http / https，收到：' + protocol);
    process.exit(1);
  }
  const host = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : (protocol === 'https' ? 443 : 80);
  // Host 头用原域名（不带端口）；路径部分忽略 —— 本代理永远按 /api/v1/* 原样转发
  return { protocol, host, port, hostHeader: host };
}

const apiFromUrl = parseApiUrl(process.env.API_URL);
const API_HOST = apiFromUrl ? apiFromUrl.host : (process.env.API_HOST || '152.136.254.127');
const API_PROTOCOL = apiFromUrl ? apiFromUrl.protocol : (process.env.API_PROTOCOL || 'http');
const BOOKING_PORT = apiFromUrl ? apiFromUrl.port : parseInt(process.env.BOOKING_PORT || '80', 10);
const API_HOST_HEADER = apiFromUrl ? apiFromUrl.hostHeader : (process.env.API_HOST_HEADER || '');

const msgFromUrl = parseApiUrl(process.env.MSG_URL);
const MSG_HOST = msgFromUrl ? msgFromUrl.host : (process.env.MSG_HOST || API_HOST);
const MSG_PROTOCOL = msgFromUrl ? msgFromUrl.protocol : (process.env.MSG_PROTOCOL || API_PROTOCOL);
const MSG_PORT = msgFromUrl ? msgFromUrl.port : parseInt(process.env.MSG_PORT || String(BOOKING_PORT), 10);
const MSG_HOST_HEADER = msgFromUrl ? msgFromUrl.hostHeader : (process.env.MSG_HOST_HEADER || API_HOST_HEADER);

// 混合拓扑守卫：远程 booking + 本地 message-service（或反向）必然 401
const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0';
if (isLoopback(MSG_HOST) !== isLoopback(API_HOST)) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!! 混合拓扑告警：booking 与 message-service 未指向同一密钥域 !!');
  console.error(`!!   booking          -> ${API_PROTOCOL}://${API_HOST}:${BOOKING_PORT}`);
  console.error(`!!   message-service  -> ${MSG_PROTOCOL}://${MSG_HOST}:${MSG_PORT}`);
  console.error('!! 两端密钥不同 → token 验签失败，消息/接收人/SSE 一律 401。');
  console.error('!! 请去掉 MSG_HOST（保持与 API_HOST 一致），或改用 dev-frontend-local.js 走全本地。');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

startProxy({
  label: `服务器 API（${API_PROTOCOL}://${API_HOST}:${BOOKING_PORT} + ${MSG_PROTOCOL}://${MSG_HOST}:${MSG_PORT}）`,
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  apiProtocol: API_PROTOCOL,
  apiHostHeader: API_HOST_HEADER,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  msgProtocol: MSG_PROTOCOL,
  msgHostHeader: MSG_HOST_HEADER,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg }) {
    if (!okBooking) {
      console.log(`   ⚠ 远程 booking ${API_HOST}:${BOOKING_PORT} 不可达：检查服务器是否运行、安全组/防火墙是否放行。`);
    }
    if (!okMsg) {
      console.log(`   ⚠ 远程 message-service ${MSG_HOST}:${MSG_PORT} 不可达（常见原因：服务未启动）。`);
      console.log('     默认 80 走 Nginx 统一入口；若后端端口才是实际开放的，用 MSG_PORT=8090 覆盖。');
      console.log('     此时不要改用本地 message-service 顶替 —— 密钥域不同会 401。');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
