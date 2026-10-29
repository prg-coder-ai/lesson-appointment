/**
 * rtc-engine.js —— RTC 引擎抽象层（前端侧）
 *
 * 后端只给一份统一契约（GET /classrooms/{sid}/rtc/config）：
 *   { topology: 'MESH'|'SFU', sdkType: 'native'|'livekit'|'agora'|'trtc',
 *     sdkUrl, serverUrl, token, roomId, iceServers, maxPeers, canPublishVideo, ... }
 * 本文件据此选出具体引擎，页面其它模块只跟「引擎接口」打交道：
 *
 *   engine.join()                 采集 + 进房（返回 Promise）
 *   engine.leave()                离房 + 释放采集
 *   engine.onSignal(msg)          WS 信令（仅 mesh 需要）
 *   engine.setMicEnabled(bool)    开/关麦（返回生效后的布尔）
 *   engine.setCamEnabled(bool)    开/关摄像头
 *   engine.isJoined()             是否已在房间
 *
 * 换服务商 = 后端换 provider，这里选到 sdkType=livekit/agora/trtc 就走商用 SDK，
 * 页面零改动；SDK 加载或进房失败会自动回落 mesh（见 SdkRtcEngine#_fallback）。
 */
(function () {
  var SCRIPT_CACHE = {};

  /** 动态加载外部 SDK（同一 URL 只加载一次，失败不缓存以便重试） */
  function loadScript(url) {
    if (!url) return Promise.reject(new Error('sdkUrl 为空'));
    if (SCRIPT_CACHE[url]) return SCRIPT_CACHE[url];
    SCRIPT_CACHE[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(url); };
      s.onerror = function () {
        delete SCRIPT_CACHE[url];
        reject(new Error('SDK 加载失败：' + url));
      };
      document.head.appendChild(s);
    });
    return SCRIPT_CACHE[url];
  }

  function create(ctx, cfg) {
    cfg = cfg || {};
    var topology = String(cfg.topology || 'MESH').toUpperCase();
    var sdkType = String(cfg.sdkType || 'native').toLowerCase();
    if (topology === 'SFU' && sdkType !== 'native' && cfg.sdkUrl && window.SdkRtcEngine) {
      return new window.SdkRtcEngine(ctx, cfg);
    }
    return new window.MeshRtcEngine(ctx, cfg);
  }

  // ---- 视频格子渲染（mesh 与 SDK 引擎共用，避免两份 DOM 逻辑走偏） ----
  var Tiles = {
    grid: function () { return document.getElementById('video-grid'); },

    local: function (name) {
      var grid = this.grid();
      if (!grid || document.getElementById('vt-local')) return;
      var tile = document.createElement('div');
      tile.className = 'video-tile is-local';
      tile.id = 'vt-local';
      tile.innerHTML =
        '<div class="vt-avatar">' + this.initial(name) + '</div>' +
        '<video id="vt-local-video" autoplay playsinline muted></video>' +
        '<span class="vt-label">' + this.escape(name || '我') + '（我）</span>' +
        '<span class="vt-muted" id="vt-local-muted" style="display:none;"><i class="fas fa-microphone-slash"></i></span>';
      grid.appendChild(tile);
    },

    remote: function (peerId, name, role) {
      var grid = this.grid();
      if (!grid || document.getElementById('vt-' + peerId)) return null;
      var tile = document.createElement('div');
      tile.className = 'video-tile';
      tile.id = 'vt-' + peerId;
      tile.innerHTML =
        '<div class="vt-avatar">' + this.initial(name) + '</div>' +
        '<video id="vt-video-' + peerId + '" autoplay playsinline style="display:none;"></video>' +
        '<span class="vt-label">' + this.escape(name || peerId) +
        (role ? '（' + this.escape(role) + '）' : '') + '</span>';
      grid.appendChild(tile);
      return tile;
    },

    remove: function (peerId) {
      var tile = document.getElementById('vt-' + peerId);
      if (tile && tile.parentNode) tile.parentNode.removeChild(tile);
    },

    /** 有画面时藏头像、显示 video；无画面时反过来 */
    showVideo: function (peerId, on) {
      var video = document.getElementById(peerId === 'local' ? 'vt-local-video' : 'vt-video-' + peerId);
      var tile = document.getElementById(peerId === 'local' ? 'vt-local' : 'vt-' + peerId);
      if (!tile) return;
      var avatar = tile.querySelector('.vt-avatar');
      if (video) video.style.display = on ? '' : 'none';
      if (avatar) avatar.style.display = on ? 'none' : 'flex';
    },

    initial: function (name) {
      if (!name) return '?';
      return String(name).charAt(0).toUpperCase();
    },

    escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
  };

  window.ClassroomRtcEngine = { create: create, loadScript: loadScript };
  window.RtcTiles = Tiles;
})();
