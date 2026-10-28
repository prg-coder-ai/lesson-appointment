/**
 * classroom-service WebSocket 封装。
 * 三条通道：白板 / 心跳 / 信令。
 *
 * 用法：
 *   ClassroomWS.connect(scheduleId, token, {
 *     userId: 'u1',
 *     onHeartbeat: fn, onSignal: fn, onWhiteboard: fn,
 *     onOpen: fn, onClose: fn, onError: fn
 *   });
 *   ClassroomWS.sendWhiteboard(scheduleId, { op: 'draw', ... });
 *   ClassroomWS.sendSignal(scheduleId, { type: 'rollcall', ... });
 *   ClassroomWS.disconnect(scheduleId);
 */
(function () {
  const HEARTBEAT_INTERVAL = 15000;

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

  function safeParse(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  const ClassroomWS = {
    _sessions: {},

    connect: function (scheduleId, token, handlers) {
      handlers = handlers || {};
      var base = buildBase(scheduleId);
      var tokenQuery = '?access_token=' + encodeURIComponent(token || '');
      var self = this;

      var heartbeat = new WebSocket(base + '/heartbeat' + tokenQuery);
      heartbeat.onmessage = function (e) {
        var msg = safeParse(e.data);
        if (msg && msg.type === 'heartbeat' && handlers.onHeartbeat) handlers.onHeartbeat(msg);
      };
      heartbeat.onclose = function () { if (handlers.onClose) handlers.onClose('heartbeat'); };
      heartbeat.onerror = function () { if (handlers.onError) handlers.onError('heartbeat'); };

      var hbTimer = setInterval(function () {
        if (heartbeat.readyState === WebSocket.OPEN) {
          heartbeat.send(JSON.stringify({ type: 'heartbeat', userId: handlers.userId, ts: Date.now() }));
        }
      }, HEARTBEAT_INTERVAL);

      var signal = new WebSocket(base + '/signal' + tokenQuery);
      signal.onmessage = function (e) {
        var msg = safeParse(e.data);
        if (msg && handlers.onSignal) handlers.onSignal(msg);
      };
      signal.onclose = function () { if (handlers.onClose) handlers.onClose('signal'); };
      signal.onerror = function () { if (handlers.onError) handlers.onError('signal'); };

      var whiteboard = new WebSocket(base + '/whiteboard' + tokenQuery);
      whiteboard.onmessage = function (e) {
        var msg = safeParse(e.data);
        if (msg && handlers.onWhiteboard) handlers.onWhiteboard(msg);
      };
      whiteboard.onclose = function () { if (handlers.onClose) handlers.onClose('whiteboard'); };
      whiteboard.onerror = function () { if (handlers.onError) handlers.onError('whiteboard'); };

      var allOpen = false;
      function checkAllOpen() {
        if (!allOpen &&
          heartbeat.readyState === WebSocket.OPEN &&
          signal.readyState === WebSocket.OPEN &&
          whiteboard.readyState === WebSocket.OPEN) {
          allOpen = true;
          if (handlers.onOpen) handlers.onOpen();
        }
      }
      heartbeat.onopen = checkAllOpen;
      signal.onopen = checkAllOpen;
      whiteboard.onopen = checkAllOpen;

      this._sessions[scheduleId] = { heartbeat: heartbeat, signal: signal, whiteboard: whiteboard, hbTimer: hbTimer };
    },

    disconnect: function (scheduleId) {
      var s = this._sessions[scheduleId];
      if (!s) return;
      clearInterval(s.hbTimer);
      try { s.heartbeat.close(); } catch (e) {}
      try { s.signal.close(); } catch (e) {}
      try { s.whiteboard.close(); } catch (e) {}
      delete this._sessions[scheduleId];
    },

    disconnectAll: function () {
      var self = this;
      Object.keys(this._sessions).forEach(function (sid) {
        self.disconnect(sid);
      });
    },

    sendWhiteboard: function (scheduleId, data) {
      var s = this._sessions[scheduleId];
      if (s && s.whiteboard.readyState === WebSocket.OPEN) {
        s.whiteboard.send(JSON.stringify(Object.assign({ type: 'whiteboard' }, data)));
      }
    },

    sendSignal: function (scheduleId, data) {
      var s = this._sessions[scheduleId];
      if (s && s.signal.readyState === WebSocket.OPEN) {
        s.signal.send(JSON.stringify(data));
      }
    }
  };

  window.ClassroomWS = ClassroomWS;
})();