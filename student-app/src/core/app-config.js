/**
 * 运行时配置（Web 端唯一入口，classic script，注入到 index.html 最前）
 * ------------------------------------------------------------------
 * 作用：把构建期 environment 配置挂到 window.APP_CONFIG，供 app-bridge 读取。
 * 这个文件由 scripts/build.js 从 config/environments.js 生成，勿手改 www/ 下的产物。
 */
(function (global) {
  'use strict';
  // __APP_CONFIG__ 由构建脚本替换为真实 JSON；未替换时给出安全默认（同源）。
  var CONFIG = /* __APP_CONFIG__ */ {
    env: 'prod',
    frontendOrigin: '',
    apiOrigin: '',
    wsOrigin: '',
    classroomEmbed: true
  } /* __APP_CONFIG_END__ */;

  global.APP_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : this);
