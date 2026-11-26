/**
 * 运行环境标识（标题栏徽标）
 * ==================================================================
 * 目的：同一个 www 产物会被塞进 5 种壳里跑，用户报障时第一句话往往是
 *      「我这边没问题」——但他是在浏览器里看的，还是在 Windows 桌面壳里看的，
 *      在界面上根本看不出来。所以把当前运行环境直接标在标题栏上。
 *
 * 取值（与 config/environments.js 的 mode 无关，纯看运行时）：
 *   web     浏览器（含手机浏览器）
 *   desktop Electron + Windows/Linux
 *   imac    Electron + macOS
 *   ios     Capacitor iOS（真机 / 模拟器）
 *   android Capacitor Android
 *
 * 判定顺序与理由：
 *   ① Capacitor.getPlatform() 优先 —— 原生壳里 UA 会带 Android/iOS 字样，
 *      但也可能是 WebView 自定义 UA，用官方 API 才可靠；
 *   ② Electron 的 UA 一定含 "Electron/x.y.z"，据此先分壳层，再按 UA 里的
 *      平台串分 desktop / imac（Electron 没有 getPlatform 之类的统一 API，
 *      process.platform 在渲染进程取不到——除非开 nodeIntegration，不划算）；
 *   ③ 其余按 UA 兜底（手机上直接开浏览器 -> web 之外的 ios/android 也算
 *      符合直觉：用户确实在 iOS/Android 上）。
 *
 * 注入位置：优先 .header .header-actions（师生页右上角），
 *          其次 .header / header / .mc-head（我的课堂自有页）。
 *           找不到标题栏就不注入，不硬插到 body 上——避免盖住内容。
 */
(function () {
  'use strict';

  var LABEL = {
    web: 'WEB',
    desktop: 'DESKTOP',
    imac: 'iMac',
    ios: 'iOS',
    android: 'Android'
  };

  function capPlatform() {
    var c = window.Capacitor;
    try {
      if (c && typeof c.getPlatform === 'function') return String(c.getPlatform() || '').toLowerCase();
    } catch (e) { /* 插件未就绪 */ }
    return '';
  }

  function detect() {
    var ua = (navigator && navigator.userAgent) || '';
    var cap = capPlatform();
    if (cap === 'ios' || cap === 'android') return cap;

    if (/\bElectron\//i.test(ua)) {
      if (/Macintosh|Mac OS X/i.test(ua)) return 'imac';
      return 'desktop';
    }

    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    return 'web';
  }

  function pickHost() {
    var q = [
      '.header .header-actions',   // 师生页右上角（放这里与「刷新/退出」同排，最不碍事）
      '.header',
      'header',
      '.mc-head'                   // 我的课堂自有页
    ];
    for (var i = 0; i < q.length; i++) {
      var el = document.querySelector(q[i]);
      if (el) return el;
    }
    return null;
  }

  function mount() {
    var env = detect();
    // 暴露给排障用（控制台可直接看 __CLASSROOM_ENV）
    window.__CLASSROOM_ENV = env;
    // 同时打一个 class 到根元素，供样式/埋点按环境做差异化
    try { document.documentElement.className += ' env-' + env; } catch (e) { /* 无 html 节点 */ }

    var host = pickHost();
    if (!host) return;
    if (host.querySelector('.app-env-chip')) return;   // 幂等：脚本重复加载不叠加

    var chip = document.createElement('span');
    chip.className = 'app-env-chip app-env-' + env;
    chip.textContent = LABEL[env] || env.toUpperCase();
    chip.title = '运行环境：' + (LABEL[env] || env);
    host.appendChild(chip);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
