// 一码多端 · 环境配置（单一权威源）
// ------------------------------------------------------------------
// 构建脚本 (scripts/*.js) 与前端运行时配置都从这里取值。
// 改地址只改这里，然后重新执行 `npm run build`。
//
// 两种运行模式（详见 README.md）：
//   server 模式（默认，推荐）：WebView 直接加载 FRONTEND_ORIGIN 上的线上前端。
//       页面与后端同源 -> 现有 /api/v1 相对路径、课堂 WebSocket、登录跳转全部零改动可用。
//   local 模式：把前端静态包打进 App，页面跑在 capacitor://localhost，
//       此时需设置 apiOrigin，由 app-bridge.js 把相对请求改写为绝对地址（需后端 CORS 放行）。

'use strict';

const ENV = (process.env.APP_ENV || 'prod').toLowerCase();

const config = {
  // 当前环境标识：dev / prod
  env: ENV,

  // ---- Capacitor server 模式 ----
  // 线上前端站点根地址（结尾不要带 /）。设为 '' 表示用 local 模式。
  // dev 可用本机：http://192.168.1.10:8080（手机需与电脑同网段，且后端允许该 Origin）
  // prod 用线上域名：https://your-domain.com
  frontendOrigin: ENV === 'dev'
    ? (process.env.FRONTEND_ORIGIN || 'http://192.168.1.10:8080')
    : (process.env.FRONTEND_ORIGIN || 'https://your-domain.com'),

  // ---- local 模式 ----
  // 后端 API 源（页面与后端不同源时使用，app-bridge 会拼到 /api/v1 前面）。
  // server 模式下留空即可。
  apiOrigin: process.env.API_ORIGIN || '',

  // 课堂 WebSocket 源。留空表示与页面同源（server 模式）。
  // local 模式如课堂走独立服务，填 wss://your-domain.com
  wsOrigin: process.env.WS_ORIGIN || '',

  // ---- App 标识 ----
  appId: 'com.lessonappointment.student',
  appName: '预约课堂',
  webDir: 'www',

  // 是否在 WebView 内启用调试（dev 可开，prod 关）
  webviewDebugging: ENV === 'dev'
};

module.exports = config;
