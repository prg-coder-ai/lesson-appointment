/**
 * classroom-service WebSocket 封装。
 * 三条通道：白板 / 心跳 / 信令。
 *
 * 用法：
 *   ClassroomWS.connect(scheduleId, token, {
 *     userId: 'u1',
 *     onHeartbeat: fn, onSignal: fn, onWhiteboard: fn,
 *     onOpen: fn, onReconnect: fn, onDisconnect: fn, onClose: fn, onError: fn
 *   });
 *   ClassroomWS.sendWhiteboard(scheduleId, { op: 'draw', ... });
 *   ClassroomWS.sendSignal(scheduleId, { type: 'rollcall', ... });
 *   ClassroomWS.disconnect(scheduleId);
 *
 * 断线自愈：三条通道各自指数退避重连（0.8s→1.6s→3.2s…上限 15s）。
 * 之所以敢「一条断了只补这一条」，是因为服务端在连接建立时就会补状态：
 *   - 白板通道 → 重发 wb:init（当前板书全量操作序列）
 *   - 信令通道 → pushInitialState（禁言 / 举手 / 开麦授权 / 白板授权）
 * 所以重连成功后前端不需要额外拉取，只要等着被补发即可。
 */
(function () {
  const HEARTBEAT_INTERVAL = 15000;   // 心跳间隔：服务端超时判定就靠它
  const RECONNECT_BASE = 800;         // 首次重连间隔
  const RECONNECT_MAX = 15000;        // 退避上限，避免无限拉长
  const CHANNELS = ['heartbeat', 'signal', 'whiteboard'];

  function wsOrigin() {
    var cfg = (typeof window.getClassroomWsBaseUrl === 'function') ? window.getClassroomWsBaseUrl() : '';
    if (cfg) {
      if (cfg.indexOf('://') === -1) {
        cfg = (location.protocol === 'https:' ? 'https://' : 'http://') + cfg;
      }
      return cfg.replace(/^http/, 'ws').replace(/\/+$/, '');
    }
    return (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host;
  }

  function buildBase(scheduleId) {
    return wsOrigin() + '/ws/classrooms/' + encodeURIComponent(scheduleId);
  }

  /**
   * 生成前端链路 id。
   *
   * 三条通道（signal/whiteboard/heartbeat）是同一个用户同一次进房的三个连接，
   * 服务端若不共用同一个 traceId，一次"白板没同步"的排查要在三份日志里各找一遍。
   * 这里生成一次、三条 URL 共用，服务端 WsHandshakeAuthInterceptor 会原样沿用。
   *
   * 只做 8-64 位 [A-Za-z0-9._-]，与服务端校验规则一致——不合法会被丢弃重生成，
   * 让前端的"链路"和服务端的"链路"变成两条，比不传更糟。
   */
  function newTraceId() {
    var s = '';
    for (var i = 0; i < 32; i++) {
      s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
  }

  function safeParse(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  /** 指数退避：第 n 次重试等待 min(800ms * 2^(n-1), 15s) */
  function backoff(attempt) {
    return Math.min(RECONNECT_BASE * Math.pow(2, Math.max(0, attempt - 1)), RECONNECT_MAX);
  }

  const ClassroomWS = {
    _sessions: {},

    connect: function (scheduleId, token, handlers) {
      handlers = handlers || {};
      // 同一课次重复 connect（手动重进课堂 / 上层重建）先清掉旧会话，
      // 否则会留下两套 socket 同时活着，消息重复处理。
      if (this._sessions[scheduleId]) this.disconnect(scheduleId);
      var s = {
        handlers: handlers,
        token: token || '',
        base: buildBase(scheduleId),
        // 重连复用同一 traceId，服务端日志才能串成一条链路
        traceId: handlers.traceId || newTraceId(),
        sockets: {},
        retryTimers: {},
        attempts: {},
        hbTimer: null,
        allOpen: false,
        closedByUser: false
      };
      this._sessions[scheduleId] = s;
      var self = this;
      CHANNELS.forEach(function (ch) { self._openChannel(scheduleId, ch); });
      // 心跳只需要一个定时器；socket 断开时 send 会跳过，不影响重连判定
      s.hbTimer = setInterval(function () {
        var hb = s.sockets.heartbeat;
        if (hb && hb.readyState === WebSocket.OPEN) {
          hb.send(JSON.stringify({ type: 'heartbeat', userId: handlers.userId, ts: Date.now() }));
        }
      }, HEARTBEAT_INTERVAL);
      return s;
    },

    _openChannel: function (scheduleId, ch) {
      var s = this._sessions[scheduleId];
      if (!s || s.closedByUser) return;
      var url = s.base + '/' + ch
        + '?access_token=' + encodeURIComponent(s.token)
        + '&traceId=' + encodeURIComponent(s.traceId);
      var self = this;
      var ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        // 构造就失败（少见的非法 URL / 被策略拦）也走退避，不能静默放弃
        this._scheduleRetry(scheduleId, ch);
        return;
      }
      s.sockets[ch] = ws;

      ws.onopen = function () {
        s.attempts[ch] = 0;
        self._checkAllOpen(scheduleId);
      };
      ws.onmessage = function (e) {
        var msg = safeParse(e.data);
        if (!msg) return;
        if (ch === 'heartbeat') {
          if (msg.type === 'heartbeat' && s.handlers.onHeartbeat) s.handlers.onHeartbeat(msg);
        } else if (ch === 'signal') {
          if (s.handlers.onSignal) s.handlers.onSignal(msg);
        } else if (s.handlers.onWhiteboard) {
          s.handlers.onWhiteboard(msg);
        }
      };
      ws.onclose = function () {
        if (s.closedByUser) return;
        if (s.handlers.onClose) s.handlers.onClose(ch);
        self._scheduleRetry(scheduleId, ch);
      };
      ws.onerror = function () {
        // onerror 之后浏览器一定会再给 onclose，重连只挂在 onclose 上，避免双触发
        if (s.handlers.onError) s.handlers.onError(ch);
      };
    },

    _checkAllOpen: function (scheduleId) {
      var s = this._sessions[scheduleId];
      if (!s) return;
      var all = CHANNELS.every(function (ch) {
        var ws = s.sockets[ch];
        return ws && ws.readyState === WebSocket.OPEN;
      });
      if (!all) return;
      if (!s.allOpen) {
        s.allOpen = true;
        if (s.handlers.onOpen) s.handlers.onOpen();
      } else if (s.handlers.onReconnect) {
        // 曾全部就绪、现在又全部就绪 = 断线后自愈完成
        s.handlers.onReconnect();
      }
    },

    _scheduleRetry: function (scheduleId, ch) {
      var s = this._sessions[scheduleId];
      if (!s || s.closedByUser) return;
      if (s.retryTimers[ch]) return;          // 同一通道只保留一个待执行的重连
      var attempt = (s.attempts[ch] = (s.attempts[ch] || 0) + 1);
      var delay = backoff(attempt);
      if (s.handlers.onDisconnect) s.handlers.onDisconnect(ch, delay, attempt);
      var self = this;
      s.retryTimers[ch] = setTimeout(function () {
        delete s.retryTimers[ch];
        var cur = self._sessions[scheduleId];
        if (!cur || cur.closedByUser) return;
        self._openChannel(scheduleId, ch);
      }, delay);
    },

    disconnect: function (scheduleId) {
      var s = this._sessions[scheduleId];
      if (!s) return;
      s.closedByUser = true;                  // 主动退出：onclose 不再触发重连
      if (s.hbTimer) clearInterval(s.hbTimer);
      Object.keys(s.retryTimers || {}).forEach(function (k) {
        clearTimeout(s.retryTimers[k]);
      });
      Object.keys(s.sockets || {}).forEach(function (k) {
        try { s.sockets[k].close(); } catch (e) { /* 已关闭 */ }
      });
      delete this._sessions[scheduleId];
    },

    disconnectAll: function () {
      var self = this;
      Object.keys(this._sessions).forEach(function (sid) {
        self.disconnect(sid);
      });
    },

    /** 某条通道是否当前可用（供上层判断"要不要提示用户断线"） */
    isChannelOpen: function (scheduleId, ch) {
      var s = this._sessions[scheduleId];
      var ws = s && s.sockets[ch || 'signal'];
      return !!ws && ws.readyState === WebSocket.OPEN;
    },

    sendWhiteboard: function (scheduleId, data) {
      var s = this._sessions[scheduleId];
      var ws = s && s.sockets.whiteboard;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(Object.assign({ type: 'whiteboard' }, data)));
        return true;
      }
      return false;
    },

    /**
     * 发送信令，返回是否真的发出（WS 未 OPEN 时返回 false）。
     * 返回值只给需要「没发出就补发」的调用方用——典型是 rtc-peer-join：
     * 进房时媒体采集可能早于 WS 握手完成，静默丢弃会让对方永远收不到 join，
     * 双方都不发 offer，P2P 就建不起来（学生端看不到教师画面）。
     */
    sendSignal: function (scheduleId, data) {
      var s = this._sessions[scheduleId];
      var ws = s && s.sockets.signal;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        return true;
      }
      return false;
    }
  };

  window.ClassroomWS = ClassroomWS;
})();
