/**
 * classroom-controls.js —— 底部控制栏
 *
 * 按钮按角色动态生成：
 *   - 教师：麦克风/摄像头/白板/全员静音/录制/下课
 *   - 学生：麦克风/摄像头/白板/举手/离开
 *   - 管理员：白板(只读)/全员静音/录制/巡课/强制结束
 * 点击动作委托到各功能模块（ClassroomRTC / ClassroomWhiteboard / ClassroomTeacher...）。
 */
(function () {
  var ClassroomControls = {
    ctx: null,
    root: null,

    init: function (ctx) {
      this.ctx = ctx || {};
      this.root = document.getElementById('classroom-controls');
      if (!this.root) return this;
      this.render(this.ctx.role || 'student');
      return this;
    },

    render: function (role) {
      var html = '';
      if (role === 'teacher' || role === 'student') {
        html += this._btn('ctrl-mic', 'fas fa-microphone', '麦克风', true);
        html += this._btn('ctrl-cam', 'fas fa-video', '摄像头', true);
      }
      html += this._btn('ctrl-whiteboard', 'fas fa-chalkboard', '白板', false);
      if (role === 'student') {
        html += this._btn('ctrl-hand', 'fas fa-hand-paper', '举手', false);
      }
      if (role === 'teacher' || role === 'admin') {
        html += this._btn('ctrl-mute-all', 'fas fa-microphone-slash', '全员静音', false);
        html += this._btn('ctrl-record', 'fas fa-circle', '录制', false);
      }
      if (role === 'admin') {
        html += this._btn('ctrl-monitor', 'fas fa-eye', '巡课', false);
      }
      if (role === 'teacher') {
        html += this._btn('ctrl-end', 'fas fa-phone-slash', '下课', false, 'danger');
      } else {
        html += this._btn('ctrl-leave', 'fas fa-phone-slash', '离开', false, 'danger');
      }
      this.root.innerHTML = html;
      this._bind(role);
    },

    _btn: function (id, icon, label, active, cls) {
      return '<button id="' + id + '" class="cl-ctrl' + (active ? ' active' : '') + (cls ? ' ' + cls : '') + '">' +
        '<i class="' + icon + '"></i><span>' + label + '</span></button>';
    },

    _bind: function (role) {
      var self = this;
      var $ = function (id) { return document.getElementById(id); };

      var mic = $('ctrl-mic');
      if (mic) mic.addEventListener('click', function () {
        if (!window.ClassroomRTC || !window.ClassroomRTC.mediaOk) { self.toast('无可用麦克风'); return; }
        var on = window.ClassroomRTC.micEnabled;
        var now = window.ClassroomRTC.setMicEnabled(!on);
        mic.classList.toggle('active', now);
      });

      var cam = $('ctrl-cam');
      if (cam) cam.addEventListener('click', function () {
        if (!window.ClassroomRTC || !window.ClassroomRTC.mediaOk) { self.toast('无可用摄像头'); return; }
        var on = window.ClassroomRTC.camEnabled;
        var now = window.ClassroomRTC.setCamEnabled(!on);
        cam.classList.toggle('active', now);
      });

      var wb = $('ctrl-whiteboard');
      if (wb) wb.addEventListener('click', function () {
        if (!window.ClassroomWhiteboard) return;
        var active = window.ClassroomWhiteboard.toggle();
        wb.classList.toggle('active', active);
      });

      var hand = $('ctrl-hand');
      if (hand && window.ClassroomStudent) {
        hand.addEventListener('click', function () {
          var raised = window.ClassroomStudent.toggleHand();
          hand.classList.toggle('active', raised);
        });
      }

      var muteAll = $('ctrl-mute-all');
      if (muteAll && window.ClassroomTeacher) {
        muteAll.addEventListener('click', function () { window.ClassroomTeacher.muteAll(); });
      }

      var rec = $('ctrl-record');
      if (rec && window.ClassroomTeacher) {
        rec.addEventListener('click', function () {
          var on = window.ClassroomTeacher.toggleRecord();
          rec.classList.toggle('active', on);
        });
      }

      var monitor = $('ctrl-monitor');
      if (monitor && window.ClassroomAdmin) {
        monitor.addEventListener('click', function () {
          var on = window.ClassroomAdmin.toggleMonitor();
          monitor.classList.toggle('active', on);
        });
      }

      var end = $('ctrl-end');
      if (end && window.ClassroomTeacher) {
        end.addEventListener('click', function () {
          if (window.confirm('确定要结束本次课堂吗？')) window.ClassroomTeacher.endClass();
        });
      }

      var leave = $('ctrl-leave');
      if (leave) leave.addEventListener('click', function () {
        if (window.ClassroomMain && typeof window.ClassroomMain.leave === 'function') {
          window.ClassroomMain.leave();
        }
      });
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Controls]', msg);
    }
  };

  window.ClassroomControls = ClassroomControls;
})();