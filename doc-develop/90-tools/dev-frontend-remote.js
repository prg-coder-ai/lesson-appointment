#!/usr/bin/env node
/**
 * 前端开发代理 —— 连接【服务器（远程）API】
 *
 * 拓扑（全远程，密钥域一致，可正常联调）：
 *   浏览器 -> http://localhost:8080（本代理）
 *              ├─ /api/v1/{message,sse,users/}                    -> <MSG>:8090   远程 message-service
 *              ├─ /api/v1/{classrooms,uploads,files,recordings,    -> <CLASSROOM>:8092  远程 classroom-service
 *              │          attendance,rtc,schedules,admin/{...}}      （可选，见下方三种拓扑）
 *              ├─ /ws/classrooms/*（WebSocket 升级）                -> <CLASSROOM>:8092
 *              └─ 其余 /api/v1/*                                   -> <API_HOST>:8081  远程 booking_api
 *
 * 课堂是可选服务：不配 CLASSROOM_URL / CLASSROOM_PORT 时不挂课堂路由，
 * 行为与「没有课堂功能之前」完全一致（2026-11-21 新增，此前远程模式课堂接口会
 * 静默打到 booking 域名上，课堂页只显示「课堂不存在」）。
 *
 * ⚠ 密钥域铁律（务必遵守）：
 *   token 只能被「与其同源密钥」的服务校验。
 *   远程 booking 与远程 message-service 使用同一套系统 jwt 密钥，因此两端必须同时指向远程。
 *   若把 MSG_HOST 指向本地 127.0.0.1 而 booking 仍走远程（或反之），跨服务 token 验签失败，
 *   表现为「加载接收人 401」「SSE 401」——这不是 session 失效，是密钥不一致。
 *   （本地 message-service 用的是源码 application.properties 里的 jwt.secret，与远程系统密钥不同。）
 *
 * ✅ 当前推荐（也是脚本默认）：服务器已收紧后端端口
 *   （`SERVER_ADDRESS=127.0.0.1` + 安全组只放 80/443），8081/8090 从外网不可达。
 *   此时本代理统一打远程 **80**，由远程 Nginx 按 /api/v1/{message,sse,users/} 自建分流：
 *       node dev-frontend-remote.js            （默认即 BOOKING_PORT=80 MSG_PORT=80）
 *   实测：这是端口收紧后唯一可用的本地联调方式，密钥域仍然一致（同一台远程服务）。
 *
 * 早期部署（后端端口对外放行）才需要显式指定旧端口：
 *       BOOKING_PORT=8081 MSG_PORT=8090 node dev-frontend-remote.js
 *
 * 用法：
 *   node dev-frontend-remote.js
 *
 * 环境变量（均可覆盖）：
 *   FRONTEND_ROOT  静态根目录，默认 ../../frontend（源码）；设 DIST=1 则指向 ../../frontend/dist
 *   DEV_PORT       本地监听端口，默认 8080（须与前端 FRONTEND_ORIGIN 默认端口一致）
 *   NO_PROBE=1     跳过启动前连通性检查
 *
 *   ── 写法 A：云托管域名（https，推荐，2026-10-24 新增 / 2026-11-21 补课堂）──
 *     API_URL=https://api-329614-8-1475810246.sh.run.tcloudbase.com \
 *     MSG_URL=https://message-service-329614-8-1475810246.sh.run.tcloudbase.com \
 *     CLASSROOM_URL=https://classroom-service-329614-8-1475810246.sh.run.tcloudbase.com \
 *       node dev-frontend-remote.js
 *     协议/端口/Host 头全部从 URL 推导（https → 443，Host 头 = 域名），无需再传下面几项。
 *     ★ 云托管里 api 与 message-service 是**两个独立服务、两个域名**，
 *       必须分别给 API_URL 与 MSG_URL。只给 API_URL 时消息类请求会打到 booking 域名上，
 *       云托管会回 404/INVALID_HOST（脚本启动时会打一条醒目提示）。
 *       注意是 message-**service**-…，不是 message-…（后者域名不存在）。
 *     MSG_URL 缺省仍跟随 API_URL，以便兼容「单入口同源部署」（远程 Nginx 自建分流）的老拓扑。
 *
 *   ── 写法 B：裸 IP 老部署（明文 http）──────────────────────────────────────
 *     API_HOST=152.136.254.127 BOOKING_PORT=80 node dev-frontend-remote.js
 *   API_HOST       远程 API 服务器 IP/域名，默认 152.136.254.127（写法 B 用）
 *   API_PROTOCOL   'http' | 'https'，默认 http；给 API_URL 时忽略
 *   BOOKING_PORT   默认 80（走远程 Nginx 统一入口；旧部署需设 8081）
 *   API_HOST_HEADER 覆盖 Host 头（给 API_URL 时自动推导，一般不用手填）
 *   MSG_HOST / MSG_PORT / MSG_PROTOCOL / MSG_HOST_HEADER 同义，默认跟随 API_*
 *
 *   ── 课堂服务（classroom-service，可选）────────────────────────────────────
 *   CLASSROOM_URL      完整 URL（云托管用），协议/端口/Host 头从它推导
 *   CLASSROOM_HOST / CLASSROOM_PORT / CLASSROOM_PROTOCOL / CLASSROOM_HOST_HEADER
 *                      裸 IP 老部署用；CLASSROOM_PORT 默认跟随 BOOKING_PORT
 *   CLASSROOM_PORT=0   显式关闭课堂路由（只联调预约/消息时用）
 *
 *   三种拓扑怎么配（配错的症状都不一样，见文件内「课堂服务」注释块）：
 *     ① 云托管三服务        → 必须给 CLASSROOM_URL，否则课堂路由关闭并告警
 *     ② 自建机单入口 nginx  → 不用给，课堂跟随 BOOKING_PORT 走同一入口
 *     ③ 后端端口对外开放    → CLASSROOM_PORT=8092（CLASSROOM_HOST 默认跟随 API_HOST）
 */
'use strict';
const path = require('path');
const { startProxy } = require('./dev-proxy');

const DIST = process.env.DIST === '1';
const ROOT = path.resolve(
  __dirname,
  process.env.FRONTEND_ROOT || (DIST ? '../../frontend/dist' : '../../frontend')
);
const LISTEN_PORT = parseInt(process.env.DEV_PORT || '8080', 10);

/**
 * 解析完整 URL —— 支持两种入口写法（2026-10-24 新增）：
 *   ① API_URL=https://api-329614-8-1475810246.sh.run.tcloudbase.com   ← 云托管（https + 域名 + SNI）
 *   ② API_HOST=152.136.254.127 BOOKING_PORT=80                        ← 早期裸 IP（明文 http）
 * 给了 API_URL 时，协议 / 主机 / 端口 / Host 头全部从它推导，API_HOST 与 BOOKING_PORT 被忽略。
 *
 * 为什么必须显式带 Host 头：云托管按 Host + SNI 路由，Node 默认会写成 "ip:port" 或省略 SNI，
 * 表现是 404 或证书不匹配（看起来像 DNS/网络问题，实际是路由没对上）。
 */
function parseApiUrl(raw, name) {
  if (!raw) return null;
  // 变量名只用于报错文案：三个上游（API / MSG / CLASSROOM）共用同一个解析器，
  // 报错里写死 "API_URL" 会让人去改错的变量。
  const label = name || 'API_URL';
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    console.error(`!! ${label} 不是合法 URL：${raw}`);
    console.error(`!! 正确写法：${label}=https://<服务名>-329614-8-1475810246.sh.run.tcloudbase.com`);
    process.exit(1);
  }
  const protocol = u.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    console.error(`!! ${label} 协议只支持 http / https，收到：` + protocol);
    process.exit(1);
  }
  const host = u.hostname;
  const port = u.port ? parseInt(u.port, 10) : (protocol === 'https' ? 443 : 80);
  // Host 头用原域名（不带端口）；路径部分忽略 —— 本代理永远按 /api/v1/* 原样转发
  return { protocol, host, port, hostHeader: host };
}

const apiFromUrl = parseApiUrl(process.env.API_URL, 'API_URL');
const API_HOST = apiFromUrl ? apiFromUrl.host : (process.env.API_HOST || '152.136.254.127');
const API_PROTOCOL = apiFromUrl ? apiFromUrl.protocol : (process.env.API_PROTOCOL || 'http');
const BOOKING_PORT = apiFromUrl ? apiFromUrl.port : parseInt(process.env.BOOKING_PORT || '80', 10);
const API_HOST_HEADER = apiFromUrl ? apiFromUrl.hostHeader : (process.env.API_HOST_HEADER || '');

const msgFromUrl = parseApiUrl(process.env.MSG_URL, 'MSG_URL');
const MSG_HOST = msgFromUrl ? msgFromUrl.host : (process.env.MSG_HOST || API_HOST);
const MSG_PROTOCOL = msgFromUrl ? msgFromUrl.protocol : (process.env.MSG_PROTOCOL || API_PROTOCOL);
// MSG_PORT 缺省**跟随 BOOKING_PORT**（而不是写死 80）：默认 BOOKING_PORT=80 时两者都是 80，
// 走 Nginx 单入口；老部署 `BOOKING_PORT=8081 MSG_PORT=8090` 时两端各自正确。
// （2026-11-04：写死 '80' 会让 `BOOKING_PORT=8081` 变成 booking 8081 + msg 80 的错配。）
const MSG_PORT = msgFromUrl ? msgFromUrl.port : parseInt(process.env.MSG_PORT || String(BOOKING_PORT), 10);
const MSG_HOST_HEADER = msgFromUrl ? msgFromUrl.hostHeader : (process.env.MSG_HOST_HEADER || API_HOST_HEADER);

// ─────────────────────────────────────────────────────────────────────────────
// 课堂服务 classroom-service :8092（2026-11-21 补齐）
//
// 为什么不能像 MSG_URL 那样「缺省跟随 API_URL」：
//   消息是核心链路，跟错会立刻表现为「消息中心一直转圈 / SSE 一直重连」；
//   课堂是可选项，跟错只表现为「课堂页提示课堂不存在 / 一直在加载」，
//   很容易被当成课程数据问题（2026-11-19 就为此查过一轮）。
//   所以这里三种拓扑分开处理，宁可显式关掉也不猜地址。
//
//   ① 云托管（三个独立服务、三个域名）
//        CLASSROOM_URL=https://classroom-service-<envid>.sh.run.tcloudbase.com
//      不给就**不启用**课堂路由并告警 —— 跟着 api 域名走必然 404。
//   ② 自建机单入口（裸 IP / 域名 + 远程 nginx 分流）
//      不用给：课堂跟着 BOOKING_PORT 走同一个 80/443，
//      由 nginx 把 /api/v1/{classrooms,uploads,files,recordings,...} 与 /ws/* 分到 8092。
//   ③ 这次不联调课堂
//      CLASSROOM_PORT=0 显式关闭（不传 classroomPort 时引擎行为与改造前完全一致）。
//
//   后端端口对外开放的老部署（BOOKING_PORT=8081 那种）：
//      CLASSROOM_PORT=8092（可选 CLASSROOM_HOST，默认跟随 API_HOST）
//
// 密钥域：classroom-service 与 booking / message-service 用同一套 jwt 密钥，
//   所以它同样不能「一个远程一个本地」，混拓扑会 401（见下方守卫）。
// ─────────────────────────────────────────────────────────────────────────────
const CLASSROOM_DISABLED = process.env.CLASSROOM_PORT === '0';
const classroomFromUrl = CLASSROOM_DISABLED ? null : parseApiUrl(process.env.CLASSROOM_URL, 'CLASSROOM_URL');

let CLASSROOM_HOST = '';
let CLASSROOM_PORT = 0;
let CLASSROOM_PROTOCOL = API_PROTOCOL;
let CLASSROOM_HOST_HEADER = '';

if (CLASSROOM_DISABLED) {
  // 显式关闭：什么都不设，startProxy 收到 classroomPort=undefined 时不挂课堂路由
} else if (classroomFromUrl) {
  CLASSROOM_HOST = classroomFromUrl.host;
  CLASSROOM_PORT = classroomFromUrl.port;
  CLASSROOM_PROTOCOL = classroomFromUrl.protocol;
  CLASSROOM_HOST_HEADER = classroomFromUrl.hostHeader;
} else if (process.env.CLASSROOM_PORT) {
  // 显式端口（后端端口对外开放的老部署）
  CLASSROOM_HOST = process.env.CLASSROOM_HOST || API_HOST;
  CLASSROOM_PORT = parseInt(process.env.CLASSROOM_PORT, 10);
  CLASSROOM_PROTOCOL = process.env.CLASSROOM_PROTOCOL || API_PROTOCOL;
  CLASSROOM_HOST_HEADER = process.env.CLASSROOM_HOST_HEADER || API_HOST_HEADER;
} else if (!process.env.API_URL) {
  // ② 单入口：与 booking 同 host:port，交给远程 nginx 分流
  CLASSROOM_HOST = API_HOST;
  CLASSROOM_PORT = BOOKING_PORT;
  CLASSROOM_PROTOCOL = API_PROTOCOL;
  CLASSROOM_HOST_HEADER = API_HOST_HEADER;
}
// 剩下一种情况：云托管（给了 API_URL）但既没给 CLASSROOM_URL 也没给 CLASSROOM_PORT
// → CLASSROOM_PORT 保持 0（不启用），由下面那段告警说明原因。

// 课堂与 booking 走的是同一个 host:port（自建机单入口）：
// 此时探活探到的是「入口通」，不代表课堂服务在跑 —— 有没有课堂取决于远程 nginx
// 是否把 /api/v1/classrooms/** 与 /ws/** 分到 8092。不说明的话，
// 日志里"课堂 ✅ 可达"会让人以为课堂已经就绪。
const CLASSROOM_SHARED_ENTRY = CLASSROOM_PORT > 0
  && CLASSROOM_HOST === API_HOST
  && CLASSROOM_PORT === BOOKING_PORT
  && CLASSROOM_PROTOCOL === API_PROTOCOL;

// 云托管「两个独立服务」守卫（2026-10-25）：
//   云托管里 api 与 message-service 各自一个域名。只给 API_URL 时 MSG_URL 会跟随它，
//   于是 /api/v1/{message,sse,users/} 被打到 booking 域名 → 云托管返回 404 / INVALID_HOST，
//   现象是「页面能开、登录正常、消息中心一直转圈 / SSE 一直重连」，非常像前端 bug。
//   这里提前喊出来，并把推测的地址一并给出（不自动猜着用，避免"猜错了更难查"）。
if (!process.env.MSG_URL && msgFromUrl === null && /^api-/.test(API_HOST) && /tcloudbase\.com$/.test(API_HOST)) {
  console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.warn('!! 检测到云托管 api 域名，但没有给 MSG_URL                         ');
  console.warn('!! 云托管里 message-service 是独立服务、独立域名，不会跟随 api 域名。');
  console.warn(`!! 现在消息类请求会打到 ${MSG_HOST}:${MSG_PORT}（booking），必然 404。`);
  console.warn(`!! 建议加上：MSG_URL=${API_PROTOCOL}://${API_HOST.replace(/^api-/, 'message-service-')}`);
  console.warn('!! （域名形如 message-service-<envid>.sh.run.tcloudbase.com，注意中间的 -service）');
  console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}


// 云托管「课堂服务也是独立服务」守卫：
//   云托管里 api / message-service / classroom-service 是三个服务、三个域名。
//   只给 API_URL 时课堂不会跟随（也不该跟随），结果是课堂接口全部落到 booking 域名，
//   云托管返回 404 —— 而课堂页只会显示「课堂不存在」或一直转圈，看起来像数据没同步。
//   这里提前喊出来，并把推测地址一并给出（不自动猜着用，避免猜错了更难查）。
if (!CLASSROOM_DISABLED && !classroomFromUrl && !process.env.CLASSROOM_PORT
    && /^api-/.test(API_HOST) && /tcloudbase\.com$/.test(API_HOST)) {
  console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.warn('!! 检测到云托管 api 域名，但既没给 CLASSROOM_URL 也没给 CLASSROOM_PORT');
  console.warn('!! → 课堂路由已【关闭】。课堂页会提示「课堂不存在」或一直转圈，');
  console.warn('!!   这不是课程数据问题，是本地代理没有课堂入口。');
  console.warn(`!! 联调课堂请加：CLASSROOM_URL=${API_PROTOCOL}://${API_HOST.replace(/^api-/, 'classroom-service-')}`);
  console.warn('!!   域名形如 classroom-service-<envid>.sh.run.tcloudbase.com（注意中间的 -service）');
  console.warn('!!   该域名首次使用前请在云托管控制台「服务设置 → 公网访问」核实');
  console.warn('!! 这次不联调课堂就忽略本条，或显式：CLASSROOM_PORT=0');
  console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

// 混合拓扑守卫：远程 booking + 本地 message-service（或反向）必然 401
const isLoopback = (h) => h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '0.0.0.0';
if (isLoopback(MSG_HOST) !== isLoopback(API_HOST)) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!! 混合拓扑告警：booking 与 message-service 未指向同一密钥域 !!');
  console.error(`!!   booking          -> ${API_PROTOCOL}://${API_HOST}:${BOOKING_PORT}`);
  console.error(`!!   message-service  -> ${MSG_PROTOCOL}://${MSG_HOST}:${MSG_PORT}`);
  console.error('!! 两端密钥不同 → token 验签失败，消息/接收人/SSE 一律 401。');
  console.error('!! 请去掉 MSG_HOST（保持与 API_HOST 一致），或改用 dev-frontend-local.js 走全本地。');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

// 课堂同理：classroom-service 也用同一套 jwt 密钥，一本地一远程一样是 401。
// 只在「课堂路由已启用」时检查 —— 没启用时 CLASSROOM_HOST 是空串，比不了。
if (CLASSROOM_PORT && isLoopback(CLASSROOM_HOST) !== isLoopback(API_HOST)) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('!! 混合拓扑告警：booking 与 classroom-service 未指向同一密钥域 !!');
  console.error(`!!   booking            -> ${API_PROTOCOL}://${API_HOST}:${BOOKING_PORT}`);
  console.error(`!!   classroom-service  -> ${CLASSROOM_PROTOCOL}://${CLASSROOM_HOST}:${CLASSROOM_PORT}`);
  console.error('!! 两端密钥不同 → token 验签失败，课堂接口一律 401');
  console.error('!! （表现是「课堂准备页打不开」，很容易误判成课堂没部署）。');
  console.error('!! 请去掉 CLASSROOM_HOST / CLASSROOM_URL，或改用 dev-frontend-local.js 走全本地。');
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

startProxy({
  label: `服务器 API（${API_PROTOCOL}://${API_HOST}:${BOOKING_PORT}`
    + ` + ${MSG_PROTOCOL}://${MSG_HOST}:${MSG_PORT}`
    + (CLASSROOM_PORT ? ` + ${CLASSROOM_PROTOCOL}://${CLASSROOM_HOST}:${CLASSROOM_PORT}` : '')
    + '）',
  root: ROOT,
  listenPort: LISTEN_PORT,
  apiHost: API_HOST,
  bookingPort: BOOKING_PORT,
  apiProtocol: API_PROTOCOL,
  apiHostHeader: API_HOST_HEADER,
  msgHost: MSG_HOST,
  msgPort: MSG_PORT,
  msgProtocol: MSG_PROTOCOL,
  msgHostHeader: MSG_HOST_HEADER,
  // classroomPort 传 undefined 时 dev-proxy 完全不挂课堂路由（零回归），
  // 所以「关闭」不需要额外开关，CLASSROOM_PORT=0 走到这里就是 undefined。
  classroomHost: CLASSROOM_PORT ? CLASSROOM_HOST : undefined,
  classroomPort: CLASSROOM_PORT ? CLASSROOM_PORT : undefined,
  classroomProtocol: CLASSROOM_PROTOCOL,
  classroomHostHeader: CLASSROOM_PORT ? CLASSROOM_HOST_HEADER : undefined,
  probe: process.env.NO_PROBE !== '1',
  onProbe({ okBooking, okMsg, okClassroom }) {
    if (!okBooking) {
      console.log(`   ⚠ 远程 booking ${API_HOST}:${BOOKING_PORT} 不可达：检查服务器是否运行、安全组/防火墙是否放行。`);
    }
    if (!okMsg) {
      console.log(`   ⚠ 远程 message-service ${MSG_HOST}:${MSG_PORT} 不可达（常见原因：服务未启动）。`);
      console.log('     默认 80 走 Nginx 统一入口；若后端端口才是实际开放的，用 MSG_PORT=8090 覆盖。');
      console.log('     此时不要改用本地 message-service 顶替 —— 密钥域不同会 401。');
    }
    if (CLASSROOM_SHARED_ENTRY && okClassroom === true) {
      console.log(`   ℹ 课堂与 booking 共用入口 ${API_HOST}:${BOOKING_PORT}：`);
      console.log('     上面「课堂 可达」只代表入口通，课堂能否真用取决于远程 nginx');
      console.log('     是否把 /api/v1/classrooms/** 与 /ws/** 分到 8092。');
      console.log('     有疑问：curl -o /dev/null -w "%{http_code}" 该域名/api/v1/classrooms/x');
      console.log('     期望 401/403（走到了课堂服务）；404/HTML 说明落到 booking 了。');
    }
    if (CLASSROOM_PORT && okClassroom === false) {
      console.log(`   ⚠ 远程 classroom-service ${CLASSROOM_HOST}:${CLASSROOM_PORT} 不可达（课堂页会报错，其他页面不受影响）。`);
      console.log('     云托管：确认 classroom-service 已部署、CLASSROOM_URL 域名正确（控制台「公网访问」处复制）；');
      console.log('     自建机：确认 8092 已启动，或 nginx 已把 /api/v1/classrooms/** 分到 8092。');
      console.log('     这次不联调课堂：CLASSROOM_PORT=0 关掉课堂路由。');
    }
  },
}).catch((e) => {
  console.error('启动失败：' + e.message);
  process.exit(1);
});
