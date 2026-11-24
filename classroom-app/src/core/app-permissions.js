/**
 * App 场景音视频权限引导 + 能力降级（FP-007）
 * ==================================================================
 * 由 patch.js 注入到 www 的 classroom.html / classroom-prep.html。
 *
 * 背景：原 media-devices.js 的权限拒绝提示是浏览器文案（"点击地址栏锁形图标"），
 * 在 Capacitor WebView 里不适用——App 用户需要知道去系统设置里授权。
 * 本脚本不改原文件，只做三件不侵入业务的事：
 *   1) 监听 getUserMedia / getDisplayMedia 的 NotAllowedError，弹 App 场景提示；
 *   2) 能力探测：iOS WebView 无 getDisplayMedia 时，给"录制/屏幕共享"按钮打不可用标记；
 *   3) 提供 window.AppPermissions 供业务/引导页查询平台与权限状态。
 *
 * classic script + IIFE，零顶层标识符污染，幂等（重复加载不重复包装）。
 */
(function (global) {
  'use strict';

  var nav = global.navigator;
  if (!nav || !nav.mediaDevices) return;

  var platform = global.APP_PLATFORM || 'web';
  var isNative = (platform === 'ios' || platform === 'android');
  var prompted = {}; // 同类错误只提示一次，避免刷屏

  function warn(msg) {
    if (global.console && console.warn) console.warn('[app-permissions] ' + msg);
  }

  function humanMsg(kind, err) {
    var name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      if (isNative) {
        return '需要相机/麦克风权限：请到系统「设置 → 应用 → 权限」中允许本 App 使用相机和麦克风，然后重试。';
      }
      return '浏览器拒绝了音视频权限，请在地址栏权限图标中允许相机/麦克风后重试。';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
      return '未检测到可用的' + (kind === 'video' ? '摄像头' : '麦克风') + '设备，请检查设备连接。';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return '设备被其他程序占用，请关闭占用相机/麦克风的应用后重试。';
    }
    return '音视频设备启动失败（' + name + '），请检查权限或设备后重试。';
  }

  function toast(msg) {
    // 复用项目 ui-kit 的 toast（若存在），否则用原生 alert（仅一次）
    try {
      if (global.UIKit && typeof global.UIKit.toast === 'function') { global.UIKit.toast(msg); return; }
      if (typeof global.showToast === 'function') { global.showToast(msg); return; }
    } catch (e) { /* ignore */ }
    if (global.console && console.error) console.error(msg);
  }

  // ---------- 1) 包装 getUserMedia ----------
  var gUM = nav.mediaDevices.getUserMedia;
  if (gUM && !gUM.__appPermWrapped) {
    function wrappedGUM(constraints) {
      var self = this;
      return gUM.call(self, constraints).catch(function (err) {
        var name = (err && err.name) || '';
        var key = 'gUM:' + name;
        if (!prompted[key]) {
          prompted[key] = true;
          var kind = (constraints && constraints.video) ? 'video' : 'audio';
          toast(humanMsg(kind, err));
        }
        throw err; // 保持原错误语义，业务 catch 仍可处理
      });
    }
    wrappedGUM.__appPermWrapped = true;
    try { nav.mediaDevices.getUserMedia = wrappedGUM; } catch (e) { warn('无法包装 getUserMedia'); }
  }

  // ---------- 2) getDisplayMedia 能力降级 ----------
  var hasDisplay = !!(nav.mediaDevices.getDisplayMedia);
  // iOS WebView 即便有该方法也常不可用；标记供样式/业务隐藏按钮
  var displayUsable = hasDisplay && !(platform === 'ios' && isNative);
  if (!displayUsable) {
    if (global.document) {
      global.document.documentElement.classList.add('app-no-display-capture');
    }
    warn('屏幕共享在当前平台不可用，已标记 app-no-display-capture');
  }

  // ---------- 3) 查询接口 ----------
  global.AppPermissions = {
    platform: platform,
    isNative: isNative,
    camera: !!(nav.mediaDevices.getUserMedia),
    displayCapture: displayUsable,
    hint: function (err) { return humanMsg('audio', err); }
  };
})(typeof window !== 'undefined' ? window : this);
