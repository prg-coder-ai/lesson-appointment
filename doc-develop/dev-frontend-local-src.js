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
 *              ├─ /api/v1/{message,sse,sensitive,users/} -> 127.0.0.1:8090  本地 message-service
 *              ├─ /api/v1/{classrooms,attendance,recordings,uploads,files,
 *              │            schedules,rtc,admin/*}        -> 127.0.0.1:8092  本地 classroom-service
 *              ├─ /ws/classrooms/*（WebSocket 升级）      -> 127.0.0.1:8092  本地 classroom-service
 *              └─ /api/v1/*（其余）                       -> 127.0.0.1:8081  本地 booking_api
 *
 * 前提：本机已启动三个后端（密钥同为源码 application.properties 里的 jwt.secret）：
 *   java -jar api/target/booking-api-*.jar                    --server.port=8081
 *   java -jar api/message-service/target/message-service-*.jar --server.port=8090
 *   java -jar api/classroom-service/target/classroom-service-*.jar --server.port=8092
 *         ^ jar 名带版本号且会变（当前 booking-api-2.2.0 / message-service-1.1.0），
 *           这里一律用通配，别照抄某个版本号；壳会自己展开成真实文件。
 *         ^ 必须显式带端口：沙箱环境变量 SERVER__PORT 会被 Spring Boot 宽松绑定
 *           映射成 server.port，覆盖 jar 内配置，导致绑到别的端口。
 *   课堂是可选的：没起课堂时课堂页会报错，其他页面不受影响；
 *   想彻底关掉课堂路由（不探测、不转发）就设 CLASSROOM_PORT=0。
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
 *   CLASSROOM_HOST / CLASSROOM_PORT   默认 127.0.0.1 / 8092；=0 关闭课堂路由
 *   NO_PROBE=1     跳过启动前连通性检查
 *
 * 变更记录：
 *   2026-10-30  补课堂路由（8092 + /ws/classrooms/）。此前本脚本只分流 8081/8090，
 *               课堂请求会被兜底送到 booking → 表现为课堂页 401/404，
 *               而 dev-frontend-local.js 却是好的（它早接了 classroomPort）——
 *               两个脚本行为不一致，日常最常用的这个反而是坏的。
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
// 课堂：默认 8092；设 CLASSROOM_PORT=0 可彻底关闭课堂路由（只调预约/消息时用）
const CLASSROOM_HOST = process.env.CLASSROOM_HOST || API_HOST;
const CLASSROOM_PORT = parseInt(process.env.CLASSROOM_PORT || '8092', 10);

// 混合拓扑守卫：一端本地一端远程会因 JWT 密钥域不同导致 401
if (API_HOST !== MSG_HOST && API_HOST !== '127.0.0.1' && MSG_HOST !== '127.0.0.1') {
  console.log('⚠ 混合拓扑警告：booking 与 message-service 不在同一台机器，跨服务 token 校验会 401。');
}

startProxy({
  label: '源码直出（不打包）+ 本地 API（booking :' + BOOKING_PORT
    + ' + message-service :' + MSG_PORT
    + (CLASSROOM_PORT > 0 ? ' + classroom :' + CLASSROOM_PORT : '（课堂路由已关闭）') + '）',
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  // 0 表示显式关闭：dev-proxy 引擎在不传 classroomPort 时，行为与两服务版完全一致
  classroomHost: CLASSROOM_HOST,
  classroomPort: CLASSROOM_PORT > 0 ? CLASSROOM_PORT : undefined,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg, okClassroom }) {
    const classroomDown = CLASSROOM_PORT > 0 && !okClassroom;
    if (!okBooking || !okMsg || classroomDown) {
      console.log('   后端未就绪，请先在另一个窗口启动（缺哪个起哪个）：');
      if (!okBooking) {
        console.log('     java -jar api/target/booking-api-*.jar --server.port=8081');
      }
      if (!okMsg) {
        console.log('     java -jar api/message-service/target/message-service-*.jar --server.port=8090');
      }
      if (classroomDown) {
        console.log('     java -jar api/classroom-service/target/classroom-service-*.jar --server.port=' + CLASSROOM_PORT);
        console.log('     （课堂另需 Redis + classroom 库；只调预约/消息可设 CLASSROOM_PORT=0 关掉课堂路由）');
      }
      console.log('   （三端密钥同源：源码 application.properties 的 jwt.secret）');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
