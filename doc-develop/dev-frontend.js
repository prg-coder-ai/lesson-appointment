#!/usr/bin/env node
/**
 * 前端开发代理（通用/兼容入口）—— 默认让【本地 frontend】调用【服务器 API】
 *
 * 定位：dev-frontend-remote.js 的薄封装，只做一件事 —— 把「服务器 API」的默认值设好，
 * 其余逻辑（分流规则、协议/端口/Host 头推导、探活、服务自述校验）全部复用，避免出现第二份实现。
 * 语义明确的入口仍然优先：
 *   node dev-frontend-local.js    连本地 API（127.0.0.1:8081 + 127.0.0.1:8090）
 *   node dev-frontend-remote.js   连服务器 API（可自定义 API_URL / API_HOST）
 *   node dev-frontend.js          本文件：连服务器 API（默认值已按当前部署口径填好）
 *
 * ★ 默认端口为什么是 80 而不是 8081/8090（2026-11-04 修订）：
 *   服务器已收紧（`SERVER_ADDRESS=127.0.0.1` + 安全组只放行 80/443），8081/8090 从外网不可达。
 *   早先这里默认 8081/8090，导致「页面能打开、所有接口 502/超时」——看起来像后端没起。
 *   现在默认 `BOOKING_PORT=80`，由服务器 Nginx 按 /api/v1/{message,sensitive,sse,users/} 自建分流。
 *   老部署（后端端口仍对外放行）用 `BOOKING_PORT=8081 MSG_PORT=8090 node dev-frontend.js` 覆盖。
 *
 * 可覆盖的环境变量（与 dev-frontend-remote.js 完全一致，给了值就不会被默认值顶掉）：
 *   API_URL / MSG_URL              直接给完整 URL（云托管 https 场景用，优先级高于 API_HOST/端口）
 *   API_HOST                       服务器 IP/域名，默认 152.136.254.127
 *   BOOKING_PORT / MSG_PORT        默认 80（Nginx 统一入口）
 *   API_PROTOCOL / MSG_PROTOCOL    默认 http
 *   FRONTEND_ROOT / DIST / DEV_PORT / NO_PROBE
 *
 * 典型用法：
 *   node dev-frontend.js                                  # 本地 frontend（源码）→ 服务器 API
 *   DIST=1 node dev-frontend.js                           # 本地 dist → 服务器 API
 *   API_HOST=1.2.3.4 node dev-frontend.js                 # 换一台服务器
 *   BOOKING_PORT=8081 MSG_PORT=8090 node dev-frontend.js  # 老部署（端口对外放行）
 *   MSG_HOST=127.0.0.1 node dev-frontend.js               # 本地 message-service（混合拓扑，会告警）
 */
'use strict';

// 只填默认值：调用方显式给的（如 start-local-msg.sh 的 MSG_HOST=127.0.0.1）一律保留。
process.env.API_HOST = process.env.API_HOST || '152.136.254.127';
process.env.BOOKING_PORT = process.env.BOOKING_PORT || '80';
// MSG_* 不设默认值：交给 dev-frontend-remote.js 跟随 API_*（同一密钥域的唯一正确做法）。
// 若这里硬写 MSG_PORT=8090，端口收紧后消息类请求会打到不可达的 8090。

require('./dev-frontend-remote');
