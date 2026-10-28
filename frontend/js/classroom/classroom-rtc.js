/**
 * classroom-rtc.js —— WebRTC 音视频模块
 *
 * 说明：后端 classroom-service 仅提供 WS 广播转发（/ws/classrooms/{sid}/signal），
 * 不返回 rtcConfig，也无独立信令服务器。因此本模块采用「WS signal 通道 + 浏览器原生
 * RTCPeerConnection」实现 Mesh 音视频协商：
 *   - 本地：getUserMedia 采集，渲染本地 tile（镜像）
 *   - 协商：新成员加入广播 rtc-peer-join；按 userId 字典序决定 offer 发起方，避免双发冲突
 *   - 交换：rtc-offer / rtc-answer / rtc-ice
 *   - 降级：无摄像头/无权限/不支持时显示头像占位，不阻断其他功能
 */
(function () {
  var config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  var ClassroomRTC = {
    ctx: null,
    localStream: null,
    peers: {},          // userId -> RTCPeerConnection
    remoteStreams: {},  // userId -> MediaStream
    grid: null,
    mediaOk: false,
    micEnabled: true,
    camEnabled: true,

    init: function (ctx) {
      this.ctx = ctx || {};
      this.grid = document.getElementById('video-grid');
      this.renderLocalTile();
      this.startLocalMedia();
      return this;
    },

    // 信令分发入口：由 classroom-main.js 的 WS onSignal 统一调用
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case 'rtc-peer-join': this.onPeerJoin(msg); break;
        case 'rtc-peer-leave': this.onPeerLeave(msg); break;
        case 'rtc-offer': this.onOffer(msg); break;
        case 'rtc-answer': this.onAnswer(msg); break;
        case 'rtc-ice': this.onIce(msg); break;
        default: break;
      }
    },

    startLocalMedia: function () {
      var self = this;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.mediaOk = false;
        this.updateLocalTile();
        this.toast('当前浏览器不支持音视频采集，已切换为仅观看');
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(function (stream) {
          self.localStream = stream;
          self.mediaOk = true;
          self.updateLocalTile();
          self._broadcastJoin();
        })
        .catch(function (err) {
          self.mediaOk = false;
          self.updateLocalTile();
          self.toast('无法访问摄像头/麦克风：' + (err && err.name ? err.name : '未知错误'));
        });
    },

    _broadcastJoin: function () {
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
          type: 'rtc-peer-join',
          from: this.ctx.userId,
          name: this.ctx.userName,
          role: this.ctx.role
        });
      }
    },

    renderLocalTile: function () {
      if (!this.grid) return;
      var tile = document.createElement('div');
      tile.className = 'video-tile is-local';
      tile.id = 'vt-local';
      tile.innerHTML =
        '<div class="vt-avatar">' + this._initial(this.ctx.userName) + '</div>' +
        '<video id="vt-local-video" autoplay playsinline muted></video>' +
        '<span class="vt-label">' + this._escape(this.ctx.userName || '我') + '（我）</span>' +
        '<span class="vt-muted" id="vt-local-muted" style="display:none;"><i class="fas fa-microphone-slash"></i></span>';
      this.grid.appendChild(tile);
    },

    updateLocalTile: function () {
      var video = document.getElementById('vt-local-video');
      var tile = document.getElementById('vt-local');
      if (!tile) return;
      var avatar = tile.querySelector('.vt-avatar');
      if (this.mediaOk && this.localStream) {
        if (video && video.srcObject !== this.localStream) {
          video.srcObject = this.localStream;
        }
        if (avatar) avatar.style.display = 'none';
        if (video) video.style.display = '';
      } else {
        if (avatar) avatar.style.display = 'flex';
        if (video) video.style.display = 'none';
      }
    },

    setMicEnabled: function (on) {
      this.micEnabled = !!on;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(function (t) { t.enabled = on; });
      }
      var m = document.getElementById('vt-local-muted');
      if (m) m.style.display = on ? 'none' : '';
      return this.micEnabled;
    },

    setCamEnabled: function (on) {
      this.camEnabled = !!on;
      if (this.localStream) {
        this.localStream.getVideoTracks().forEach(function (t) { t.enabled = on; });
      }
      var tile = document.getElementById('vt-local');
      if (tile) tile.classList.toggle('cam-off', !on);
      return this.camEnabled;
    },

    // ---- WebRTC 协商 ----
    onPeerJoin: function (msg) {
      var peerId = msg.from;
      if (!peerId || peerId === this.ctx.userId) return;
      this.renderRemoteTile(peerId, msg.name, msg.role);
      // 字典序较大的一方发起 offer，避免双方同时发起
      if ((this.ctx.userId || '') > peerId) {
        this.createOffer(peerId);
      }
    },

    onPeerLeave: function (msg) {
      var peerId = msg.from;
      if (!peerId) return;
      this.closePeer(peerId);
      var tile = document.getElementById('vt-' + peerId);
      if (tile && tile.parentNode) tile.parentNode.removeChild(tile);
    },

    _peer: function (peerId) {
      if (this.peers[peerId]) return this.peers[peerId];
      if (!window.RTCPeerConnection) return null;
      var self = this;
      var pc = new RTCPeerConnection(config);
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
        if (stream) {
          self.remoteStreams[peerId] = stream;
          var video = document.getElementById('vt-video-' + peerId);
          if (video) { video.srcObject = stream; video.style.display = ''; }
          var avatar = document.querySelector('#vt-' + peerId + ' .vt-avatar');
          if (avatar) avatar.style.display = 'none';
        }
      };
      return pc;
    },

    createOffer: function (peerId) {
      var self = this;
      var pc = this._peer(peerId);
      if (!pc) return;
      pc.createOffer()
        .then(function (offer) { return pc.setLocalDescription(offer); })
        .then(function () {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
            type: 'rtc-offer', from: self.ctx.userId, to: peerId, sdp: pc.localDescription
          });
        })
        .catch(function (e) { console.warn('[RTC] createOffer failed', e); });
    },

    onOffer: function (msg) {
      var self = this;
      var peerId = msg.from;
      var pc = this._peer(peerId);
      if (!pc) return;
      this.renderRemoteTile(peerId);
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        .then(function () { return pc.createAnswer(); })
        .then(function (answer) { return pc.setLocalDescription(answer); })
        .then(function () {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
            type: 'rtc-answer', from: self.ctx.userId, to: peerId, sdp: pc.localDescription
          });
        })
        .catch(function (e) { console.warn('[RTC] onOffer failed', e); });
    },

    onAnswer: function (msg) {
      var pc = this.peers[msg.from];
      if (pc && pc.signalingState !== 'stable') {
        pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          .catch(function (e) { console.warn('[RTC] onAnswer failed', e); });
      }
    },

    onIce: function (msg) {
      if (msg.to && msg.to !== this.ctx.userId) return;
      var pc = this.peers[msg.from];
      if (pc && msg.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
          .catch(function (e) { /* 候选到达早于远端描述时忽略 */ });
      }
    },

    closePeer: function (peerId) {
      var pc = this.peers[peerId];
      if (pc) { try { pc.close(); } catch (e) {} }
      delete this.peers[peerId];
      delete this.remoteStreams[peerId];
    },

    renderRemoteTile: function (peerId, name, role) {
      if (!this.grid || document.getElementById('vt-' + peerId)) return;
      var tile = document.createElement('div');
      tile.className = 'video-tile';
      tile.id = 'vt-' + peerId;
      tile.innerHTML =
        '<div class="vt-avatar">' + this._initial(name) + '</div>' +
        '<video id="vt-video-' + peerId + '" autoplay playsinline style="display:none;"></video>' +
        '<span class="vt-label">' + this._escape(name || peerId) + (role ? '（' + this._escape(role) + '）' : '') + '</span>';
      this.grid.appendChild(tile);
    },

    leave: function () {
      var self = this;
      if (window.ClassroomWS && this.ctx.scheduleId) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, { type: 'rtc-peer-leave', from: this.ctx.userId });
      }
      Object.keys(this.peers).forEach(function (pid) { self.closePeer(pid); });
      if (this.localStream) {
        this.localStream.getTracks().forEach(function (t) { t.stop(); });
        this.localStream = null;
      }
    },

    _initial: function (name) {
      if (!name) return '?';
      return String(name).charAt(0).toUpperCase();
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[RTC]', msg);
    }
  };

  window.ClassroomRTC = ClassroomRTC;
})();