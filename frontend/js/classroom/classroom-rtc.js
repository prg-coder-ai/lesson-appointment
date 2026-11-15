/**
 * classroom-rtc.js —— 音视频门面（对外唯一入口）
 *
 * 拆解后的分工：
 *   - 后端 com.classroom.rtc.* 决定「用哪家、怎么签凭证」，下发一份统一 config；
 *   - js/classroom/rtc/rtc-engine.js  选引擎（mesh / livekit / agora / trtc）；
 *   - js/classroom/rtc/engine-mesh.js 原生 WebRTC 全互联（默认 + 兜底）；
 *   - js/classroom/rtc/engine-sdk.js  商用/自建 SFU 适配。
 *
 * 本文件只做三件事：拉 config → 建引擎 → 把页面对 ClassroomRTC 的调用翻译给引擎。
 * 对外 API 与拆分前完全一致（controls / teacher / main 三个模块无需改动）。
 */
(function () {
  var ClassroomRTC = {
    ctx: null,
    engine: null,
    config: null,
    provider: 'native-mesh',
    topology: 'MESH',
    mediaOk: false,          // 兼容旧调用方：任一可用即 true
    audioOk: false,          // 麦克风是否可用（与 videoOk 拆分，避免一个设备缺失禁用全部按钮）
    videoOk: false,          // 摄像头是否可用
    micEnabled: true,
    camEnabled: true,
    serverMuted: false,

    init: function (ctx) {
      var self = this;
      this.ctx = ctx || {};
      // 引擎自降级回调：SDK 挂了就换 mesh，课堂不能没声音
      this.ctx.onFallback = function (reason) { self._fallbackToMesh(reason); };
      this._fetchConfig()
        .then(function (cfg) { self._applyConfig(cfg); })
        .catch(function (e) {
          console.warn('[RTC] 拉取媒体配置失败，使用原生 mesh', e);
          self._applyConfig(null);
        });
      return this;
    },

    _fetchConfig: function () {
      if (!this.ctx.scheduleId || !window.ClassroomAPI
          || typeof window.ClassroomAPI.getRtcConfig !== 'function') {
        return Promise.reject(new Error('课堂接口未就绪'));
      }
      return window.ClassroomAPI.getRtcConfig(this.ctx.apiBaseUrl, this.ctx.scheduleId);
    },

    _applyConfig: function (cfg) {
      this.config = cfg || null;
      if (cfg) {
        this.provider = cfg.provider || 'native-mesh';
        this.topology = String(cfg.topology || 'MESH').toUpperCase();
      } else {
        this.provider = 'native-mesh';
        this.topology = 'MESH';
      }
      this._buildEngine(cfg);
    },

    _buildEngine: function (cfg) {
      var self = this;
      if (!window.ClassroomRtcEngine) {
        this.toast('音视频模块未加载');
        return;
      }
      if (this.engine) {
        try { this.engine.leave(); } catch (e) { /* 旧引擎清理失败不影响重建 */ }
      }
      this.engine = window.ClassroomRtcEngine.create(this.ctx, cfg);
      this.provider = this.engine.name;
      this.topology = this.engine.topology;
      var grid = document.getElementById('video-grid');
      if (grid) grid.setAttribute('data-topology', this.topology);

      this.engine.join().then(function () {
        // 拆分状态：优先读引擎的 audioOk/videoOk，老引擎无此字段时回退到 mediaOk
        self.audioOk = (self.engine.audioOk != null) ? !!self.engine.audioOk : !!self.engine.mediaOk;
        self.videoOk = (self.engine.videoOk != null) ? !!self.engine.videoOk : !!self.engine.mediaOk;
        self.mediaOk = self.audioOk || self.videoOk;
        self.micEnabled = true;
        self.camEnabled = !(cfg && cfg.canPublishVideo === false);
        // 采集结果会改变控制栏按钮的可用态，重渲染一次
        if (window.ClassroomControls && typeof window.ClassroomControls.render === 'function') {
          try { window.ClassroomControls.render(); } catch (e) { /* console only */ }
        }
        // join 是异步的，门禁可能在 join 完成前就下发了；这里按当前课堂状态重新应用一次，
        // 否则课前/暂停时引擎刚采集完就把轨道打开，等于绕过发布门禁。
        if (window.ClassroomMain && typeof window.ClassroomMain.canPublish === 'function') {
          self.applyGate(window.ClassroomMain.canPublish(), window.ClassroomMain.getStatus());
        }
      });
    },

    /**
     * 发布门禁（由 ClassroomMain._applyGate 下发）：
     * 不可发布时直接关掉本地轨道（不经过门面 setCamEnabled，避免广播 cam-state 又触发门禁回执），
     * 恢复时按暂停前的开关状态还原。服务端同时在 WS 入口拦截所有新信令，双层保证不外发内容。
     */
    applyGate: function (allowed, status) {
      if (!allowed) {
        if (!this._preGate) this._preGate = { mic: this.micEnabled, cam: this.camEnabled };
        if (this.engine) {
          try { this.engine.setMicEnabled(false); } catch (e) { /* engine 未就绪 */ }
          try { this.engine.setCamEnabled(false); } catch (e) { /* engine 未就绪 */ }
        }
        this.micEnabled = false;
        this.camEnabled = false;
      } else if (this._preGate) {
        var p = this._preGate;
        this._preGate = null;
        if (this.engine) {
          try { this.engine.setMicEnabled(p.mic); } catch (e) { /* engine 未就绪 */ }
          try { this.engine.setCamEnabled(p.cam); } catch (e) { /* engine 未就绪 */ }
        }
        this.micEnabled = p.mic;
        this.camEnabled = p.cam;
      }
      var mic = document.getElementById('ctrl-mic');
      var cam = document.getElementById('ctrl-cam');
      if (mic) mic.classList.toggle('active', this.micEnabled);
      if (cam) cam.classList.toggle('active', this.camEnabled);
    },

    /** 课堂从非 LIVE 变为 LIVE 时重建媒体会话：课前发的 peer-join/offer 已被服务端门禁丢弃 */
    rejoin: function () {
      if (!window.ClassroomRtcEngine) return;
      this._buildEngine(this.config);
    },

    /** SDK 引擎失败兜底：强制换回 mesh（保留后端下发的 ICE/maxPeers，别把 TURN 丢了） */
    _fallbackToMesh: function (reason) {
      var meshCfg = {
        provider: 'native-mesh',
        topology: 'MESH',
        sdkType: 'native',
        maxPeers: (this.config && this.config.maxPeers) || 6,
        iceServers: (this.config && this.config.iceServers) || null
      };
      this.toast('已切换为原生音视频（' + (reason || '服务不可用') + '）');
      this._buildEngine(meshCfg);
    },

    // 信令分发：只有 mesh 引擎关心 SDP/ICE
    onSignal: function (msg) {
      if (this.engine && typeof this.engine.onSignal === 'function') {
        this.engine.onSignal(msg);
      }
    },

    setMicEnabled: function (on) {
      on = !!on;
      // 服务端全员禁言：学生不可自解（教师/管理员豁免）
      if (on && this.serverMuted && this._isStudent()) {
        this.toast('老师已全员禁言，暂不能开麦');
        return false;
      }
      this.micEnabled = this.engine ? this.engine.setMicEnabled(on) : on;
      return this.micEnabled;
    },

    setCamEnabled: function (on) {
      on = !!on;
      this.camEnabled = this.engine ? this.engine.setCamEnabled(on) : on;
      // F4-03：广播摄像头状态（教师关摄像头，学生端显式感知，刷新/重连者也能收到）
      if (window.ClassroomWS && this.ctx && this.ctx.scheduleId) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
          type: 'cam-state', on: on, userId: this.ctx.userId
        });
      }
      return this.camEnabled;
    },

    // F4-17：服务端全员禁言态（学生被强制静音且不可自解；教师/管理员豁免）
    setServerMuted: function (b) {
      this.serverMuted = !!b;
      if (b && this._isStudent()) {
        this.setMicEnabledDirect(false);
      }
    },

    // F4-14：教师批准开麦 → 解除禁言并开麦
    grantMic: function () {
      this.serverMuted = false;
      this.setMicEnabledDirect(true);
    },

    /** 绕过禁言闸门的底层开关（供 setServerMuted/grantMic 内部调用） */
    setMicEnabledDirect: function (on) {
      this.micEnabled = this.engine ? this.engine.setMicEnabled(!!on) : !!on;
      return this.micEnabled;
    },

    _isStudent: function () {
      var role = (this.ctx && this.ctx.role) || '';
      return role !== 'teacher' && role !== 'admin' && role !== 'platform_admin';
    },

    /** 本地采集流（录制模块取用；SDK 模式下从已渲染的本地 video 兜底） */
    getLocalStream: function () {
      if (this.engine && this.engine.localStream) return this.engine.localStream;
      var v = document.getElementById('vt-local-video');
      return (v && v.srcObject) ? v.srcObject : null;
    },

    updateLocalTile: function () {
      if (window.RtcTiles) window.RtcTiles.showVideo('local', !!(this.engine && this.engine.videoOk !== false && this.engine.mediaOk));
    },

    /** 设备枚举（供控制栏/设置弹层用；课前准备页已可直接选，这里主要给课堂内使用） */
    listDevices: function () {
      var MD = window.ClassroomMediaDevices;
      if (!MD) return Promise.resolve({ audioinput: [], videoinput: [], audiooutput: [], error: '设备模块未加载' });
      return MD.enumerate();
    },

    /** 运行中切换设备：委托当前引擎（mesh 走 replaceTrack，SFU 走各家 setDevice） */
    selectDevice: function (kind, deviceId) {
      if (!this.engine || typeof this.engine.switchDevice !== 'function') {
        this.toast('当前音视频模式不支持即时切换设备');
        return Promise.resolve(false);
      }
      return this.engine.switchDevice(kind, deviceId);
    },

    leave: function () {
      if (this.engine) {
        try { this.engine.leave(); } catch (e) { console.warn('[RTC] leave failed', e); }
        this.engine = null;
      }
      this.mediaOk = false;
      this.audioOk = false;
      this.videoOk = false;
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[RTC]', msg);
    }
  };

  window.ClassroomRTC = ClassroomRTC;
})();
