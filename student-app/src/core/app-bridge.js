/**
 * 一码多端适配桥（classic script，IIFE 自包含，零顶层标识符污染）
 * ==================================================================
 * 职责（只在必要处介入，不改业务代码）：
 *   1) 平台探测：window.APP_PLATFORM = 'web' | 'ios' | 'android'
 *   2) API 基址改写：local 模式下把 /api/v1/* 相对请求拼成绝对地址
 *      —— 通过 patch window.ApiPaths.normalizeUrl 釜底抽薪，主请求与刷新令牌实例都覆盖
 *   3) 课堂 WebView 内嵌：覆盖 window.RouterAdapter.openUrl，classroom.html 走应用内 WebView
 *      —— App 端优先 Capacitor Browser 插件；纯浏览器端用全屏 iframe 层模拟
 *   4) Android 物理返回键：课堂层开着先关层，否则 history.back()
 *   5) 安全区适配：给 <body> 打平台标记 class，样式见 src/styles/app.css
 *
 * 注入顺序要求：shared-domain-bridge.js 之后加载（需要 window.ApiPaths / RouterAdapter）。
 * 若顺序不满足，install() 会在 DOMContentLoaded 再兜底重试一次。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var CFG = global.APP_CONFIG || {};
  var API_ORIGIN = (CFG.apiOrigin || '').replace(/\/+$/, '');
  var WS_ORIGIN = (CFG.wsOrigin || '').replace(/\/+$/, '');
  var CLASSROOM_EMBED = CFG.classroomEmbed !== false;

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
  // 供样式做安全区/返回键留白
  try { doc.body.classList.add('app-platform-' + platform); } catch (e) { /* body 可能未就绪 */ }
  doc.addEventListener('DOMContentLoaded', function () {
    try { doc.body.classList.add('app-platform-' + platform); } catch (e) { /* ignore */ }
  });

  // ---------- 2) API 基址改写（仅 local 模式生效）----------
  var _normalizePatched = false;
  function patchNormalize() {
    if (_normalizePatched || !API_ORIGIN) return;
    var paths = global.ApiPaths;
    if (!paths || typeof paths.normalizeUrl !== 'function') return false;

    var orig = paths.normalizeUrl;
    paths.normalizeUrl = function (url) {
      var out = orig.call(paths, url);
      // 只改写以 / 开头的相对路径；绝对 URL / 协议相对 URL 原样放行
      if (out && out.charAt(0) === '/' && out.charAt(1) !== '/') {
        return API_ORIGIN + out;
      }
      return out;
    };
    _normalizePatched = true;
    return true;
  }

  // WebSocket 地址改写：课堂 ws 走独立服务时，把相对 ws 路径补绝对源。
  // 采用包装原生 WebSocket 构造器的方式，对以 / 开头的 url 加源。
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

  // ---------- 3) 课堂 WebView 内嵌 ----------
  var classroomLayer = null;

  function ensureLayer() {
    if (classroomLayer) return classroomLayer;
    var layer = doc.createElement('div');
    layer.id = 'app-classroom-layer';
    layer.className = 'app-classroom-layer';
    layer.style.display = 'none';
    var bar = doc.createElement('div');
    bar.className = 'app-classroom-bar';
    var back = doc.createElement('button');
    back.type = 'button';
    back.className = 'app-classroom-back';
    back.textContent = '‹ 返回';
    back.setAttribute('aria-label', '返回学生端');
    back.addEventListener('click', closeClassroom);
    var frame = doc.createElement('iframe');
    frame.className = 'app-classroom-frame';
    frame.setAttribute('allow', 'camera; microphone; fullscreen; autoplay; display-capture');
    frame.setAttribute('allowfullscreen', 'true');
    bar.appendChild(back);
    layer.appendChild(bar);
    layer.appendChild(frame);
    (doc.body || doc.documentElement).appendChild(layer);
    classroomLayer = { root: layer, frame: frame };
    return classroomLayer;
  }

  function isClassroomUrl(url) {
    return /(?:^|\/)classroom\.html(?:\?|$)/.test(String(url || ''));
  }

  function openClassroom(url) {
    // App 端：优先 Capacitor Browser 插件（真正的应用内 WebView，不跳出 App）
    var caps = global.Capacitor;
    var Browser = caps && caps.Plugins && caps.Plugins.Browser;
    if (platform !== 'web' && Browser && typeof Browser.open === 'function') {
      Browser.open({ url: toAbsolute(url), toolbarColor: '#1f6feb' }).catch(function () {
        openClassroomIframe(url); // 插件失败降级到 iframe
      });
      return;
    }
    openClassroomIframe(url);
  }

  function openClassroomIframe(url) {
    var layer = ensureLayer();
    layer.frame.src = toAbsolute(url);
    layer.root.style.display = 'flex';
    try { doc.body.classList.add('app-classroom-open'); } catch (e) { /* ignore */ }
  }

  function closeClassroom() {
    if (!classroomLayer) return false;
    if (classroomLayer.root.style.display === 'none') return false;
    classroomLayer.root.style.display = 'none';
    classroomLayer.frame.src = 'about:blank';
    try { doc.body.classList.remove('app-classroom-open'); } catch (e) { /* ignore */ }
    // 通知 Capacitor Browser 插件关闭（若曾用它打开）
    var caps = global.Capacitor;
    var Browser = caps && caps.Plugins && caps.Plugins.Browser;
    if (platform !== 'web' && Browser && typeof Browser.close === 'function') {
      Browser.close().catch(function () { /* ignore */ });
    }
    return true;
  }
  global.closeAppClassroom = closeClassroom;

  function toAbsolute(url) {
    if (/^https?:\/\//i.test(url) || /^capacitor:\/\//i.test(url)) return url;
    if (/^\/\//.test(url)) return location.protocol + url;
    var origin = (CFG.frontendOrigin || API_ORIGIN || '').replace(/\/+$/, '');
    if (origin && url.charAt(0) === '/') return origin + url;
    // 相对路径按当前文档基线解析
    return new URL(url, location.href).href;
  }

  function patchRouter() {
    var router = global.RouterAdapter;
    if (!router || typeof router.openUrl !== 'function') return false;
    if (router.__appBridgePatched) return true;
    var origOpen = router.openUrl;
    router.openUrl = function (url) {
      if (CLASSROOM_EMBED && isClassroomUrl(url)) {
        openClassroom(url);
        return Promise.resolve();
      }
      return origOpen.apply(router, arguments);
    };
    router.__appBridgePatched = true;
    return true;
  }

  // ---------- 4) Android 物理返回键 ----------
  function onBack() {
    if (closeClassroom()) return;
    if (global.history && global.history.length > 1) {
      global.history.back();
    } else if (global.APP_CONFIG && global.APP_CONFIG.exitOnBack) {
      var caps = global.Capacitor;
      var App = caps && caps.Plugins && caps.Plugins.App;
      if (App && typeof App.exitApp === 'function') App.exitApp();
    }
  }
  doc.addEventListener('backbutton', onBack, false); // Cordova 兼容
  doc.addEventListener('DOMContentLoaded', function () {
    var caps = global.Capacitor;
    var App = caps && caps.Plugins && caps.Plugins.App;
    if (App && App.addListener) {
      App.addListener('backButton', onBack);
    }
  });

  // ---------- install：首次同步尝试 + DOMContentLoaded 兜底 ----------
  function install() {
    patchNormalize();
    patchRouter();
  }
  install();
  doc.addEventListener('DOMContentLoaded', install);

  global.APP_BRIDGE = {
    platform: platform,
    openClassroom: openClassroom,
    closeClassroom: closeClassroom,
    toAbsolute: toAbsolute
  };
})(typeof window !== 'undefined' ? window : this);
