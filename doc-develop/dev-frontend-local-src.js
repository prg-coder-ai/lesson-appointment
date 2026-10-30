#!/usr/bin/env node
/**
 * 前端【源码直出】启动器 —— 不打包、不构建 dist，连本地 API
 *
 * 与 dev-frontend-local.js 的区别：
 *   · 强制伺服 frontend/ 源码目录（显式忽略 DIST=1，避免误用旧构建产物）
 *   · 改完 js / html / css 直接刷新浏览器即可生效，无需 npm run build
 *   · 默认两端都锁本机 127.0.0.1（全本地拓扑，JWT 密钥同源，不会 401）
 *
 * 拓扑：
 *   浏览器 -> http://localhost:8080（本代理）
 *              ├─ /api/v1/*                    -> 127.0.0.1:8081  本地 booking_api
 *              └─ /api/v1/{message,sse,users/} -> 127.0.0.1:8090  本地 message-service
 *
 * 前提：本机已启动两个后端（密钥同为源码 application.properties 里的 jwt.secret）：
 *   java -jar api/target/booking_api-2.0.0.jar --server.port=8081
 *   java -jar api/message-service/target/message-service-1.0.0.jar --server.port=8090
 *         ^ 必须显式带端口：沙箱环境变量 SERVER__PORT 会被 Spring Boot 宽松绑定
 *           映射成 server.port，覆盖 jar 内配置，导致绑到别的端口。
 *
 * 用法：
 *   node dev-frontend-local-src.js
 *   （Windows 双击：start-frontend-local-src.cmd）
 *
 * 环境变量（一般无需设置）：
 *   DEV_PORT       监听端口，默认 8080
 *   FRONTEND_ROOT  静态根目录，默认 ../frontend（源码）
 *   API_HOST / BOOKING_PORT   默认 127.0.0.1 / 8081
 *   MSG_HOST  / MSG_PORT      默认 127.0.0.1 / 8090
 *   NO_PROBE=1     跳过启动前连通性检查
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { startProxy } = require('./dev-proxy');

/** 源码根目录：显式忽略 DIST=1，但允许 FRONTEND_ROOT 手动覆盖 */
const DEFAULT_ROOT = path.resolve(__dirname, '../frontend');
const ROOT = path.resolve(__dirname, process.env.FRONTEND_ROOT || '../frontend');

if (process.env.DIST === '1' && !process.env.FRONTEND_ROOT) {
  console.log('⚠ 检测到 DIST=1，但本脚本是【源码直出】模式，已忽略；若要跑 dist 请用 dev-frontend-local.js');
}
if (!fs.existsSync(ROOT)) {
  console.error('源码目录不存在：' + ROOT);
  process.exit(1);
}
if (/(^|[\\/])dist$/.test(ROOT)) {
  console.error('本脚本只用于源码直出，请勿指向 dist：' + ROOT);
  process.exit(1);
}

const LISTEN_PORT = parseInt(process.env.DEV_PORT || '8080', 10);
const API_HOST = process.env.API_HOST || '127.0.0.1';
const BOOKING_PORT = parseInt(process.env.BOOKING_PORT || '8081', 10);
const MSG_HOST = process.env.MSG_HOST || '127.0.0.1';
const MSG_PORT = parseInt(process.env.MSG_PORT || '8090', 10);

// 混合拓扑守卫：一端本地一端远程会因 JWT 密钥域不同导致 401
if (API_HOST !== MSG_HOST && API_HOST !== '127.0.0.1' && MSG_HOST !== '127.0.0.1') {
  console.log('⚠ 混合拓扑警告：booking 与 message-service 不在同一台机器，跨服务 token 校验会 401。');
}

startProxy({
  label: '源码直出（不打包）+ 本地 API（booking :8081 + message-service :8090）',
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg }) {
    if (!okBooking || !okMsg) {
      console.log('   后端未就绪，请先在另一个窗口启动（缺哪个起哪个）：');
      if (!okBooking) {
        console.log('     java -jar api/target/booking_api-2.0.0.jar --server.port=8081');
      }
      if (!okMsg) {
        console.log('     java -jar api/message-service/target/message-service-1.0.0.jar --server.port=8090');
      }
      console.log('   （两端密钥同源：源码 application.properties 的 jwt.secret）');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
