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
    this.mediaOk = false;
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

  MeshRtcEngine.prototype._startLocalMedia = function () {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.mediaOk = false;
      window.RtcTiles.showVideo('local', false);
      this._toast('当前浏览器不支持音视频采集，已切换为仅观看');
      return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(function (stream) {
        self.localStream = stream;
        self.mediaOk = true;
        var video = document.getElementById('vt-local-video');
        if (video && video.srcObject !== stream) video.srcObject = stream;
        window.RtcTiles.showVideo('local', true);
      })
      .catch(function (err) {
        self.mediaOk = false;
        window.RtcTiles.showVideo('local', false);
        self._toast('无法访问摄像头/麦克风：' + (err && err.name ? err.name : '未知错误'));
      });
  };

  MeshRtcEngine.prototype._broadcastJoin = function () {
    if (window.ClassroomWS && this.ctx.scheduleId) {
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
        type: 'rtc-peer-join',
        from: this.ctx.userId,
        name: this.ctx.userName,
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
    window.RtcTiles.remote(peerId, msg.name, msg.role);
    // 字典序较大的一方发起 offer，避免双方同时发起
    if ((this.ctx.userId || '') > peerId) {
      this._createOffer(peerId, msg.name, msg.role);
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
    var pc = this._peer(peerId, msg.name, msg.role);
    if (!pc) return;
    window.RtcTiles.remote(peerId, msg.name, msg.role);
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
  };

  MeshRtcEngine.prototype._toast = function (msg) {
    if (typeof window.clToast === 'function') window.clToast(msg);
    else console.log('[RTC]', msg);
  };

  window.MeshRtcEngine = MeshRtcEngine;
})();
