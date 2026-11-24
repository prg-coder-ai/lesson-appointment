/**
 * 课堂独立 App 适配桥（classic script，IIFE 自包含，零顶层标识符污染）
 * ==================================================================
 * 职责（只在必要处介入，不改业务代码）：
 *   1) 平台探测：window.APP_PLATFORM = 'web' | 'ios' | 'android'
 *   2) ① 普通业务 API 基址改写：local 模式 patch window.ApiPaths.normalizeUrl
 *   3) ② ③ 课堂专属双基址覆盖（★本工程新增，补齐 student-app 缺口）：
 *      - window.getClassroomApiBaseUrl → classroomApiOrigin
 *      - window.getClassroomWsBaseUrl  → classroomWsOrigin
 *      local 模式下返回绝对地址，避免回环归一成空串打错服务。
 *   4) WebSocket 地址改写：包装构造器，补绝对源
 *   5) Android 物理返回键 / 安全区标记
 *
 * ★课堂是主内容，不是跳转目标：classroomEmbed=false，不做 iframe 套娃。
 *   （若确需从工作台跳课堂，role-router.js 负责导航，而非本桥内嵌。）
 *
 * 注入顺序：app-config.js 之后；对课堂双基址的覆盖需在 feature-flags.js /
 * classroom-ws.js 之前生效——install() 会立即执行一次 + DOMContentLoaded 兜底。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var CFG = global.APP_CONFIG || {};
  var API_ORIGIN = (CFG.apiOrigin || '').replace(/\/+$/, '');
  var CLASS_API = (CFG.classroomApiOrigin || '').replace(/\/+$/, '');
  var CLASS_WS = (CFG.classroomWsOrigin || '').replace(/\/+$/, '');
  var WS_ORIGIN = (CFG.wsOrigin || CLASS_WS || '').replace(/\/+$/, '');

  // ---------- 1) 平台探测 ----------
  var ua = navigator.userAgent || '';
  var capacitor = global.Capacitor;
  var platform = 'web';
  if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
    var p = capacitor.getPlatform ? capacitor.getPlatform() : '';
    platform = (p === 'ios' || p === 'android') ? p : 'web';
  } else if (/Android/i.test(ua)) {
    platform = 'android';
  } else if (/iPad|iPhone|iPod/.test(ua)) {
    platform = 'ios';
  }
  global.APP_PLATFORM = platform;
  try { doc.body.classList.add('app-platform-' + platform); } catch (e) { /* body 未就绪 */ }
  doc.addEventListener('DOMContentLoaded', function () {
    try { doc.body.classList.add('app-platform-' + platform); } catch (e) { /* ignore */ }
  });

  // ---------- 2) ① 普通业务 API 基址改写（仅 local 模式）----------
  var _normalizePatched = false;
  function patchNormalize() {
    if (_normalizePatched || !API_ORIGIN) return;
    var paths = global.ApiPaths;
    if (!paths || typeof paths.normalizeUrl !== 'function') return false;
    var orig = paths.normalizeUrl;
    paths.normalizeUrl = function (url) {
      var out = orig.call(paths, url);
      if (out && out.charAt(0) === '/' && out.charAt(1) !== '/') {
        return API_ORIGIN + out;
      }
      return out;
    };
    _normalizePatched = true;
    return true;
  }

  // ---------- 3) ②③ 课堂专属双基址覆盖（本工程新增，关键）----------
  // feature-flags.js 的 getClassroomApiBaseUrl() 对回环地址返回 ''（同源代理语义）。
  // local 模式没有同源代理，空串会让课堂 API/WS 打到 capacitor://localhost → 失败。
  // 这里用配置里的绝对地址覆盖；server 模式两值为空，不动原函数。
  //
  // ★不做一次性标志：app-bridge.js 在 head 先加载，feature-flags.js 在 body 后加载，
  //   而后者末尾会重新赋值 window.getClassroomApiBaseUrl / getClassroomWsBaseUrl。
  //   因此每次 install()（含 DOMContentLoaded 兜底）都要重新覆盖，否则 local 模式下
  //   覆盖会被 feature-flags.js 反向盖掉。覆盖函数做成幂等即可，重复赋值无害。
  function patchClassroomBase() {
    // 存储层注入（最稳）：把绝对地址写进 eclassroomConfig，
    // 这样 feature-flags.js 无论何时加载，getClassroomApiBaseUrl() 都读到绝对地址，
    // 不依赖脚本加载顺序。保留原 enabled，只覆盖两个 base 字段。
    if (CLASS_API || CLASS_WS) {
      try {
        var raw = global.localStorage.getItem('eclassroomConfig');
        var ec = raw ? JSON.parse(raw) : {};
        if (!ec || typeof ec !== 'object') ec = {};
        if (CLASS_API) ec.apiBaseUrl = CLASS_API;
        if (CLASS_WS) ec.wsBaseUrl = CLASS_WS;
        global.localStorage.setItem('eclassroomConfig', JSON.stringify(ec));
      } catch (e) { /* localStorage 不可用时靠函数覆盖兜底 */ }
    }

    // 函数层覆盖（双保险）：即使 setConfig 晚于本桥执行把它重置，
    // DOMContentLoaded 的 install() 会再次覆盖回来。
    if (CLASS_API) {
      global.getClassroomApiBaseUrl = function () { return CLASS_API; };
      global.getClassroomApiBaseUrl.__appBridgePatched = true;
    }
    if (CLASS_WS) {
      global.getClassroomWsBaseUrl = function () { return CLASS_WS; };
      global.getClassroomWsBaseUrl.__appBridgePatched = true;
    }
  }

  // ---------- 4) WebSocket 地址改写 ----------
  if (WS_ORIGIN) {
    var NativeWS = global.WebSocket;
    function BridgedWebSocket(url, protocols) {
      var finalUrl = url;
      if (typeof url === 'string' && url.charAt(0) === '/') finalUrl = WS_ORIGIN + url;
      return protocols !== undefined ? new NativeWS(finalUrl, protocols) : new NativeWS(finalUrl);
    }
    BridgedWebSocket.prototype = NativeWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) {
      BridgedWebSocket[k] = NativeWS[k];
    });
    global.WebSocket = BridgedWebSocket;
  }

  // ---------- 5) Android 物理返回键 ----------
  function onBack() {
    if (global.history && global.history.length > 1) {
      global.history.back();
    } else if (CFG.exitOnBack) {
      var caps = global.Capacitor;
      var App = caps && caps.Plugins && caps.Plugins.App;
      if (App && typeof App.exitApp === 'function') App.exitApp();
    }
  }
  doc.addEventListener('backbutton', onBack, false);
  doc.addEventListener('DOMContentLoaded', function () {
    var caps = global.Capacitor;
    var App = caps && caps.Plugins && caps.Plugins.App;
    if (App && App.addListener) App.addListener('backButton', onBack);
  });

  // ---------- install ----------
  function install() {
    patchNormalize();
    patchClassroomBase();
  }
  install();
  doc.addEventListener('DOMContentLoaded', install);

  global.CLASSROOM_BRIDGE = {
    platform: platform,
    config: CFG,
    classroomApiBase: function () {
      return typeof global.getClassroomApiBaseUrl === 'function' ? global.getClassroomApiBaseUrl() : '';
    },
    classroomWsBase: function () {
      return typeof global.getClassroomWsBaseUrl === 'function' ? global.getClassroomWsBaseUrl() : '';
    }
  };
})(typeof window !== 'undefined' ? window : this);
