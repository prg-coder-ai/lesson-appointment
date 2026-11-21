/**
 * classroom-student.js —— 学生专属功能
 * 举手 / 发言三态、被点名应答。
 *
 * 举手无后端接口，通过 WS signal 广播 { type:'hand' }；服务端 ClassroomSignalService
 * 写入权威态并回广播 hand:state，教师端据此渲染「批准开麦」。
 *
 * 三态（由「举手 + 服务端授权」两个布尔派生，不额外存储）：
 *   idle     未举手              → 按钮「举手」
 *   waiting  已举手未获批准       → 按钮「等待批准」（黄色）
 *   speaking 已举手且教师已批准   → 按钮「发言中」（红色）
 * 任何「放下手」的路径（学生再点、关麦、教师撤回）都必须同时撤销麦克风授权。
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

    /** 当前 UI 态：idle / waiting / speaking */
    state: function () {
      if (!this.handRaised) return 'idle';
      return (window.ClassroomRTC && window.ClassroomRTC.micGranted) ? 'speaking' : 'waiting';
    },

    /** 控制栏「举手」按钮的唯一入口：idle 举手，其余两态都是放下手 */
    toggleHand: function () {
      var st = this.state();
      if (st === 'idle') {
        this.setHandRaised(true);
        this._send(true);
        this.toast('已举手，等待老师批准');
        return true;
      }
      this.cancelSpeaking(st === 'speaking' ? 'self_down' : 'self_cancel');
      return false;
    },

    /**
     * 放下手（学生再点按钮 / 关闭麦克风 / 教师撤回时由 main 调用）。
     * 三件事必须一起做：取消举手、广播、关麦——少做一件就会留下"没举手却能说话"的鬼状态。
     */
    cancelSpeaking: function (reason) {
      var was = this.state();
      this.setHandRaised(false);
      this._send(false);
      if (window.ClassroomRTC && typeof window.ClassroomRTC.revokeMic === 'function') {
        window.ClassroomRTC.revokeMic();
      }
      // 教师撤回 / 全员静音由 main 统一提示，避免两条 toast 叠在一起
      if (reason !== 'teacher_revoke' && reason !== 'mute_all') {
        this.toast(was === 'speaking' ? '已放下手，麦克风已关闭' : '已放下手');
      }
      return false;
    },

    _send: function (raised) {
      if (!window.ClassroomWS || !this.ctx || !this.ctx.scheduleId) return;
      window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
        type: 'hand',
        from: this.ctx.userId,
        name: this.ctx.userName,
        raised: !!raised
      });
    },

    /** 更新本地举手态与按钮；服务端权威下发时调用，不再回发信令 */
    setHandRaised: function (raised) {
      this.handRaised = !!raised;
      this._updateHandUI();
    },

    /** 麦克风授权态变化后由 main 调用，重绘按钮三态（RTC.micGranted 是唯一判据） */
    refreshUI: function () {
      this._updateHandUI();
    },

    // 收到服务端权威提示
    onSignal: function (msg) {
      if (!msg || !msg.type) return;
      // 服务端权威举手态（含进房/刷新时的初始下发）：同步自己的按钮与高亮
      if (msg.type === 'hand:state' && msg.userId === this.ctx.userId) {
        this.setHandRaised(msg.raised);
        // 服务端撤销举手时一定同时撤销了授权；这里兜底关麦，防 mic:grant 丢包后麦克风还开着
        if (!msg.raised && window.ClassroomRTC && typeof window.ClassroomRTC.revokeMic === 'function') {
          window.ClassroomRTC.revokeMic();
        }
      }
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
      if (!btn) return;
      var st = this.state();
      btn.classList.toggle('waiting', st === 'waiting');
      btn.classList.toggle('speaking', st === 'speaking');
      btn.classList.toggle('active', st !== 'idle');
      var label = btn.querySelector('span');
      if (label) {
        label.textContent = st === 'speaking' ? '发言中' : (st === 'waiting' ? '等待批准' : '举手');
      }
      btn.title = st === 'speaking'
        ? '正在发言，点击可结束发言并关闭麦克风'
        : (st === 'waiting' ? '等待老师批准，点击可取消举手' : '举手申请发言');
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Student]', msg);
    }
  };

  window.ClassroomStudent = ClassroomStudent;
})();
