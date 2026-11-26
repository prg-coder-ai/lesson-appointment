#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【本地 API】
 *
 * 拓扑（全本地，密钥域一致，可正常联调）：
 *   浏览器 -> http://localhost:8080（本代理）
 *              ├─ /api/v1/{message,sse,users/}                    -> 127.0.0.1:8090  本地 message-service
 *              ├─ /api/v1/{classrooms,uploads,files,recordings,    -> 127.0.0.1:8092  本地 classroom-service
 *              │          attendance,rtc,admin/{monitor,...}}
 *              ├─ /ws/classrooms/*（WebSocket 升级）                -> 127.0.0.1:8092  本地 classroom-service
 *              └─ 其余 /api/v1/*                                   -> 127.0.0.1:8081  本地 booking_api
 *
 * 课堂服务未启动也能用（只是课堂页报错），不影响其他页面。
 *
 * 前提：本机已启动两个后端（密钥同为源码 application.properties 里的 jwt.secret）：
 *   java -jar api/target/booking-api-*.jar                     --server.port=8081
 *   java -jar api/message-service/target/message-service-*.jar  --server.port=8090
 *         ^ jar 名带版本号且会变，这里一律用通配（壳会展开成真实文件）
 *         ^ 必须显式带 --server.port=8090：沙箱环境变量 SERVER__PORT 会被 Spring Boot
 *           宽松绑定映射成 server.port，覆盖 jar 内配置，导致绑到别的端口。
 *
 * 用法：
 *   node dev-frontend-local.js
 * 环境变量（均可覆盖）：
 *   FRONTEND_ROOT  静态根目录，默认 ../../frontend（源码）；设 DIST=1 则指向 ../../frontend/dist
 *   DEV_PORT       本地监听端口，默认 8080（须与前端 FRONTEND_ORIGIN 默认端口一致）
 *   API_HOST       默认 127.0.0.1
 *   BOOKING_PORT   默认 8081
 *   MSG_HOST       默认 127.0.0.1
 *   MSG_PORT       默认 8090
 *   CLASSROOM_PORT 默认 8092；设为 0 可关闭课堂路由（只联调预约/消息时用）
 *   DEV_TLS        默认 HTTPS（用 certs/dev.crt|dev.key）；设 0 才退回 HTTP。
 *                  ★ 默认 HTTPS 是因为局域网另一台电脑要用摄像头/麦克风：浏览器只在安全上下文
 *                    （https 或 localhost）里放行 getUserMedia，http://192.168.x.x 会被直接禁掉。
 *                  给 tests/ 里硬编码 http://localhost:8080 的脚本用：DEV_TLS=0。
 *                  缺证书时启动直接报错并打印生成命令（不静默退回 http）。
 *   APP_WWW        课堂 App 产物目录，默认 ../../classroom-app/www（**默认启用**）。
 *                  别名：--app-www[=路径]。设 0 / off 关闭，退回 frontend 原生页。
 *                  /launch.html 是 web 侧「进入课堂」的唯一落地页，只在 www 里，
 *                  关掉后所有入口 404 —— 除对照验证外不要关。
 *   NO_PROBE=1     跳过启动前连通性检查
 */
'use strict';
const path = require('path');
const { startProxy } = require('./dev-proxy');

const DIST = process.env.DIST === '1';
const ROOT = path.resolve(
  __dirname,
  process.env.FRONTEND_ROOT || (DIST ? '../../frontend/dist' : '../../frontend')
);

/**
 * 课堂 App 产物目录（同源同根部署的本地模拟）—— **默认启用**（2026-11-26）
 *
 * ★ 为什么必须默认开：frontend 侧所有「进入课堂」入口都已收敛到
 *   ClassroomLink.open({ target:'entry' })，产出相对地址 ./launch.html?scheduleId=…
 *   而 launch.html 只存在于 classroom-app/www，frontend 目录下没有同名页。
 *   代理不接管 /launch.html 时，请求落到 frontend 静态根 → **404**，
 *   表现为「近日课程 / 我的课程 / 课次列表 / 我的课堂」四个入口全点不通
 *   （2026-11-26 实测踩过；此前只修了 toAppWww 的提前 return bug，
 *    但开关本身没打开，所以课堂页资源通了、入口页仍 404）。
 *
 * 关闭方式（仅在需要对照 frontend 原生 classroom.html 时用）：
 *   APP_WWW=0 node dev-frontend-local.js
 * 目录不存在（www 未构建）时 resolveAppWww 会 warn 并自动忽略，不影响其它页面。
 */
const APP_WWW_ENV = String(process.env.APP_WWW == null ? '' : process.env.APP_WWW).trim();
const APP_WWW_OFF = APP_WWW_ENV === '0' || APP_WWW_ENV.toLowerCase() === 'off';
const APP_WWW = APP_WWW_OFF
  ? ''
  : path.resolve(__dirname, APP_WWW_ENV || '../../classroom-app/www');
const LISTEN_PORT = parseInt(process.env.DEV_PORT || '8080', 10);
const API_HOST = process.env.API_HOST || '127.0.0.1';
const BOOKING_PORT = parseInt(process.env.BOOKING_PORT || '8081', 10);
const MSG_HOST = process.env.MSG_HOST || '127.0.0.1';
const MSG_PORT = parseInt(process.env.MSG_PORT || '8090', 10);
const CLASSROOM_PORT = parseInt(process.env.CLASSROOM_PORT || '8092', 10);
// 2026-11-16 起默认走 HTTPS（局域网 RTC 的 getUserMedia 只在安全上下文放行）。
// 逃生口：DEV_TLS=0（或 false）退回 HTTP —— 供 tests/ 里硬编码 http://localhost:8080 的脚本用。
const DEV_TLS = process.env.DEV_TLS !== '0' && process.env.DEV_TLS !== 'false';

startProxy({
  label: '本地 API（booking :8081 + message-service :8090 + classroom :8092）',
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  // 0 表示显式关闭课堂路由（不传 classroomPort 时引擎行为与改造前一致）
  classroomPort: CLASSROOM_PORT > 0 ? CLASSROOM_PORT : undefined,
  // 课堂 App 产物目录：接管 /launch.html 等 www 独有路径（默认 classroom-app/www）
  appWww: APP_WWW,
  tls: DEV_TLS,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg, okClassroom }) {
    if (!okBooking) {
      console.log('   ⚠ booking 未就绪，启动：');
      console.log('     java -jar api/target/booking-api-*.jar --server.port=8081');
    }
    if (!okMsg) {
      console.log('   ⚠ message-service 未就绪，启动：');
      console.log('     java -jar api/message-service/target/message-service-*.jar --server.port=8090');
    }
    if (okClassroom === false) {
      console.log('   ⚠ classroom-service 未就绪（课堂页会报错，其他页面不受影响），启动：');
      console.log('     java -jar api/classroom-service/target/classroom-service-*.jar --server.port=8092');
      console.log('     或用 IDE 跑 com.classroom.ClassroomServiceApplication');
      console.log('     前置：classroom 库 + Redis db2（没 Redis 课堂起不来，其它服务不受影响）');
    }
    if (!okBooking || !okMsg) {
      console.log('   提示：三端密钥同源（源码 application.properties 的 jwt.secret），可正常联调。');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
