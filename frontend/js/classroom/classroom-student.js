/**
 * classroom-student.js —— 学生专属功能
 * 举手、签到状态展示。
 * 举手无后端接口，通过 WS signal 广播 { type:'hand' } 供教师端呈现。
 */
(function () {
  var ClassroomStudent = {
    ctx: null,
    handRaised: false,

    init: function (ctx) {
      this.ctx = ctx || {};
      this._updateHandUI();
      return this;
    },

    toggleHand: function () {
      this.handRaised = !this.handRaised;
      if (window.ClassroomWS) {
        window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
          type: 'hand',
          from: this.ctx.userId,
          name: this.ctx.userName,
          raised: this.handRaised
        });
      }
      this._updateHandUI();
      this.toast(this.handRaised ? '已举手' : '已放下手');
      return this.handRaised;
    },

    // 收到教师端的提示（如被移出、被静音）
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'member-kicked' && msg.to === this.ctx.userId) {
        this.toast('你已被移出课堂');
        if (window.ClassroomMain && typeof window.ClassroomMain.leave === 'function') {
          window.ClassroomMain.leave();
        }
      }
      if (msg.type === 'mute-all' && msg.from !== this.ctx.userId) {
        if (window.ClassroomRTC) window.ClassroomRTC.setMicEnabled(false);
        this.toast('教师已开启全员静音');
      }
    },

    _updateHandUI: function () {
      var btn = document.getElementById('ctrl-hand');
      if (btn) btn.classList.toggle('active', this.handRaised);
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Student]', msg);
    }
  };

  window.ClassroomStudent = ClassroomStudent;
})();