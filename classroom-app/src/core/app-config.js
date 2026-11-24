/**
 * 课堂 App 运行时配置
 * ==================================================================
 * 由 scripts/build.js 把 config/environments.js 的值替换进下方占位符。
 * 此文件会被原样复制到 www/app-config.js，运行时给 app-bridge 等脚本读取。
 *
 * 三套地址（server 模式下均为空，走同源代理）：
 *   apiOrigin          → ① 普通业务（window.API_BASE_URL）
 *   classroomApiOrigin → ② 课堂 API（getClassroomApiBaseUrl 覆盖目标）
 *   classroomWsOrigin  → ③ 课堂 WS（getClassroomWsBaseUrl 覆盖目标）
 */
(function (global) {
  'use strict';
  global.APP_CONFIG = /* __APP_CONFIG__ */ {
    env: 'prod',
    frontendOrigin: '',
    apiOrigin: '',
    classroomApiOrigin: '',
    classroomWsOrigin: '',
    wsOrigin: '',
    classroomEmbed: false,
    exitOnBack: true
  } /* __APP_CONFIG_END__ */;
})(typeof window !== 'undefined' ? window : this);
