/**
 * classroom-teacher.js —— 教师专属功能
 * 开课/下课、全员静音、录制控制、移出成员。
 * 后端接口：/classrooms/{sid}/start|end、/members/{userId}/kick（见 ClassroomController）。
 * 全员静音/录制无后端强控接口，通过 WS signal 广播约定消息，客户端自行响应。
 */
(function () {
  var ClassroomTeacher = {
    ctx: null,

    init: function (ctx) {
      this.ctx = ctx || {};
      return this;
    },

    startClass: function () {
      var self = this;
      return this._api('startClass', '已开课', function () {
        if (window.ClassroomWS) {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, { type: 'class-start', from: self.ctx.userId });
        }
      });
    },

    endClass: function () {
      var self = this;
      return this._api('endClass', '已下课', function () {
        if (window.ClassroomWS) {
          window.ClassroomWS.sendSignal(self.ctx.scheduleId, { type: 'class-end', from: self.ctx.userId });
        }
        if (window.ClassroomMain && typeof window.ClassroomMain.leave === 'function') {
          window.ClassroomMain.leave();
        }
      });
    },

    muteAll: function () {
      if (!window.ClassroomWS) return this.toast('信令未就绪');
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, { type: 'mute-all', from: this.ctx.userId });
      // 本地也静音自己
      if (window.ClassroomRTC) window.ClassroomRTC.setMicEnabled(false);
      this.toast('已请求全员静音');
      return true;
    },

    // 录制为占位实现：广播录制开始/停止，真实录制需后端媒体服务支持
    _recording: false,
    toggleRecord: function () {
      this._recording = !this._recording;
      if (window.ClassroomWS) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
          type: 'record', on: this._recording, from: this.ctx.userId
        });
      }
      this.toast(this._recording ? '录制已开始（占位）' : '录制已停止');
      return this._recording;
    },

    kickMember: function (userId) {
      if (!userId) return Promise.reject(new Error('缺少用户ID'));
      if (!window.ClassroomAPI) return Promise.reject(new Error('ClassroomAPI 未加载'));
      return window.ClassroomAPI.kickMember(this.ctx.apiBaseUrl, this.ctx.scheduleId, userId)
        .then(function () {
          if (window.ClassroomWS) {
            window.ClassroomWS.sendSignal(this.ctx.scheduleId, { type: 'member-kicked', from: this.ctx.userId, to: userId });
          }
          return true;
        }.bind(this))
        .catch(function (e) { console.warn('[Teacher] kickMember failed', e); return false; });
    },

    _api: function (method, okMsg, afterOk) {
      var CAPI = window.ClassroomAPI;
      if (!CAPI || typeof CAPI[method] !== 'function') return Promise.reject(new Error('ClassroomAPI 未加载'));
      return CAPI[method](this.ctx.apiBaseUrl, this.ctx.scheduleId)
        .then(function (data) {
          if (typeof afterOk === 'function') afterOk();
          this.toast(okMsg || '操作成功');
          return data;
        }.bind(this))
        .catch(function (e) {
          console.warn('[Teacher] ' + method + ' failed', e);
          this.toast((e && e.message) || '操作失败');
          throw e;
        }.bind(this));
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Teacher]', msg);
    }
  };

  window.ClassroomTeacher = ClassroomTeacher;
})();