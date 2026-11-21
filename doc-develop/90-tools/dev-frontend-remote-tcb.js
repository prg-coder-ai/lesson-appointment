#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【腾讯云托管远端 API】（样例入口，2026-10-24 / 修订 2026-11-21）
 *
 * 本文件是 dev-frontend-remote.js 的「预设好云托管地址」薄封装：只做一件事——
 * 把 API_URL / MSG_URL / CLASSROOM_URL 三个默认值设成本项目在云托管的地址，
 * 其余逻辑（分流、探活、静态伺服、Host/SNI）全部复用，这里一行都不重复实现。
 *
 * ── 为什么必须给三个地址 ────────────────────────────────────────────────────
 * 云托管里后端是**三个独立服务、三个独立域名**（实测 2026-10-25，课堂 2026-11-21）：
 *   booking-api        https://api-329614-8-1475810246.sh.run.tcloudbase.com              :8081
 *   message-service    https://message-service-329614-8-1475810246.sh.run.tcloudbase.com :8090
 *   classroom-service  https://classroom-service-329614-8-1475810246.sh.run.tcloudbase.com :8092
 *
 * 三者**不会互相跟随**。少给任何一个，那类请求就打到 booking 域名上，云托管回 404：
 *   · 少 MSG_URL       → /api/v1/{message,sse,users/} 404
 *                        表现：消息中心一直转圈、SSE 一直重连，很像前端 bug
 *   · 少 CLASSROOM_URL → /api/v1/{classrooms,uploads,files,...} + /ws/classrooms/* 404
 *                        表现：课堂页提示「课堂不存在」或一直加载，很像课程数据没同步
 *                        （2026-11-21 之前本文件就是这样，课堂只能靠单入口 nginx 走通）
 * 注意是 message-**service**-…、classroom-**service**-…，不是 message-… / classroom-…
 * （少 -service 的那个域名返回 INVALID_HOST 404）。
 *
 * ★ classroom-service 的域名是**按 message-service 同一规则推导**出来的，
 *   **未在云托管控制台核实过**。首次联调课堂前请到
 *   云托管 → classroom-service → 服务设置 → 公网访问，复制实际域名核对；
 *   若不一致，用 CLASSROOM_URL=https://实际域名 覆盖即可，不需要改本文件。
 *   这次不联调课堂：CLASSROOM_PORT=0（关掉课堂路由，少一个探活项与一条告警）。
 *
 * ── 为什么不做成第二个代理实现 ──────────────────────────────────────────────
 * 分流规则必须**只有一份**。本项目已经在 dev-proxy.js / nginx 样例 / cloudBased 之间
 * 对齐过三轮，再抄一份就是第四份（改一处忘三处的经典来源）。当前唯一真相源是
 * dev-proxy.js 里的 toMessageService() / toClassroomService()：
 *   /api/v1/{message*,sensitive,sse,users/}                      → 消息服务
 *   /api/v1/{classrooms,attendance,recordings,uploads,files,
 *            schedules,rtc,admin/{classrooms,monitor,reports,
 *            reconcile,audit,contract,exports}} + /ws/classrooms/ → 课堂服务
 *   其余 /api/v1/*                                                → booking
 * 协议差异（明文 http ↔ https+SNI）也已在 dev-proxy.js 收口成 normalizeTarget()，
 * 这里不需要、也不应该再关心。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────────
 *   node doc-develop/90-tools/dev-frontend-remote-tcb.js                # 默认即云托管三个地址
 *   DIST=1 node doc-develop/90-tools/dev-frontend-remote-tcb.js         # 伺服 frontend/dist
 *   CLASSROOM_PORT=0 node doc-develop/90-tools/dev-frontend-remote-tcb.js   # 这次不联调课堂
 *   CLASSROOM_URL=https://其它域名 node doc-develop/90-tools/dev-frontend-remote-tcb.js
 *   API_URL=https://其它域名 MSG_URL=https://其它域名 node doc-develop/90-tools/dev-frontend-remote-tcb.js
 *   NO_PROBE=1 node doc-develop/90-tools/dev-frontend-remote-tcb.js     # 跳过启动探活
 *   DEV_PORT=8099 node doc-develop/90-tools/dev-frontend-remote-tcb.js  # 换监听端口
 *
 * 启动后：浏览器打开 http://localhost:8080 ，前端请求 /api/v1/* 会被同源转发到云端。
 * 课堂页要摄像头/麦克风 —— 浏览器只在安全上下文（https 或 localhost）放行，
 * 所以 localhost:8080 可用；换成 192.168.x.x 访问另一台机器时须 DEV_TLS=1（默认已开）。
 *
 * ── 与 nginx 方案的分工 ─────────────────────────────────────────────────────
 *   dev-frontend-remote-tcb.js  本机开发联调（Node 单进程，零依赖，改 js 刷新即生效）
 *   nginx-代理远端API-样例.conf 自建服务器 / 长期运行（gzip、缓存、静态托管、TLS 终止）
 *   cloudBased/frontend/        云托管 web 容器内的那份 nginx（运行时 envsubst 渲染上游）
 * 三者分流口径保持一致；差别只在静态资源缓存与压缩由谁来做。
 *
 *   特别说明：自建服务器若用「单入口 nginx 分流」（这是 2026-10-30 定下的形态），
 *   课堂不需要单独域名 —— 用 dev-frontend-remote.js（不给 CLASSROOM_URL 即可，
 *   课堂会跟随 BOOKING_PORT 走同一入口）。本文件专门针对「三服务三域名」的云托管。
 */
'use strict';

// 三个都设默认值：想换环境用环境变量覆盖，别改这里的顺序（给了值就不会被覆盖）
process.env.API_URL = process.env.API_URL || 'https://api-329614-8-1475810246.sh.run.tcloudbase.com';
// ★ 消息服务是独立域名。注意是 message-**service**-329614-…，不是 message-329614-…
process.env.MSG_URL = process.env.MSG_URL || 'https://message-service-329614-8-1475810246.sh.run.tcloudbase.com';
// ★ 课堂服务也是独立域名，形如 classroom-**service**-<envid>。
//   这一行是按 message-service 的规则推导的，未在控制台核实 —— 首次联调课堂请核对；
//   域名不对时课堂页会「课堂不存在」，而探活会明确报「远程 classroom-service 不可达」。
process.env.CLASSROOM_URL = process.env.CLASSROOM_URL || 'https://classroom-service-329614-8-1475810246.sh.run.tcloudbase.com';

require('./dev-frontend-remote');
