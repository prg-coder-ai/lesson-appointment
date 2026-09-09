#!/usr/bin/env node
/**
 * 前端开发代理（通用入口，兼容旧调用方式）
 *
 * 推荐直接使用下面两个语义明确的入口：
 *   node dev-frontend-local.js    连接本地 API（127.0.0.1:8081 + 127.0.0.1:8090）
 *   node dev-frontend-remote.js   连接服务器 API（默认 152.136.254.127:8081 + :8090）
 *
 * 本文件保持原有默认行为（默认连远程服务器），供旧脚本 start-frontend.cmd / .sh
 * 及 start-local-msg.sh（MSG_HOST=127.0.0.1 node dev-frontend.js）继续可用。
 *
 * 环境变量同 dev-frontend-remote.js：
 *   FRONTEND_ROOT / DIST / DEV_PORT / API_HOST / BOOKING_PORT / MSG_HOST / MSG_PORT / NO_PROBE
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

const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0';
if (isLoopback(MSG_HOST) !== isLoopback(API_HOST)) {
  console.error('!! 混合拓扑告警：booking 与 message-service 不在同一密钥域，消息/SSE 会 401。');
  console.error(`!!   booking -> ${API_HOST}:${BOOKING_PORT}   message-service -> ${MSG_HOST}:${MSG_PORT}`);
}

startProxy({
  label: `兼容模式（booking ${API_HOST}:${BOOKING_PORT} + msg ${MSG_HOST}:${MSG_PORT}）`,
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  probe: process.env.NO_PROBE !== '1',
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
