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

    // 收到服务端权威提示
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'member-kicked' && msg.to === this.ctx.userId) {
        this.toast('你已被移出课堂');
        if (window.ClassroomMain && typeof window.ClassroomMain.leave === 'function') {
          window.ClassroomMain.leave();
        }
      }
      // F4-12：被点名 → 强提示 + 应答
      if (msg.type === 'rollcall:start' && msg.targetUserId === this.ctx.userId) {
        this._showRollCallPrompt(msg.rollcallId);
      }
    },

    // F4-12：学生被点名强提示弹窗（高亮 + 应答按钮）
    _showRollCallPrompt: function (rollcallId) {
      var modal = document.getElementById('rollcall-modal');
      if (!modal) return;
      modal.classList.remove('hidden');
      var self = this;
      var btn = document.getElementById('rollcall-answer');
      var closeBtn = document.getElementById('rollcall-close');
      if (closeBtn) closeBtn.onclick = function () { modal.classList.add('hidden'); };
      if (btn) {
        btn.onclick = function () {
          if (!window.ClassroomAPI || typeof window.ClassroomAPI.answerRollCall !== 'function') return;
          window.ClassroomAPI.answerRollCall(self.ctx.apiBaseUrl, self.ctx.scheduleId, rollcallId)
            .then(function () { self.toast('已应答点名'); modal.classList.add('hidden'); })
            .catch(function (e) { self.toast((e && e.message) || '应答失败'); });
        };
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