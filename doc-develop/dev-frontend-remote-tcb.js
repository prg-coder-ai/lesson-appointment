#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【腾讯云托管远端 API】（样例入口，2026-10-24）
 *
 * 本文件是 dev-frontend-remote.js 的「预设好云托管地址」薄封装：只做一件事——
 * 把 API_URL 的默认值设成本项目在云托管的地址，其余逻辑全部复用。
 *
 * ── 为什么不做成第二个代理实现 ──────────────────────────────────────────────
 * 分流规则（/api/v1/{message,sensitive,sse,users/} → 消息服务，其余 → booking）
 * 必须**只有一份**。本项目已经在 dev-proxy.js / nginx 样例 / 部署手册之间对齐过三次，
 * 再抄一份等于第四次。协议差异（明文 http ↔ https+SNI）已经在 dev-proxy.js 里收口成
 * normalizeTarget()，这里不需要、也不应该再关心。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node doc-develop/dev-frontend-remote-tcb.js                    # 默认即云托管地址
 *   DIST=1 node doc-develop/dev-frontend-remote-tcb.js             # 伺服 frontend/dist
 *   API_URL=https://其它域名 node doc-develop/dev-frontend-remote-tcb.js   # 换环境
 *   NO_PROBE=1 node doc-develop/dev-frontend-remote-tcb.js         # 跳过启动探活
 *   DEV_PORT=8099 node doc-develop/dev-frontend-remote-tcb.js      # 换监听端口
 *
 * 启动后：浏览器打开 http://localhost:8080 ，前端请求 /api/v1/* 会被同源转发到云端。
 *
 * ── 与 nginx 方案的分工 ─────────────────────────────────────────────────────
 *   dev-frontend-remote-tcb.js  本机开发联调（Node 单进程，零依赖，改 js 刷新即生效）
 *   nginx-代理远端API-样例.conf 服务器/长期运行（gzip、缓存、静态托管、TLS 终止）
 * 两者的分流与 Host/SNI 口径保持一致；差别只在静态资源缓存与压缩由谁来做。
 */
'use strict';

// 想换环境就覆盖这个默认值，别改这里的顺序（API_URL 给了值就不会被覆盖）
process.env.API_URL = process.env.API_URL || 'https://api-329614-8-1475810246.sh.run.tcloudbase.com';

// 消息服务与业务接口同在云托管同一入口（同一密钥域）：
// 不给 MSG_URL 时 dev-frontend-remote.js 会让它跟随 API_URL —— 这正是我们要的。
require('./dev-frontend-remote');
