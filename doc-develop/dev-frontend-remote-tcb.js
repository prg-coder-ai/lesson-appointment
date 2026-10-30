#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【腾讯云托管远端 API】（样例入口，2026-10-24 / 修订 2026-10-25）
 *
 * 本文件是 dev-frontend-remote.js 的「预设好云托管地址」薄封装：只做一件事——
 * 把 API_URL / MSG_URL 两个默认值设成本项目在云托管的地址，其余逻辑全部复用。
 *
 * ── 为什么必须给两个地址 ────────────────────────────────────────────────────
 * 云托管里后端是**两个独立服务**（实测 2026-10-25）：
 *   booking-api       https://api-329614-8-1475810246.sh.run.tcloudbase.com        :8081
 *   message-service   https://message-service-329614-8-1475810246.sh.run.tcloudbase.com :8090
 * 是 message-**service**-329614-…，不是 message-329614-…（后者返回 INVALID_HOST 404）。
 * 只给 API_URL 的话，/api/v1/{message,sse,users/} 会被打到 booking 域名上 → 404，
 * 表现为「消息中心一直转圈、SSE 一直重连」，很像前端 bug。所以这里两个都设上。
 *
 * ── 为什么不做成第二个代理实现 ──────────────────────────────────────────────
 * 分流规则（/api/v1/{message,sensitive,sse,users/} → 消息服务，其余 → booking）
 * 必须**只有一份**。本项目已经在 dev-proxy.js / nginx 样例 / cloudBased/web 之间对齐过，
 * 再抄一份等于又一份。协议差异（明文 http ↔ https+SNI）已经在 dev-proxy.js 里收口成
 * normalizeTarget()，这里不需要、也不应该再关心。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node doc-develop/dev-frontend-remote-tcb.js                    # 默认即云托管两个地址
 *   DIST=1 node doc-develop/dev-frontend-remote-tcb.js             # 伺服 frontend/dist
 *   API_URL=https://其它域名 MSG_URL=https://其它域名 node doc-develop/dev-frontend-remote-tcb.js
 *   NO_PROBE=1 node doc-develop/dev-frontend-remote-tcb.js         # 跳过启动探活
 *   DEV_PORT=8099 node doc-develop/dev-frontend-remote-tcb.js      # 换监听端口
 *
 * 启动后：浏览器打开 http://localhost:8080 ，前端请求 /api/v1/* 会被同源转发到云端。
 *
 * ── 与 nginx 方案的分工 ─────────────────────────────────────────────────────
 *   dev-frontend-remote-tcb.js  本机开发联调（Node 单进程，零依赖，改 js 刷新即生效）
 *   nginx-代理远端API-样例.conf 自建服务器 / 长期运行（gzip、缓存、静态托管、TLS 终止）
 *   cloudBased/web/nginx.conf.template  云托管 web 容器内的那份 nginx
 * 三者的分流与 Host/SNI 口径保持一致；差别只在静态资源缓存与压缩由谁来做。
 */
'use strict';

// 想换环境就覆盖这两个默认值，别改这里的顺序（给了值就不会被覆盖）
process.env.API_URL = process.env.API_URL || 'https://api-329614-8-1475810246.sh.run.tcloudbase.com';
// ★ 消息服务是独立域名。注意是 message-**service**-329614-…，不是 message-329614-…
process.env.MSG_URL = process.env.MSG_URL || 'https://message-service-329614-8-1475810246.sh.run.tcloudbase.com';

require('./dev-frontend-remote');
