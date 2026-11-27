/**
 * classroom-screenshare.js —— 独立屏幕共享（教学投屏）
 * ============================================================================
 * 与「教学区域录制」（classroom-record.js 的 screen 模式）是两件事：
 *   · 录制：getDisplayMedia 的流进 MediaRecorder，只写本地文件；
 *   · 本模块：getDisplayMedia 的流作为**独立视频轨**发进课堂，其他端实时看到。
 *
 * 设计决策（2026-11-27 用户拍板）：
 *   1. 独立共享画面，与摄像头并存 —— 不替换 localStream 的视频轨；
 *      共享流是一份独立的 MediaStream，通过 pc.addTrack(screenTrack, screenStream)
 *      进入每个 peer connection，对端按 stream.id 前缀识别并渲染到独立格子。
 *   2. 范围用浏览器原生选择器 —— UI 的三个选项只是 displaySurface 提示，
 *      实际选整屏/窗口/区域由浏览器 picker 决定（Chrome 不允许代码强制指定）。
 *
 * 为什么 stream.id 前缀能识别：SDP 的 msid 会带 stream.id 到对端，ontrack 的
 * e.streams[0].id 与之一致。普通摄像头流来自 MediaDevices，id 是浏览器随机值，
 * 不会撞上我们加的 'screen-' 前缀。
 *
 * 重协商照抄 engine-mesh.js 的 _restorePublishing：
 *   加轨后必须 createOffer 才让对端收到新轨；字典序大的一方发 offer，小的一方
 *   发 rtc-peer-join(rejoin:true) 让对方重建后再发，避免两边同时 offer 造成 glare。
 *
 * 门禁：发布类操作，受 ClassroomMain.canPublish() 双层闸（controls + 本模块自验）。
 * 能力：web 端不支持 getDisplayMedia 或 iOS WebView 时隐藏按钮（app-no-display-capture）。
 */
(function () {
  'use strict';

  var SCREEN_STREAM_PREFIX = 'screen-';   // 共享流 id 前缀，对端据此分流到独立格子
  var SCREEN_TILE_PREFIX = 'vt-screen-';  // 独立格子 id 前缀

  var ScreenShare = {
    ctx: null,
    engine: null,
    screenStream: null,       // 本端正在共享的流（null = 未共享）
    screenPeers: {},          // peerId -> true：对端正在共享屏幕（由 screen-state 信令维护）
    cameraStreamIds: {},      // peerId -> 已渲染的摄像头流 id；防止 screen-state 先到时把摄像头误判为屏幕
    sharing: false,
    sendingAudio: false,      // 本次共享是否带系统声音
    scope: 'desktop',         // desktop / window / region（仅作 displaySurface 提示）

    init: function (ctx) {
      this.ctx = ctx || {};
      this.engine = (window.ClassroomRTC && window.ClassroomRTC.engine) || null;
      var close = document.getElementById('ss-close');
      if (close) close.addEventListener('click', this.closePanel.bind(this));
      var backdrop = document.querySelector('#screen-share-modal .ss-backdrop');
      if (backdrop) backdrop.addEventListener('click', this.closePanel.bind(this));
      return this;
    },

    /** 引擎重建（rejoin / SDK 回落）后重新取引用；共享中则先停下来，避免轨泄漏 */
    refreshEngine: function () {
      var next = (window.ClassroomRTC && window.ClassroomRTC.engine) || null;
      if (this.sharing && next !== this.engine) {
        try { this.stop(true); } catch (e) { /* 清理失败不阻断新引擎 */ }
      }
      this.engine = next;
    },

    supported: function () {
      var nav = navigator || {};
      var md = nav.mediaDevices || {};
      var appOk = !(window.AppPermissions && window.AppPermissions.platform === 'ios'
        && window.AppPermissions.isNative);
      return !!(typeof md.getDisplayMedia === 'function' && appOk);
    },

    /** mesh 走 addTrack+重协商；SDK/SFU 走各家 screen share API；都不支持才提示降级 */
    _isMesh: function () {
      return !!this.engine && this.engine.name === 'native-mesh';
    },

    _engineReady: function () {
      if (!this.engine) {
        this.toast('音视频尚未就绪，请稍后再试');
        return false;
      }
      if (!this._isMesh() && typeof this.engine.startScreenShare !== 'function') {
        this.toast('当前音视频模式不支持屏幕共享，请切换为原生音视频后重试');
        return false;
      }
      return true;
    },

    /**
     * 打开配置面板（范围三选 + 系统声音开关）。真实采集在 start() 里做，
     * 因为 getDisplayMedia 必须由用户手势直接触发，不能在异步回调里调。
     */
    openPanel: function () {
      if (!this.supported()) {
        this.toast('当前浏览器/平台不支持屏幕共享（需 Chrome/Edge 或桌面客户端）');
        return;
      }
      if (!this._engineReady()) return;
      var panel = document.getElementById('screen-share-modal');
      if (panel) {
        panel.classList.remove('hidden');
        this._syncPanel();
      }
    },

    closePanel: function () {
      var panel = document.getElementById('screen-share-modal');
      if (panel) panel.classList.add('hidden');
    },

    _syncPanel: function () {
      var self = this;
      ['desktop', 'window', 'region'].forEach(function (s) {
        var el = document.getElementById('ss-scope-' + s);
        if (el) el.classList.toggle('active', self.scope === s);
      });
      var sw = document.getElementById('ss-audio');
      if (sw) sw.checked = this.sendingAudio;
      var hint = document.getElementById('ss-hint');
      if (hint) {
        hint.textContent = this.scope === 'region'
          ? '区域范围：在下一步弹出的系统选择器里选择「共享区域」，实际可选项以浏览器为准。'
          : (this.scope === 'window'
            ? '应用窗口：在下一步弹出的系统选择器里选择要共享的窗口。'
            : '桌面：在下一步弹出的系统选择器里选择整个屏幕。');
      }
      var startBtn = document.getElementById('ss-start');
      if (startBtn) startBtn.style.display = this.sharing ? 'none' : '';
      var stopBtn = document.getElementById('ss-stop');
      if (stopBtn) stopBtn.style.display = this.sharing ? '' : 'none';
    },

    setScope: function (scope) {
      if (['desktop', 'window', 'region'].indexOf(scope) < 0) return;
      this.scope = scope;
      this._syncPanel();
    },

    setAudio: function (on) {
      this.sendingAudio = !!on;
      this._syncPanel();
    },

    /**
     * 开始共享。必须是用户手势直接调用（点按钮 → 这里 → getDisplayMedia），
     * 中间不能插入 await/Promise，否则浏览器会拒绝非手势授权。
     */
    start: function () {
      if (this.sharing) { this.toast('已经在共享屏幕了'); return; }
      if (!this.supported()) { this.toast('当前环境不支持屏幕共享'); return; }
      if (!this._engineReady()) return;
      if (!this._gateAllowed()) return;

      var self = this;

      // SFU/SDK 引擎：屏幕采集由各家 SDK 自己完成（LiveKit setScreenShareEnabled /
      // Agora createScreenVideoTrack / TRTC startScreenShare），这里不重复 getDisplayMedia。
      if (!this._isMesh()) {
        var p = this.engine.startScreenShare(this.sendingAudio);
        return Promise.resolve(p).then(function (ok) {
          if (!ok) { self.toast('当前音视频服务商不支持屏幕共享'); return; }
          self.sharing = true;
          self._broadcastState(true);
          self._setButtonActive(true);
          self.toast('屏幕共享已开始' + (self.sendingAudio ? '（含系统声音）' : ''));
        }).catch(function (e) {
          self.toast('无法共享屏幕：' + ((e && e.message) || e));
        });
      }

      var surface = this.scope === 'window' ? 'window'
        : (this.scope === 'region' ? 'browser' : 'monitor');
      var constraints = {
        video: { frameRate: 15, displaySurface: surface },
        // 用户可选择是否发送系统声音；浏览器 picker 仍可能要求二次确认。
        audio: this.sendingAudio
      };

      // getDisplayMedia 必须同步发起
      var p;
      try {
        p = navigator.mediaDevices.getDisplayMedia(constraints);
      } catch (e) {
        this.toast('无法启动屏幕共享：' + ((e && e.message) || e));
        return;
      }
      p.then(function (stream) { self._onStream(stream); })
        .catch(function (e) {
          var msg = (e && e.name === 'NotAllowedError') ? '已取消共享'
            : ('无法共享屏幕：' + ((e && e.message) || e));
          self.toast(msg);
        });
    },

    _onStream: function (stream) {
      var self = this;
      if (!stream || !stream.getVideoTracks || !stream.getVideoTracks().length) {
        this.toast('没有拿到屏幕画面');
        return;
      }
      if (this.sharing) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        return;
      }
      this.screenStream = stream;
      this.sharing = true;
      this.closePanel();

      // 让流 id 带可识别前缀：浏览器给的 id 是只读的，所以新建一份 stream 承载同一批轨。
      var tagged = new MediaStream();
      stream.getTracks().forEach(function (t) {
        // 三重识别标记中的两重：MediaStream.id（可选）+ 轨 label（普遍可写）。
        // 对端 onTrack 只要命中任一即可把流分流到独立格子，避免单一 id 不可覆盖时漏判。
        try {
          if (!t.label || t.label.indexOf(SCREEN_STREAM_PREFIX) !== 0) {
            Object.defineProperty(t, 'label', {
              value: SCREEN_STREAM_PREFIX + (t.kind || 'track') + '-' + (self.ctx.userId || 'local'),
              configurable: true
            });
          }
        } catch (e) { /* label 只读时还有 stream.id 与 screen-state 信令兜底 */ }
        tagged.addTrack(t);
      });
      try {
        Object.defineProperty(tagged, 'id', { value: SCREEN_STREAM_PREFIX + (this.ctx.userId || 'local') + '-' + Date.now() });
      } catch (e) { /* stream.id 不可覆盖：对端走 label / screen-state 识别 */ }
      this.screenStream = tagged;

      // maxPeers 优先级：屏幕共享比摄像头更"值钱"。已达发布上限时临时关掉摄像头轨
      // 给屏幕让路（recover 在 stop 里），避免两路视频互挤导致都卡。
      var eng = this.engine;
      if (this._isMesh() && eng && typeof eng._publishedCount === 'function'
          && typeof eng.maxPeers === 'number' && eng._publishedCount() >= eng.maxPeers
          && eng.localStream) {
        var vts = eng.localStream.getVideoTracks ? eng.localStream.getVideoTracks() : [];
        if (vts.length && vts[0].enabled) {
          this._camYielded = true;
          vts.forEach(function (t) { t.enabled = false; });
          this.toast('已达同时在线上限，共享期间暂时关闭摄像头以优先保证屏幕画面');
        }
      }

      // 用户停止共享（浏览器原生「停止共享」按钮）→ 自动收尾
      var vt = tagged.getVideoTracks()[0];
      if (vt && typeof vt.addEventListener === 'function') {
        vt.addEventListener('ended', function () {
          if (self.sharing) self.stop(true);
        });
      }

      this._publishToPeers();
      this._broadcastState(true);
      this._setButtonActive(true);
      this.toast('屏幕共享已开始' + (this.sendingAudio ? '（含系统声音）' : ''));
    },

    /** 把共享轨加进每个已建立的 peer connection，并按字典序触发重协商 */
    _publishToPeers: function () {
      var self = this;
      var eng = this.engine;
      if (!eng || !eng.peers || !this.screenStream) return;
      var tracks = this.screenStream.getTracks();
      Object.keys(eng.peers).forEach(function (pid) {
        if (eng._recvOnly && eng._recvOnly[pid]) return;
        var pc = eng.peers[pid];
        if (!pc) return;
        var added = false;
        tracks.forEach(function (t) {
          try { pc.addTrack(t, self.screenStream); added = true; } catch (e) { /* 连接已关闭 */ }
        });
        if (!added) return;
        // 与 _restorePublishing 同一套防 glare 规则
        if ((self.ctx.userId || '') > pid) {
          if (typeof eng._createOffer === 'function') eng._createOffer(pid);
        } else if (window.ClassroomWS) {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
            type: 'rtc-peer-join', from: self.ctx.userId,
            displayName: self.ctx.userName, role: self.ctx.role, rejoin: true
          });
        }
      });
    },

    /** 停止共享：mesh 移除轨道重协商 / SDK 走 stopScreenShare → 广播状态 */
    stop: function (silent) {
      if (!this.sharing) return;
      var self = this;
      var eng = this.engine;
      if (eng && !this._isMesh() && typeof eng.stopScreenShare === 'function') {
        try { eng.stopScreenShare(); } catch (e) { console.warn('[ScreenShare] SDK stop failed', e); }
      }
      if (eng && eng.peers && this._isMesh()) {
        Object.keys(eng.peers).forEach(function (pid) {
          var pc = eng.peers[pid];
          if (!pc || !pc.getSenders) return;
          (pc.getSenders() || []).forEach(function (sender) {
            var t = sender.track;
            if (!t || !self._isScreenTrack(t)) return;
            try { pc.removeTrack(sender); } catch (e) {}
          });
          if ((self.ctx.userId || '') > pid) {
            if (typeof eng._createOffer === 'function') eng._createOffer(pid);
          } else if (window.ClassroomWS) {
            window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
              type: 'rtc-peer-join', from: self.ctx.userId,
              displayName: self.ctx.userName, role: self.ctx.role, rejoin: true
            });
          }
        });
      }
      if (this.screenStream) {
        try { this.screenStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      }
      this.screenStream = null;
      this.sharing = false;
      this.sendingAudio = false;
      // 恢复因 maxPeers 让路而临时关闭的摄像头轨（仍需遵守用户原本的摄像头开关）
      if (this._camYielded && eng && eng.localStream && eng.localStream.getVideoTracks) {
        var shouldCamOn = !!(window.ClassroomRTC && window.ClassroomRTC.camEnabled);
        eng.localStream.getVideoTracks().forEach(function (t) { t.enabled = shouldCamOn; });
        this._camYielded = false;
      }
      this._broadcastState(false);
      this._setButtonActive(false);
      if (!silent) this.toast('屏幕共享已停止');
    },

    _isScreenTrack: function (track) {
      if (!this.screenStream || !track) return false;
      return this.screenStream.getTracks().indexOf(track) >= 0;
    },

    _broadcastState: function (on) {
      if (!window.ClassroomWS || !this.ctx || !this.ctx.scheduleId) return;
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
        type: 'screen-state', on: !!on, userId: this.ctx.userId,
        displayName: this.ctx.userName || this.ctx.userId,
        withAudio: !!this.sendingAudio
      });
    },

    /** 对端信令：建/拆独立格子并挂流；流晚于信令到达时由 onTrack 兜底 */
    onSignal: function (msg) {
      if (!msg || msg.type !== 'screen-state' || !msg.userId) return;
      if (msg.userId === (this.ctx && this.ctx.userId)) return;   // 自己的回执忽略
      if (msg.on) {
        this.screenPeers[msg.userId] = true;
        this._ensureTile(msg.userId, msg.displayName);
      } else {
        delete this.screenPeers[msg.userId];
        this._dropTile(msg.userId);
      }
    },

    /**
     * 收到新轨时由 mesh 引擎的 ontrack 转发过来，识别屏幕流并挂到独立格子。
     * 三重识别（任一命中即可）：stream.id 前缀 / 轨 label 前缀 / 该 peer 已广播 screen-state。
     * 三者并存是因为 MediaStream.id 与 track.label 的可写性各浏览器不一，
     * 而 screen-state 信令可能因握手时序晚于 ontrack 到达（反之亦然）。
     */
    onTrack: function (stream, peerId) {
      if (!stream || !peerId) return false;
      var isScreen = false;
      try {
        isScreen = /^screen-/.test(stream.id || '');
      } catch (e) { /* 老浏览器无 id */ }
      if (!isScreen) {
        try {
          var tracks = stream.getTracks ? stream.getTracks() : [];
          for (var i = 0; i < tracks.length; i++) {
            if (/^screen-/.test(tracks[i].label || '')) { isScreen = true; break; }
          }
        } catch (e2) { /* label 不可读 */ }
      }
      // 第三重：该 peer 广播过 screen-state，且这条流不是已记录的摄像头流。
      if (!isScreen && this.screenPeers[peerId]) {
        var knownCam = this.cameraStreamIds[peerId] || {};
        isScreen = !knownCam[stream.id];
      }
      if (!isScreen) {
        // 普通摄像头流：记下 id，避免 screen-state 先到时被误判成屏幕流
        try {
          this.cameraStreamIds[peerId] = this.cameraStreamIds[peerId] || {};
          this.cameraStreamIds[peerId][stream.id] = true;
          // 只清掉「信令预建的占位格子」（还没有屏幕视频源）。若屏幕流已挂上，绝不能删。
          var tile = document.getElementById(SCREEN_TILE_PREFIX + peerId);
          var video = tile && tile.querySelector('video');
          if (tile && (!video || !video.srcObject)) this._dropTile(peerId);
        } catch (e3) {}
        return false;
      }
      this._ensureTile(peerId, null);
      var video = document.getElementById('vt-screen-video-' + peerId);
      if (video) {
        video.srcObject = stream;
        video.style.display = '';
        video.play && video.play().catch(function () {});
      }
      this._showTileVideo(peerId, true);
      return true;
    },

    _ensureTile: function (peerId, name) {
      var grid = document.getElementById('video-grid');
      if (!grid) return null;
      var id = SCREEN_TILE_PREFIX + peerId;
      var tile = document.getElementById(id);
      if (tile) {
        if (name) {
          var lab = tile.querySelector('.vt-label');
          if (lab) lab.textContent = (name || peerId) + '（共享屏幕）';
        }
        return tile;
      }
      tile = document.createElement('div');
      tile.className = 'video-tile is-screenshare';
      tile.id = id;
      tile.innerHTML =
        '<div class="vt-avatar"><i class="fas fa-desktop"></i></div>' +
        '<video id="vt-screen-video-' + peerId + '" autoplay playsinline style="display:none;"></video>' +
        '<span class="vt-label">' + this._escape(name || peerId) + '（共享屏幕）</span>';
      grid.appendChild(tile);
      return tile;
    },

    _dropTile: function (peerId) {
      var tile = document.getElementById(SCREEN_TILE_PREFIX + peerId);
      if (tile && tile.parentNode) {
        var video = tile.querySelector('video');
        if (video) { try { video.srcObject = null; } catch (e) {} }
        tile.parentNode.removeChild(tile);
      }
    },

    _showTileVideo: function (peerId, on) {
      var tile = document.getElementById(SCREEN_TILE_PREFIX + peerId);
      if (!tile) return;
      var video = tile.querySelector('video');
      var avatar = tile.querySelector('.vt-avatar');
      if (video) video.style.display = on ? '' : 'none';
      if (avatar) avatar.style.display = on ? 'none' : 'flex';
    },

    _setButtonActive: function (on) {
      var btn = document.getElementById('ctrl-share');
      if (btn) btn.classList.toggle('active', !!on);
      var label = btn && btn.querySelector('span');
      if (label) label.textContent = on ? '停止共享' : '屏幕共享';
    },

    _gateAllowed: function () {
      if (window.ClassroomMain && typeof window.ClassroomMain.canPublish === 'function'
          && !window.ClassroomMain.canPublish()) {
        this.toast('当前课堂状态不允许发送屏幕内容');
        return false;
      }
      return true;
    },

    _escape: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[ScreenShare]', msg);
    }
  };

  window.ClassroomScreenShare = ScreenShare;
})();
