/**
 * engine-mesh.js —— 原生 WebRTC（MESH）引擎
 *
 * 浏览器两两直连，不依赖任何媒体服务器（STUN/TURN 只做穿透）。
 * 这是默认引擎，也是所有商用引擎失败后的兜底路径。
 *
 * 协商规则：新成员广播 rtc-peer-join，userId 字典序较大的一方发 offer，
 * 避免双方同时 offer 造成 glare。ICE 候选走 WS 单播（to=对端 userId）。
 *
 * 人数上限：达到 maxPeers 后，新对端仍建连但**不加入本地音视频轨道**——
 * 即真正的「只收不发」：他看得到/听得到你，你看不到/听不到他。
 * （浏览器上行是 N-1 路，硬顶就这么多；硬撑只会让所有人一起卡，
 *  但完全不建连会让人在新课堂里"凭空消失"，比降级体验更差。）
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
    // peerId -> true：该对端只收不发（超出上行上限，未加入本地轨道）。
    // 不能只看 peers 数量：重建连接时会先 _closePeer 再 _peer，
    // 数量瞬间少 1 就会误判为"不超限"从而把轨道加进去，导致发布状态来回抖。
    this._recvOnly = {};
    this._capNotified = false;
    this.iceServers = (cfg && cfg.iceServers && cfg.iceServers.length)
      ? cfg.iceServers
      : [{ urls: ['stun:stun.l.google.com:19302'] }];
  }

  /**
   * @param {boolean} [isRejoin] 由门面重建引擎（LIVE 恢复/引擎回落）发起，
   *        广播的 join 会带 rejoin 标记，让对端无条件重建连接（旧的已随旧引擎作废）。
   */
  MeshRtcEngine.prototype.join = function (isRejoin) {
    var self = this;
    window.RtcTiles.local(this.ctx.userName);
    return this._startLocalMedia().then(function () {
      self.joined = true;
      self._broadcastJoin(false, isRejoin);
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

  MeshRtcEngine.prototype._broadcastJoin = function (reply, rejoin) {
    if (!window.ClassroomWS || !this.ctx.scheduleId) return false;
    // 重建标记要「跨补发」保留：若这条 join 因 WS 未就绪被丢弃，onOpen 补发时必须
    // 仍然带上 rejoin，否则对端会以为我没事、继续用旧 PC，等于重建白做。
    if (rejoin) this._rejoinMark = true;
    // 规范化：以 displayName 为权威字段（与 enter/rest/getMembers 一致）；
    // 同时保留 name 以兼容旧接收端（后端对 rtc-peer-join 是透传，原样转发）。
    // 返回值告诉调用方「这条 join 有没有真的发出去」，false 表示 WS 未就绪、已被丢弃，
    // 需要由 broadcastJoin() 在 onOpen 后补发。
    var sent = window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
      type: 'rtc-peer-join',
      from: this.ctx.userId,
      name: this.ctx.userName,
      displayName: this.ctx.userName,
      role: this.ctx.role,
      reply: !!reply,                    // true = 对别人 join 的应答，收到后不再回，防无限回环
      rejoin: !!this._rejoinMark         // true = 我重建了媒体会话，我的旧连接已作废，请无条件重建
    });
    if (sent) this._rejoinMark = false;  // 真发出去了才清，否则留给补发
    return sent;
  };

  /**
   * WS 信令就绪后补发 join（2026-11-16 C）。
   * 采集/进房可能早于 WS 握手完成，此时 join 被静默丢弃 → 对方不知道我存在 → 没人发 offer。
   * 门面在 WS 三通道 onOpen 时调用这里补一次，保证握手后必达。
   */
  MeshRtcEngine.prototype.broadcastJoin = function () {
    if (!this.joined) return false;   // 采集还没完，join() 完成时会自行广播（那时 WS 已通）
    return this._broadcastJoin();
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

  /** 仍在「发布」（把本地音视频发出去）的对端数——超出 maxPeers 的那些不算 */
  MeshRtcEngine.prototype._publishedCount = function () {
    var self = this;
    var n = 0;
    Object.keys(this.peers).forEach(function (id) {
      if (!self._recvOnly[id]) n++;
    });
    return n;
  };

  MeshRtcEngine.prototype._peer = function (peerId, name, role) {
    if (this.peers[peerId]) return this.peers[peerId];
    if (!window.RTCPeerConnection) return null;
    var self = this;
    // 上行熔断：超出 maxPeers 后不再加入本地轨道，但连接照建——
    // 这样降级的是「我的声音/画面出不去」，不是我整个人从课堂里消失。
    var overLimit = this._publishedCount() >= this.maxPeers;
    var pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers[peerId] = pc;
    if (overLimit) {
      this._recvOnly[peerId] = true;
      if (!this._capNotified) {
        this._capNotified = true;
        this._toast('已在线上限（' + this.maxPeers + ' 路上行），你的麦克风与摄像头暂不外发；'
          + '你仍能看到其他人的画面，有人离开后会自动恢复');
      }
      console.info('[RTC] 超过 P2P 上限，该对端按只收不发建立:', peerId);
    } else if (this.localStream) {
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
    // 补发机制（broadcastJoin / reply join）会让同一对端发来多条 join，这里必须幂等：
    //  - msg.rejoin：对端重建了媒体会话，它的旧 PC 已作废 → 我这边无条件拆掉重建；
    //  - 连接健康（new/connecting/connected 且已有协商动作）→ 直接返回，别打断在途 offer；
    //  - 死连接（failed/closed/disconnected）→ 清掉重建；
    //  - 空转态（PC 建了但没发出 offer：new + stable）→ 也清掉重建，
    //    否则一次 createOffer 失败会让这对端永久卡死、再也不会重试。
    var existing = this.peers[peerId];
    if (existing) {
      var connSt = existing.connectionState || existing.iceConnectionState;
      var sigSt = existing.signalingState;
      var dead = (connSt === 'failed' || connSt === 'closed' || connSt === 'disconnected');
      // idle：PC 建好但 offer 还没落定（new + stable）。正在 createOffer 途中时它也是这个
      // 状态，所以要排除 negotiating，否则重复 join 会把在途协商拆掉。
      var negotiating = !!(this._offering && this._offering[peerId]);
      var idle = (connSt === 'new' && sigSt === 'stable' && !negotiating);
      if (msg.rejoin || dead || idle) {
        this._closePeer(peerId);   // 对端已重建 / 死连接 / 空转 → 拆掉重来
      } else {
        return;                    // 健康或在途协商 → 忽略重复 join
      }
    }
    if ((this.ctx.userId || '') > peerId) {
      // 字典序较大的一方发起 offer，避免双方同时发起
      this._createOffer(peerId, peerName, msg.role);
    } else if (!msg.reply) {
      // 我是字典序较小的一方：按规则不发 offer，但对方可能并不知道我存在
      // （他先进房，我课前那条 join 已被服务端门禁丢弃）。回一条 join 告诉他我在，
      // 由他发 offer 完成协商。带 reply 标记，对方收到后不会再回，不会无限回环。
      this._broadcastJoin(true);
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
    // 补发/回执可能在同一时刻再触发一次：已有本地 offer 或正在协商时直接跳过，
    // 否则重复 createOffer 会抛 InvalidStateError 并把在途协商搅乱。
    if (this._offering && this._offering[peerId]) return;
    var pc = this._peer(peerId, name, role);
    if (!pc) return;
    if (pc.signalingState !== 'stable') return;   // 已在协商中（have-local-offer 等）
    this._offering = this._offering || {};
    this._offering[peerId] = true;
    pc.createOffer()
      .then(function (offer) { return pc.setLocalDescription(offer); })
      .then(function () {
        window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
          type: 'rtc-offer', from: self.ctx.userId, to: peerId, sdp: pc.localDescription
        });
      })
      .catch(function (e) { console.warn('[RTC] createOffer failed', e); })
      .then(function () { delete self._offering[peerId]; });
  };

  MeshRtcEngine.prototype._onOffer = function (msg) {
    // 服务端对 rtc-* 是**房间广播**（ClassroomSignalHandler 对未知类型统一 broadcastSignalExcept），
    // 不是按 to 单播。不收 to 过滤的话：3 人以上课堂里 A→B 的 offer C 也会接下并回 answer，
    // A 可能把 C 的 answer 套到发给 C 的会话上 → SDP 错配、某人黑屏或反复重建。
    if (msg.to && msg.to !== this.ctx.userId) return;
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
    // 同 _onOffer：answer 也是房间广播，必须只认发给自己的那条，
    // 否则会把别人的 answer 塞进本地的 setRemoteDescription。
    if (msg.to && msg.to !== this.ctx.userId) return;
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
    delete this._recvOnly[peerId];
    // 协商中途被关闭时要清掉在途标记，否则该对端后续所有 _createOffer 都会被挡掉
    if (this._offering) delete this._offering[peerId];
    // 走了一个人 → 上行名额空出来了，把「只收不发」的对端升级回正常发布。
    // 必须异步：当前可能正处于 _onPeerJoin 的重建流程里（先 close 再 _peer）。
    var self = this;
    setTimeout(function () { self._restorePublishing(); }, 0);
  };

  /**
   * 把超出上限而降级为「只收不发」的对端升级回正常发布。
   *
   * <p>升级必须重新协商：轨道是 SDP 的一部分，仅 addTrack 不会让对方收到新轨。
   * 发起方向仍遵守字典序（大的一方 createOffer），小的一方发一条 rejoin
   * 让对方重建连接后再发 offer，避免两边同时 offer 造成 glare。</p>
   */
  MeshRtcEngine.prototype._restorePublishing = function () {
    var self = this;
    Object.keys(this._recvOnly).forEach(function (id) {
      if (self._publishedCount() >= self.maxPeers) return;
      var pc = self.peers[id];
      delete self._recvOnly[id];
      if (!pc || !self.localStream) return;
      var hasTrack = false;
      try {
        hasTrack = pc.getSenders().some(function (s) { return !!s.track; });
      } catch (e) { hasTrack = false; }
      if (!hasTrack) {
        self.localStream.getTracks().forEach(function (t) {
          try { pc.addTrack(t, self.localStream); } catch (e) { /* 连接已关闭 */ }
        });
      }
      if ((self.ctx.userId || '') > id) {
        self._createOffer(id);
      } else if (window.ClassroomWS) {
        window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
          type: 'rtc-peer-join', from: self.ctx.userId,
          displayName: self.ctx.userName, role: self.ctx.role, rejoin: true
        });
      }
      self._toast('课堂人数已回落，你的麦克风与摄像头恢复对外发送');
    });
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

  /**
   * @param {boolean} [silent] 重建引擎（rejoin）时用：不要广播 rtc-peer-leave。
   *        否则这条 leave 可能晚于新引擎的 join 到达对端，把刚重建好的连接又拆掉。
   *        新引擎的 join 带 rejoin 标记，对端会据此主动重建，无需 leave 参与。
   */
  MeshRtcEngine.prototype.leave = function (silent) {
    var self = this;
    if (!silent && window.ClassroomWS && this.ctx.scheduleId) {
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
