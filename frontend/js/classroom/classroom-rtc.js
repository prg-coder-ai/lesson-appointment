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
    // 进入课堂默认关闭（2026-11-18）：先采集不被外发，由使用者主动打开。
    micEnabled: false,
    camEnabled: false,
    micGranted: false,       // 服务端是否已批准本学生发言（举手批准闭环的唯一判据）
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

    /**
     * @param {object} cfg RTC 配置
     * @param {boolean} [isRejoin] 媒体会话重建（LIVE 恢复 / SDK 回落）：
     *        旧引擎静默离房（不广播 peer-leave），新引擎的 join 带 rejoin 标记，
     *        由对端据标记无条件重建连接。
     */
    _buildEngine: function (cfg, isRejoin) {
      var self = this;
      if (!window.ClassroomRtcEngine) {
        this.toast('音视频模块未加载');
        return;
      }
      if (this.engine) {
        try { this.engine.leave(!!isRejoin); } catch (e) { /* 旧引擎清理失败不影响重建 */ }
      }
      this.engine = window.ClassroomRtcEngine.create(this.ctx, cfg);
      this.provider = this.engine.name;
      this.topology = this.engine.topology;
      var grid = document.getElementById('video-grid');
      if (grid) grid.setAttribute('data-topology', this.topology);

      this.engine.join(!!isRejoin).then(function () {
        // 拆分状态：优先读引擎的 audioOk/videoOk，老引擎无此字段时回退到 mediaOk
        self.audioOk = (self.engine.audioOk != null) ? !!self.engine.audioOk : !!self.engine.mediaOk;
        self.videoOk = (self.engine.videoOk != null) ? !!self.engine.videoOk : !!self.engine.mediaOk;
        self.mediaOk = self.audioOk || self.videoOk;
        if (isRejoin) {
          // 媒体会话重建（切引擎 / 网络恢复）：沿用重建前的开关。
          // 若在这里重置为关，用户刚打开的麦会莫名熄灭；重置为开则会绕过静音与授权。
          self.setMicEnabledDirect(!!self.micEnabled);
          self.setCamEnabled(!!self.camEnabled);
        } else {
          // 首次进房：麦克风与摄像头默认关闭，避免一进来就把画面声音推给全班。
          // 静默广播 cam-state，其他人只更新名单标记、不弹「XX 摄像头已关闭」提示。
          self.micEnabled = false;
          self.camEnabled = false;
          self.setMicEnabledDirect(false);
          self.setCamEnabled(false, true);
        }
        // 引擎就绪后刷新屏幕共享模块的引擎引用（init 早于本异步 join 时拿不到 engine）。
        // 若引擎是重建的，refreshEngine 会顺带停掉旧引擎上的共享轨，避免轨泄漏。
        if (window.ClassroomScreenShare && typeof window.ClassroomScreenShare.refreshEngine === 'function') {
          try { window.ClassroomScreenShare.refreshEngine(); } catch (e) { /* console only */ }
        }
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
        // 学生的麦克风只有在仍有教师授权时才恢复：暂停期间被撤回批准（或全员静音）的，
        // 恢复课堂后不能因为"暂停前是开着的"又自动开麦。
        var micRestore = !!p.mic && (!this._isStudent() || this.micGranted);
        if (this.engine) {
          try { this.engine.setMicEnabled(micRestore); } catch (e) { /* engine 未就绪 */ }
          try { this.engine.setCamEnabled(p.cam); } catch (e) { /* engine 未就绪 */ }
        }
        this.micEnabled = micRestore;
        this.camEnabled = p.cam;
      }
      var cam = document.getElementById('ctrl-cam');
      this.syncMicUI();
      if (cam) cam.classList.toggle('active', this.camEnabled);
    },

    /** 课堂从非 LIVE 变为 LIVE 时重建媒体会话：课前发的 peer-join/offer 已被服务端门禁丢弃 */
    rejoin: function () {
      if (!window.ClassroomRtcEngine) return;
      // 引擎还没建起来（init 的 _fetchConfig 仍在途）：不要用可能为 null 的 config 抢建一个，
      // 那次 init 完成后会用真实配置 join 一次，且此时课堂已 LIVE、join 能过门禁。
      if (!this.engine) return;
      // 采集/进房仍在途中（joined=false）：此刻还没有任何 PC，等它自己 join 完广播即可，
      // 重复重建只会触发第二轮 getUserMedia。
      if (typeof this.engine.isJoined === 'function' && !this.engine.isJoined()) return;
      this._buildEngine(this.config, true);
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
      // 换引擎＝换了一套媒体会话，对端必须跟着重建（join 带 rejoin 标记）
      this._buildEngine(meshCfg, true);
    },

    // 信令分发：只有 mesh 引擎关心 SDP/ICE
    onSignal: function (msg) {
      if (this.engine && typeof this.engine.onSignal === 'function') {
        this.engine.onSignal(msg);
      }
    },

    /**
     * 补发 rtc-peer-join（2026-11-16 C）。
     * 进房时序里采集/广播可能早于 WS 握手完成，join 被静默丢弃 → 对方不知道我存在 → 没人发 offer。
     * main 在 WS 三通道 onOpen 时调这里补一次。
     */
    broadcastJoin: function () {
      if (this.engine && typeof this.engine.broadcastJoin === 'function') {
        return this.engine.broadcastJoin();
      }
      return false;   // 引擎未就绪/未进房，调用方按需退回 rejoin
    },

    setMicEnabled: function (on) {
      on = !!on;
      // 学生开麦双闸：全员禁言 > 教师授权。授权态由服务端权威下发（mic:grant）。
      if (on && this._isStudent()) {
        if (this.serverMuted) {
          this.toast('老师已全员禁言，暂不能开麦');
          return false;
        }
        if (!this.micGranted) {
          this.toast('请先举手，等待老师批准后发言');
          return false;
        }
      }
      this.micEnabled = this.engine ? this.engine.setMicEnabled(on) : on;
      return this.micEnabled;
    },

    /**
     * @param {boolean} on 开/关
     * @param {boolean} [silent] 不弹「XX 摄像头已关闭」提示（进房默认关闭这类批量场景用）
     */
    setCamEnabled: function (on, silent) {
      on = !!on;
      this.camEnabled = this.engine ? this.engine.setCamEnabled(on) : on;
      // F4-03：广播摄像头状态（教师关摄像头，学生端显式感知，刷新/重连者也能收到）
      if (window.ClassroomWS && this.ctx && this.ctx.scheduleId) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
          type: 'cam-state', on: on, userId: this.ctx.userId, silent: !!silent
        });
      }
      return this.camEnabled;
    },

    // F4-17：服务端全员禁言态（学生被强制静音且不可自解；教师/管理员豁免）
    setServerMuted: function (b) {
      this.serverMuted = !!b;
      if (b && this._isStudent()) {
        // 全员静音 = 收回发言权：授权一并清零，否则解除静音时学生会「自动恢复发言」
        this.micGranted = false;
        this.setMicEnabledDirect(false);
      }
      this.syncMicUI();
    },

    // F4-14：教师批准开麦 → 开麦并点亮图标（不解除全员禁言，禁言仍以服务端为准）
    grantMic: function () {
      this.micGranted = true;
      this.setMicEnabledDirect(true);
      this.syncMicUI();
    },

    // F4-14：撤销发言权（学生放下手 / 教师撤回 / 全员静音）→ 关麦熄灭图标
    revokeMic: function () {
      this.micGranted = false;
      this.setMicEnabledDirect(false);
      this.syncMicUI();
    },

    /** 麦克风图标的唯一同步点：任何改 micEnabled 的路径都应调用 */
    syncMicUI: function () {
      var mic = document.getElementById('ctrl-mic');
      if (mic) mic.classList.toggle('active', !!this.micEnabled);
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
      // 先停屏幕共享：它持有独立的 getDisplayMedia 流，不随 localStream 一起被 stop，
      // 漏掉会导致浏览器标签上的「共享中」指示灯一直亮着。
      if (window.ClassroomScreenShare && window.ClassroomScreenShare.sharing) {
        try { window.ClassroomScreenShare.stop(true); } catch (e) { /* console only */ }
      }
      if (this.engine) {
        try { this.engine.leave(); } catch (e) { console.warn('[RTC] leave failed', e); }
        this.engine = null;
      }
      this.mediaOk = false;
      this.audioOk = false;
      this.videoOk = false;
      this.micGranted = false;
      this.micEnabled = false;
      this.camEnabled = false;
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[RTC]', msg);
    }
  };

  window.ClassroomRTC = ClassroomRTC;
})();
