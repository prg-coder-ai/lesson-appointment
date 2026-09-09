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
 * 前提：远程 message-service 已在服务器运行，且防火墙放行 8090 入站。
 *
 * 用法：
 *   node dev-frontend-remote.js
 * 环境变量（均可覆盖）：
 *   FRONTEND_ROOT  静态根目录，默认 ../frontend（源码）；设 DIST=1 则指向 ../frontend/dist
 *   DEV_PORT       本地监听端口，默认 8080（须与前端 FRONTEND_ORIGIN 默认端口一致）
 *   API_HOST       远程 API 服务器 IP/域名，默认 152.136.254.127
 *   BOOKING_PORT   默认 8081
 *   MSG_HOST       默认与 API_HOST 相同（强烈建议保持默认）
 *   MSG_PORT       默认 8090
 *   NO_PROBE=1     跳过启动前连通性检查
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
const API_HOST = process.env.API_HOST || '152.136.254.127';
const BOOKING_PORT = parseInt(process.env.BOOKING_PORT || '8081', 10);
const MSG_HOST = process.env.MSG_HOST || API_HOST;
const MSG_PORT = parseInt(process.env.MSG_PORT || '8090', 10);

// 混合拓扑守卫：远程 booking + 本地 message-service（或反向）必然 401
const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0';
if (isLoopback(MSG_HOST) !== isLoopback(API_HOST)) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!! 混合拓扑告警：booking 与 message-service 未指向同一密钥域 !!');
  console.error(`!!   booking          -> ${API_HOST}:${BOOKING_PORT}`);
  console.error(`!!   message-service  -> ${MSG_HOST}:${MSG_PORT}`);
  console.error('!! 两端密钥不同 → token 验签失败，消息/接收人/SSE 一律 401。');
  console.error('!! 请去掉 MSG_HOST（保持与 API_HOST 一致），或改用 dev-frontend-local.js 走全本地。');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

startProxy({
  label: `服务器 API（${API_HOST}:${BOOKING_PORT} + ${MSG_HOST}:${MSG_PORT}）`,
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg }) {
    if (!okBooking) {
      console.log(`   ⚠ 远程 booking ${API_HOST}:${BOOKING_PORT} 不可达：检查服务器是否运行、安全组/防火墙是否放行。`);
    }
    if (!okMsg) {
      console.log(`   ⚠ 远程 message-service ${MSG_HOST}:${MSG_PORT} 不可达（常见原因：服务未启动或 8090 未放行）。`);
      console.log('     远程放行示例： firewall-cmd --add-port=8090/tcp --permanent && firewall-cmd --reload');
      console.log('     此时不要改用本地 message-service 顶替 —— 密钥域不同会 401。');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
