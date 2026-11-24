// 课堂独立 App · 环境配置（单一权威源）
// ------------------------------------------------------------------
// 构建脚本与前端运行时配置都从这里取值。改地址只改这里，重新 npm run build。
//
// 两种运行模式（详见方案 §7.3）：
//   server 模式（默认，推荐）：WebView 加载 FRONTEND_ORIGIN 线上前端，页面与后端同源。
//       三套地址全部留空——/api/v1、/ws/classrooms 走同源 nginx 分流（booking 8081 /
//       message 8090 / classroom 8092），App 侧零配置。
//   local 模式：静态包打进 App，跑在 capacitor://localhost，无同源代理。
//       三套地址必须填绝对地址：apiOrigin(booking) / classroomApiOrigin(8092) /
//       classroomWsOrigin(wss 8092)，且后端要 CORS 放行 capacitor://localhost。
//
// ★课堂有三套地址（不是一套），见方案 §7.2：
//   ① apiOrigin          → window.API_BASE_URL（登录/排期/预约等普通业务）
//   ② classroomApiOrigin → getClassroomApiBaseUrl()（课堂专属 API）
//   ③ classroomWsOrigin  → getClassroomWsBaseUrl()（课堂 WS）

'use strict';

const ENV = (process.env.APP_ENV || 'prod').toLowerCase();

// 模式开关：APP_MODE=local 时强制走本地包（frontendOrigin 置空），
// 并要求三套绝对地址齐全；缺省为 server 模式（WebView 加载线上同源前端）。
// 也可用 FRONTEND_ORIGIN='' 显式留空来表达 local，二者等价。
const MODE = (process.env.APP_MODE || 'server').toLowerCase();
const IS_LOCAL = MODE === 'local' || process.env.FRONTEND_ORIGIN === '';

const config = {
  env: ENV,
  mode: IS_LOCAL ? 'local' : 'server',

  // ---- server 模式 ----
  // 线上前端站点根地址（结尾不带 /）。设为 '' 表示用 local 模式。
  frontendOrigin: IS_LOCAL
    ? ''
    : (ENV === 'dev'
      ? (process.env.FRONTEND_ORIGIN || 'http://192.168.1.10:8080')
      : (process.env.FRONTEND_ORIGIN || 'https://your-domain.com')),

  // ---- local 模式：三套绝对地址（server 模式下全部留空）----
  apiOrigin: process.env.API_ORIGIN || '',
  classroomApiOrigin: process.env.CLASSROOM_API_ORIGIN || '',
  classroomWsOrigin: process.env.CLASSROOM_WS_ORIGIN || '',

  // ---- App 标识 ----
  appId: 'com.lessonappointment.classroom',
  appName: '云课堂',
  webDir: 'www',

  webviewDebugging: ENV === 'dev',

  // 课堂是主内容，不是跳转目标 → 关闭 iframe 内嵌（否则套娃）
  classroomEmbed: false,
  exitOnBack: true
};

module.exports = config;
