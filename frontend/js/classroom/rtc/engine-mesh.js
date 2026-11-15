/**
 * engine-mesh.js —— 原生 WebRTC（MESH）引擎
 *
 * 浏览器两两直连，不依赖任何媒体服务器（STUN/TURN 只做穿透）。
 * 这是默认引擎，也是所有商用引擎失败后的兜底路径。
 *
 * 协商规则：新成员广播 rtc-peer-join，userId 字典序较大的一方发 offer，
 * 避免双方同时 offer 造成 glare。ICE 候选走 WS 单播（to=对端 userId）。
 *
 * 人数上限：达到 maxPeers 后新成员的 rtc-peer-join 只登记在册、不再建连
 * （浏览器上行是 N-1 路，硬顶就这么多；硬撑只会让所有人一起卡）。
 */
(function () {
  function MeshRtcEngine(ctx, cfg) {
    this.name = 'native-mesh';
    this.topology = 'MESH';
    this.ctx = ctx || {};
    this.cfg = cfg || {};
    this.localStream = null;
    this.peers = {};          // userId -> RTCPeerConnection
    this.remoteStreams = {};  // userId -> MediaStream
    this.mediaOk = false;     // 兼容旧调用方：任一可用即 true
    this.audioOk = false;     // 拆分状态：麦克风是否可用
    this.videoOk = false;     // 拆分状态：摄像头是否可用
    this.joined = false;
    this.maxPeers = (cfg && cfg.maxPeers) ? cfg.maxPeers : 6;
    this.iceServers = (cfg && cfg.iceServers && cfg.iceServers.length)
      ? cfg.iceServers
      : [{ urls: ['stun:stun.l.google.com:19302'] }];
  }

  MeshRtcEngine.prototype.join = function () {
    var self = this;
    window.RtcTiles.local(this.ctx.userName);
    return this._startLocalMedia().then(function () {
      self.joined = true;
      self._broadcastJoin();
    });
  };

  /**
   * 采集本地音视频。
   * 与旧版差别：
   *  1. 音视频【分离】请求，任一设备缺失/被占用不再连累另一路（旧版一个 Promise 全废）；
   *  2. 应用课前准备页保存的设备偏好（deviceId exact，失效自动回退默认）；
   *  3. 错误按 NotAllowedError / NotFoundError / NotReadableError 等翻成中文自救提示；
   *  4. audioOk / videoOk 拆分，mediaOk 仅作兼容。
   */
  MeshRtcEngine.prototype._startLocalMedia = function () {
    var self = this;
    var MD = window.ClassroomMediaDevices;
    if (!MD || !MD.supported()) {
      this.audioOk = false; this.videoOk = false; this.mediaOk = false;
      window.RtcTiles.showVideo('local', false);
      this._toast(MD && !MD.isSecure()
        ? '当前页面不是 HTTPS/localhost，无法采集音视频'
        : '当前浏览器不支持音视频采集，已切换为仅观看');
      return Promise.resolve();
    }

    var prefs = MD.readPrefs();
    return MD.capture(prefs, { audio: true, video: true })
      .then(function (r) {
        self.localStream = r.stream;
        self.audioOk = r.audioOk;
        self.videoOk = r.videoOk;
        self.mediaOk = r.audioOk || r.videoOk;
        self._bindLocalVideo();
        window.RtcTiles.showVideo('local', r.videoOk);
        (r.errors || []).forEach(function (e) { self._toast(e.message); });
        if (!self.mediaOk) self._toast('未检测到可用的麦克风或摄像头，已切换为仅观看');
      });
  };

  /** 把合并后的本地流挂到预览 video（切换设备后 srcObject 不变，无需重挂） */
  MeshRtcEngine.prototype._bindLocalVideo = function () {
    var video = document.getElementById('vt-local-video');
    if (video && this.localStream && video.srcObject !== this.localStream) {
      video.srcObject = this.localStream;
    }
  };

  /**
   * 运行中切换指定设备：重新采集单路 + 对所有 RTCPeerConnection 做 replaceTrack，
   * 不触发 SDP 重协商（对端无感）。本地流对象保持不变，录制模块取到的 srcObject 也不断。
   */
  MeshRtcEngine.prototype.switchDevice = function (kind, deviceId) {
    var self = this;
    var MD = window.ClassroomMediaDevices;
    if (!MD || !MD.supported() || !this.localStream) return Promise.resolve(false);
    var isAudio = (kind === 'audio' || kind === 'audioinput');
    var labelKey = isAudio ? 'audioLabel' : 'videoLabel';
    var idKey = isAudio ? 'audioInputId' : 'videoInputId';

    var p = MD.readPrefs();
    p[idKey] = deviceId || '';
    p[labelKey] = '';
    return MD.enumerate().then(function (dev) {
      var list = isAudio ? (dev.audioinput || []) : (dev.videoinput || []);
      for (var i = 0; i < list.length; i++) {
        if (list[i].deviceId === deviceId) { p[labelKey] = list[i].label || ''; break; }
      }
      MD.writePrefs(p);
      var one = {};
      if (isAudio) one.audioInputId = deviceId || '';
      else one.videoInputId = deviceId || '';
      return MD.capture(one, isAudio ? { audio: true, video: false } : { audio: false, video: true });
    }).then(function (r) {
      var tracks = isAudio ? r.stream.getAudioTracks() : r.stream.getVideoTracks();
      if (!tracks.length) {
        (r.errors || []).forEach(function (e) { self._toast(e.message); });
        return false;
      }
      var oldTracks = isAudio ? self.localStream.getAudioTracks() : self.localStream.getVideoTracks();
      // 继承原轨道的 enabled 状态：用户已关麦/关摄像头时切换设备不应把它们重新打开
      var wasEnabled = oldTracks.length ? oldTracks[0].enabled : true;
      oldTracks.forEach(function (t) { self.localStream.removeTrack(t); try { t.stop(); } catch (e) {} });
      tracks.forEach(function (t) { t.enabled = wasEnabled; self.localStream.addTrack(t); });

      // 逐个 peer 找到对应 kind 的 sender 并 replaceTrack（不重协商）
      Object.keys(self.peers || {}).forEach(function (pid) {
        var pc = self.peers[pid];
        if (!pc || !pc.getSenders) return;
        (pc.getSenders() || []).forEach(function (sender) {
          var t = sender.track;
          if (!t) return;
          var same = isAudio ? (t.kind === 'audio') : (t.kind === 'video');
          if (same && sender.replaceTrack) {
            try { sender.replaceTrack(tracks[0]); } catch (e) { console.warn('[RTC] replaceTrack failed', e); }
          }
        });
      });

      if (isAudio) self.audioOk = true; else self.videoOk = true;
      self.mediaOk = self.audioOk || self.videoOk;
      if (!isAudio) {
        self._bindLocalVideo();
        window.RtcTiles.showVideo('local', true);
      }
      return true;
    }).catch(function (e) {
      self._toast('切换设备失败：' + ((e && e.message) || e));
      return false;
    });
  };

  MeshRtcEngine.prototype._broadcastJoin = function () {
    if (window.ClassroomWS && this.ctx.scheduleId) {
      // 规范化：以 displayName 为权威字段（与 enter/rest/getMembers 一致）；
      // 同时保留 name 以兼容旧接收端（后端对 rtc-peer-join 是透传，原样转发）。
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
        type: 'rtc-peer-join',
        from: this.ctx.userId,
        name: this.ctx.userName,
        displayName: this.ctx.userName,
        role: this.ctx.role
      });
    }
  };

  MeshRtcEngine.prototype.onSignal = function (msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'rtc-peer-join': this._onPeerJoin(msg); break;
      case 'rtc-peer-leave': this._onPeerLeave(msg); break;
      case 'rtc-offer': this._onOffer(msg); break;
      case 'rtc-answer': this._onAnswer(msg); break;
      case 'rtc-ice': this._onIce(msg); break;
      default: break;
    }
  };

  MeshRtcEngine.prototype._peer = function (peerId, name, role) {
    if (this.peers[peerId]) return this.peers[peerId];
    if (!window.RTCPeerConnection) return null;
    if (Object.keys(this.peers).length >= this.maxPeers) {
      this._toast('当前课堂人数已达 P2P 上限（' + this.maxPeers + '），你将只收不发');
      return null;
    }
    var self = this;
    var pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers[peerId] = pc;
    if (this.localStream) {
      this.localStream.getTracks().forEach(function (t) { pc.addTrack(t, self.localStream); });
    }
    pc.onicecandidate = function (e) {
      if (e.candidate && window.ClassroomWS) {
        window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
          type: 'rtc-ice', from: self.ctx.userId, to: peerId, candidate: e.candidate
        });
      }
    };
    pc.ontrack = function (e) {
      var stream = (e.streams && e.streams[0]) ? e.streams[0] : null;
      if (!stream) return;
      self.remoteStreams[peerId] = stream;
      window.RtcTiles.remote(peerId, name, role);
      var video = document.getElementById('vt-video-' + peerId);
      if (video) { video.srcObject = stream; video.style.display = ''; }
      window.RtcTiles.showVideo(peerId, true);
    };
    return pc;
  };

  MeshRtcEngine.prototype._onPeerJoin = function (msg) {
    var peerId = msg.from;
    if (!peerId || peerId === this.ctx.userId) return;
    var peerName = msg.displayName || msg.name;
    window.RtcTiles.remote(peerId, peerName, msg.role);
    // 字典序较大的一方发起 offer，避免双方同时发起
    if ((this.ctx.userId || '') > peerId) {
      this._createOffer(peerId, peerName, msg.role);
    }
  };

  MeshRtcEngine.prototype._onPeerLeave = function (msg) {
    var peerId = msg.from;
    if (!peerId) return;
    this._closePeer(peerId);
    window.RtcTiles.remove(peerId);
  };

  MeshRtcEngine.prototype._createOffer = function (peerId, name, role) {
    var self = this;
    var pc = this._peer(peerId, name, role);
    if (!pc) return;
    pc.createOffer()
      .then(function (offer) { return pc.setLocalDescription(offer); })
      .then(function () {
        window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
          type: 'rtc-offer', from: self.ctx.userId, to: peerId, sdp: pc.localDescription
        });
      })
      .catch(function (e) { console.warn('[RTC] createOffer failed', e); });
  };

  MeshRtcEngine.prototype._onOffer = function (msg) {
    var self = this;
    var peerId = msg.from;
    var peerName = msg.displayName || msg.name;
    var pc = this._peer(peerId, peerName, msg.role);
    if (!pc) return;
    window.RtcTiles.remote(peerId, peerName, msg.role);
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      .then(function () { return pc.createAnswer(); })
      .then(function (answer) { return pc.setLocalDescription(answer); })
      .then(function () {
        window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
          type: 'rtc-answer', from: self.ctx.userId, to: peerId, sdp: pc.localDescription
        });
      })
      .catch(function (e) { console.warn('[RTC] onOffer failed', e); });
  };

  MeshRtcEngine.prototype._onAnswer = function (msg) {
    var pc = this.peers[msg.from];
    if (pc && pc.signalingState !== 'stable') {
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        .catch(function (e) { console.warn('[RTC] onAnswer failed', e); });
    }
  };

  MeshRtcEngine.prototype._onIce = function (msg) {
    if (msg.to && msg.to !== this.ctx.userId) return;
    var pc = this.peers[msg.from];
    if (pc && msg.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        .catch(function () { /* 候选早于远端描述到达时忽略 */ });
    }
  };

  MeshRtcEngine.prototype._closePeer = function (peerId) {
    var pc = this.peers[peerId];
    if (pc) { try { pc.close(); } catch (e) { /* 已关闭 */ } }
    delete this.peers[peerId];
    delete this.remoteStreams[peerId];
  };

  MeshRtcEngine.prototype.setMicEnabled = function (on) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(function (t) { t.enabled = !!on; });
    }
    var m = document.getElementById('vt-local-muted');
    if (m) m.style.display = on ? 'none' : '';
    return !!on;
  };

  MeshRtcEngine.prototype.setCamEnabled = function (on) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(function (t) { t.enabled = !!on; });
    }
    var tile = document.getElementById('vt-local');
    if (tile) tile.classList.toggle('cam-off', !on);
    return !!on;
  };

  MeshRtcEngine.prototype.isJoined = function () {
    return this.joined;
  };

  MeshRtcEngine.prototype.leave = function () {
    var self = this;
    if (window.ClassroomWS && this.ctx.scheduleId) {
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
        type: 'rtc-peer-leave', from: this.ctx.userId
      });
    }
    Object.keys(this.peers).forEach(function (pid) { self._closePeer(pid); });
    if (this.localStream) {
      this.localStream.getTracks().forEach(function (t) { t.stop(); });
      this.localStream = null;
    }
    this.joined = false;
    this.mediaOk = false;
    this.audioOk = false;
    this.videoOk = false;
  };

  MeshRtcEngine.prototype._toast = function (msg) {
    if (typeof window.clToast === 'function') window.clToast(msg);
    else console.log('[RTC]', msg);
  };

  window.MeshRtcEngine = MeshRtcEngine;
})();
