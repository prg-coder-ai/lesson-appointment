/**
 * engine-sdk.js —— 商用 / 自建 SFU（LiveKit / 腾讯 TRTC / 声网 Agora）引擎适配
 *
 * 三家 SDK 的 API 完全不一样，但页面只认一份引擎接口。本文件做三件事：
 *   1. 按 config.sdkType 动态加载对应 SDK（sdkUrl 由后端下发，可换 CDN / 内网地址）；
 *   2. 把各家的「进房 / 采集 / 订阅 / 开关轨道」翻译成统一接口；
 *   3. 任何一步失败（SDK 加载不出来、token 过期、厂商侧报错）都回落到 mesh，
 *      课堂不会因为换了服务商而打不开。
 *
 * 与 mesh 引擎的差别：SFU 模式下不需要 WS 信令交换 SDP/ICE（SDK 自己跟媒体服务器协商），
 * 所以 onSignal 是空实现——但举手/禁言/白板这些业务信令仍走 WS，由其它模块处理。
 */
(function () {
  function SdkRtcEngine(ctx, cfg) {
    this.name = cfg.sdkType || 'sdk';
    this.topology = 'SFU';
    this.ctx = ctx || {};
    this.cfg = cfg || {};
    this.degraded = false;
    this.joined = false;
    this.mediaOk = false;
    this.micOn = true;
    this.camOn = true;

    this._room = null;     // LiveKit Room
    this._client = null;   // Agora client
    this._trtc = null;     // TRTC instance
    this._localTracks = {}; // Agora 本地轨道（audio/video）
  }

  SdkRtcEngine.prototype.join = function () {
    var self = this;
    window.RtcTiles.local(this.ctx.userName);
    return window.ClassroomRtcEngine.loadScript(this.cfg.sdkUrl)
      .then(function () {
        var type = String(self.cfg.sdkType || '').toLowerCase();
        if (type === 'livekit') return self._joinLiveKit();
        if (type === 'agora') return self._joinAgora();
        if (type === 'trtc') return self._joinTrtc();
        throw new Error('未知 SDK 类型：' + type);
      })
      .then(function () {
        self.joined = true;
        self.mediaOk = true;
      })
      .catch(function (e) {
        // 已知的「SDK 还没被加载进来 / 凭证无效」都走降级，不让用户看到白屏
        self._fallback(e && e.message ? e.message : String(e));
      });
  };

  // ---------------- LiveKit ----------------
  SdkRtcEngine.prototype._joinLiveKit = function () {
    var self = this;
    var lib = window.LivekitClient;
    if (!lib || !lib.Room) throw new Error('LiveKit SDK 未挂载');
    var room = new lib.Room({ adaptiveStream: true, dynacast: true });
    this._room = room;

    room.on(lib.RoomEvent.TrackSubscribed, function (track, pub, participant) {
      var pid = participant.identity;
      window.RtcTiles.remote(pid, participant.name || pid, participant.metadata ? self._roleOf(participant.metadata) : '');
      if (track.kind === 'video') {
        var el = document.getElementById('vt-video-' + pid);
        if (el) { track.attach(el); window.RtcTiles.showVideo(pid, true); }
      } else if (track.kind === 'audio') {
        track.attach(); // 音频无需容器，attach 到隐藏元素由 SDK 自理
      }
    });
    room.on(lib.RoomEvent.TrackUnsubscribed, function (track, pub, participant) {
      track.detach();
      window.RtcTiles.showVideo(participant.identity, false);
    });
    room.on(lib.RoomEvent.ParticipantDisconnected, function (participant) {
      window.RtcTiles.remove(participant.identity);
    });

    return room.connect(this.cfg.serverUrl, this.cfg.token)
      .then(function () {
        var videoOn = self.cfg.canPublishVideo !== false;
        return room.localParticipant.setMicrophoneEnabled(true)
          .then(function () { return room.localParticipant.setCameraEnabled(videoOn); })
          .then(function (pub) {
            if (pub && pub.track) {
              var el = document.getElementById('vt-local-video');
              if (el) pub.track.attach(el);
              window.RtcTiles.showVideo('local', true);
            } else {
              window.RtcTiles.showVideo('local', false);
            }
            self.camOn = videoOn;
          });
      });
  };

  SdkRtcEngine.prototype._roleOf = function (metadata) {
    try { return (JSON.parse(metadata) || {}).role || ''; } catch (e) { return ''; }
  };

  // ---------------- Agora ----------------
  SdkRtcEngine.prototype._joinAgora = function () {
    var self = this;
    var AgoraRTC = window.AgoraRTC;
    if (!AgoraRTC) throw new Error('声网 SDK 未挂载');
    var client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this._client = client;

    client.on('user-published', function (user, mediaType) {
      return client.subscribe(user, mediaType).then(function () {
        window.RtcTiles.remote(String(user.uid), user.uid, '');
        if (mediaType === 'video') {
          var el = document.getElementById('vt-video-' + user.uid);
          if (el) { user.videoTrack.play(el); window.RtcTiles.showVideo(String(user.uid), true); }
        } else if (mediaType === 'audio') {
          user.audioTrack.play();
        }
      });
    });
    client.on('user-unpublished', function (user, mediaType) {
      if (mediaType === 'video') window.RtcTiles.showVideo(String(user.uid), false);
    });
    client.on('user-left', function (user) {
      window.RtcTiles.remove(String(user.uid));
    });

    return client.join(this.cfg.serverUrl, this.cfg.roomId, this.cfg.token || null, this.cfg.userId)
      .then(function () {
        return AgoraRTC.createMicrophoneAudioTrack();
      })
      .then(function (micTrack) {
        self._localTracks.audio = micTrack;
        var jobs = [micTrack];
        if (self.cfg.canPublishVideo !== false) {
          return AgoraRTC.createCameraVideoTrack().then(function (camTrack) {
            self._localTracks.video = camTrack;
            var el = document.getElementById('vt-local-video');
            if (el) camTrack.play(el);
            window.RtcTiles.showVideo('local', true);
            return jobs.concat([camTrack]);
          });
        }
        window.RtcTiles.showVideo('local', false);
        self.camOn = false;
        return jobs;
      })
      .then(function (tracks) { return client.publish(tracks); });
  };

  // ---------------- TRTC ----------------
  SdkRtcEngine.prototype._joinTrtc = function () {
    var self = this;
    var TRTC = window.TRTC;
    if (!TRTC) throw new Error('TRTC SDK 未挂载');
    var trtc = TRTC.create();
    this._trtc = trtc;

    trtc.on(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, function (event) {
      var pid = String(event.userId);
      window.RtcTiles.remote(pid, pid, '');
      var el = document.getElementById('vt-video-' + pid);
      if (el) {
        trtc.startRemoteVideo({ userId: event.userId, streamType: event.streamType, view: el });
        window.RtcTiles.showVideo(pid, true);
      }
    });
    trtc.on(TRTC.EVENT.REMOTE_USER_EXIT, function (event) {
      window.RtcTiles.remove(String(event.userId));
    });

    var roomId = Number(this.cfg.roomId);
    return trtc.enterRoom({
      sdkAppId: Number(this.cfg.serverUrl),
      userId: this.cfg.userId,
      userSig: this.cfg.token,
      roomId: isNaN(roomId) ? this.cfg.roomId : roomId,
      scene: 'rtc'
    }).then(function () {
      return trtc.startLocalAudio();
    }).then(function () {
      if (self.cfg.canPublishVideo === false) {
        self.camOn = false;
        window.RtcTiles.showVideo('local', false);
        return null;
      }
      var el = document.getElementById('vt-local-video');
      return trtc.startLocalVideo({ view: el }).then(function () {
        window.RtcTiles.showVideo('local', true);
      });
    });
  };

  // ---------------- 统一控制 ----------------
  SdkRtcEngine.prototype.onSignal = function () {
    // SFU 下 SDP/ICE 由 SDK 与媒体服务器协商，不走 WS 信令通道
  };

  SdkRtcEngine.prototype.setMicEnabled = function (on) {
    this.micOn = !!on;
    var type = String(this.cfg.sdkType || '').toLowerCase();
    try {
      if (type === 'livekit' && this._room) {
        this._room.localParticipant.setMicrophoneEnabled(!!on);
      } else if (type === 'agora' && this._localTracks.audio) {
        on ? this._localTracks.audio.setEnabled(true) : this._localTracks.audio.setEnabled(false);
      } else if (type === 'trtc' && this._trtc) {
        on ? this._trtc.startLocalAudio() : this._trtc.stopLocalAudio();
      }
    } catch (e) {
      console.warn('[RTC] setMicEnabled failed', e);
    }
    var m = document.getElementById('vt-local-muted');
    if (m) m.style.display = on ? 'none' : '';
    return this.micOn;
  };

  SdkRtcEngine.prototype.setCamEnabled = function (on) {
    this.camOn = !!on;
    var type = String(this.cfg.sdkType || '').toLowerCase();
    try {
      if (type === 'livekit' && this._room) {
        this._room.localParticipant.setCameraEnabled(!!on);
      } else if (type === 'agora' && this._localTracks.video) {
        on ? this._localTracks.video.setEnabled(true) : this._localTracks.video.setEnabled(false);
      } else if (type === 'trtc' && this._trtc) {
        if (on) this._trtc.startLocalVideo({ view: document.getElementById('vt-local-video') });
        else this._trtc.stopLocalVideo();
      }
    } catch (e) {
      console.warn('[RTC] setCamEnabled failed', e);
    }
    var tile = document.getElementById('vt-local');
    if (tile) tile.classList.toggle('cam-off', !on);
    return this.camOn;
  };

  SdkRtcEngine.prototype.isJoined = function () {
    return this.joined;
  };

  SdkRtcEngine.prototype.leave = function () {
    var type = String(this.cfg.sdkType || '').toLowerCase();
    try {
      if (type === 'livekit' && this._room) {
        this._room.disconnect();
      } else if (type === 'agora' && this._client) {
        Object.keys(this._localTracks).forEach(function (k) {
          try { this._localTracks[k].close(); } catch (e) { /* noop */ }
        }, this);
        this._client.leave();
      } else if (type === 'trtc' && this._trtc) {
        this._trtc.exitRoom();
      }
    } catch (e) {
      console.warn('[RTC] leave failed', e);
    }
    this._room = null;
    this._client = null;
    this._trtc = null;
    this._localTracks = {};
    this.joined = false;
    this.mediaOk = false;
  };

  /** SDK 任何环节失败 → 交回门面重建 mesh 引擎（课堂上宁可降级也不能没声音） */
  SdkRtcEngine.prototype._fallback = function (reason) {
    if (this.degraded) return;
    this.degraded = true;
    console.warn('[RTC] SFU 引擎失败，回落 mesh：' + reason);
    try { this.leave(); } catch (e) { /* 清理失败也要降级 */ }
    if (typeof this.ctx.onFallback === 'function') {
      this.ctx.onFallback(reason);
    }
  };

  window.SdkRtcEngine = SdkRtcEngine;
})();
