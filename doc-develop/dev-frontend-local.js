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
 *   FRONTEND_ROOT  静态根目录，默认 ../frontend（源码）；设 DIST=1 则指向 ../frontend/dist
 *   DEV_PORT       本地监听端口，默认 8080（须与前端 FRONTEND_ORIGIN 默认端口一致）
 *   API_HOST       默认 127.0.0.1
 *   BOOKING_PORT   默认 8081
 *   MSG_HOST       默认 127.0.0.1
 *   MSG_PORT       默认 8090
 *   CLASSROOM_PORT 默认 8092；设为 0 可关闭课堂路由（只联调预约/消息时用）
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
const API_HOST = process.env.API_HOST || '127.0.0.1';
const BOOKING_PORT = parseInt(process.env.BOOKING_PORT || '8081', 10);
const MSG_HOST = process.env.MSG_HOST || '127.0.0.1';
const MSG_PORT = parseInt(process.env.MSG_PORT || '8090', 10);
const CLASSROOM_PORT = parseInt(process.env.CLASSROOM_PORT || '8092', 10);

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
