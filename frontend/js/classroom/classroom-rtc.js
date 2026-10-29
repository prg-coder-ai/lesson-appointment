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
    mediaOk: false,
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
        self.mediaOk = !!self.engine.mediaOk;
        self.micEnabled = true;
        self.camEnabled = !(cfg && cfg.canPublishVideo === false);
        // 采集结果会改变控制栏按钮的可用态，重渲染一次
        if (window.ClassroomControls && typeof window.ClassroomControls.render === 'function') {
          try { window.ClassroomControls.render(); } catch (e) { /* console only */ }
        }
      });
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

    updateLocalTile: function () {
      if (window.RtcTiles) window.RtcTiles.showVideo('local', !!(this.engine && this.engine.mediaOk));
    },

    leave: function () {
      if (this.engine) {
        try { this.engine.leave(); } catch (e) { console.warn('[RTC] leave failed', e); }
        this.engine = null;
      }
      this.mediaOk = false;
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[RTC]', msg);
    }
  };

  window.ClassroomRTC = ClassroomRTC;
})();
