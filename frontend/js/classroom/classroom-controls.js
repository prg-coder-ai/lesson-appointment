/**
 * classroom-controls.js —— 底部控制栏
 *
 * 按钮按角色动态生成：
 *   - 教师：麦克风/摄像头/白板/全员静音/录制/进行中/暂停/下课
 *
 * 发布门禁（2026-11-14）：课堂非 LIVE 时学生不可发布；PAUSED 时师生都不可发布。
 * 控制栏按 ClassroomMain.applyGate 下发的 allowed 禁用「发布类」按钮；
 * 「进行中 / 暂停 / 下课」是状态控制类，始终可用（否则暂停后无法恢复）。
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
      // 兜底：RTC 初始化完成后会无参重渲染一次，不能因为 role=undefined 把按钮清空
      role = role || (this.ctx && this.ctx.role) || 'student';
      var html = '';
      if (role === 'teacher' || role === 'student') {
        html += this._btn('ctrl-mic', 'fas fa-microphone', '麦克风', true);
        html += this._btn('ctrl-cam', 'fas fa-video', '摄像头', true);
      }
      html += this._btn('ctrl-whiteboard', 'fas fa-chalkboard', '白板', false);
      html += this._btn('ctrl-material', 'fas fa-file-lines', '讲稿', false);
      if (role === 'student') {
        html += this._btn('ctrl-hand', 'fas fa-hand-paper', '举手', false);
        html += this._btn('ctrl-upload', 'fas fa-upload', '上传作业', false);
      }
      if (role === 'teacher' || role === 'admin') {
        html += this._btn('ctrl-mute-all', 'fas fa-microphone-slash', '全员静音', false);
        // 录制模式选择（2026-11-17 P1）：人像录制 / 教学区域录制，默认保持现状
        html += '<select id="ctrl-record-mode" class="cl-ctrl cl-record-mode" title="选择录制模式">'
          + '<option value="video">人像录制</option>'
          + '<option value="screen">教学区域</option>'
          + '</select>';
        html += this._btn('ctrl-record', 'fas fa-circle', '录制', false);
      }
      if (role === 'teacher') {
        html += this._btn('ctrl-rollcall', 'fas fa-bullhorn', '点名', false);
        html += this._btn('ctrl-wb-save', 'fas fa-save', '保存板书', false);
        html += this._btn('ctrl-review', 'fas fa-tasks', '作业点评', false);
      }
      if (role === 'admin') {
        html += this._btn('ctrl-monitor', 'fas fa-eye', '巡课', false);
      }
      if (role === 'teacher') {
        html += this._btn('ctrl-live', 'fas fa-play', '进行中', false);
        html += this._btn('ctrl-pause', 'fas fa-pause', '暂停', false);
        html += this._btn('ctrl-end', 'fas fa-phone-slash', '下课', false, 'danger');
      } else {
        html += this._btn('ctrl-leave', 'fas fa-phone-slash', '离开', false, 'danger');
      }
      this.root.innerHTML = html;
      this._bind(role);
      this._applyCurrentGate();   // 重渲染（RTC 初始化后会再 render 一次）不能丢门禁
    },

    _btn: function (id, icon, label, active, cls) {
      return '<button id="' + id + '" class="cl-ctrl' + (active ? ' active' : '') + (cls ? ' ' + cls : '') + '">' +
        '<i class="' + icon + '"></i><span>' + label + '</span></button>';
    },

    /** 由 ClassroomMain._applyGate 下发：禁用发布类控件，并标示当前状态按钮 */
    applyGate: function (allowed, status) {
      this.gateAllowed = !!allowed;
      var tip = (status === 'PAUSED') ? '课堂已暂停，暂不能发布' : '课堂未开始/已结束，暂不能发布';
      ['ctrl-mic', 'ctrl-cam', 'ctrl-hand', 'ctrl-upload'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = !allowed;
        el.style.opacity = allowed ? '' : '0.45';
        el.style.cursor = allowed ? '' : 'not-allowed';
        el.title = allowed ? '' : tip;
      });
      var liveEl = document.getElementById('ctrl-live');
      var pauseEl = document.getElementById('ctrl-pause');
      if (liveEl) liveEl.classList.toggle('active', status === 'LIVE');
      if (pauseEl) pauseEl.classList.toggle('active', status === 'PAUSED');
    },

    _applyCurrentGate: function () {
      if (window.ClassroomMain && typeof window.ClassroomMain.canPublish === 'function') {
        this.applyGate(window.ClassroomMain.canPublish(), window.ClassroomMain.getStatus());
      }
    },

    /** 按钮点击兜底：即使 gate 尚未刷新，也不允许绕过前端发出内容 */
    _gateAllowed: function () {
      if (window.ClassroomMain && typeof window.ClassroomMain.canPublish === 'function'
          && !window.ClassroomMain.canPublish()) {
        this.toast(window.ClassroomMain.getStatus() === 'PAUSED'
          ? '课堂已暂停，暂停期间不能发送音视频、白板与聊天'
          : '课堂未开始/已结束，暂不能发送音视频、白板与聊天');
        return false;
      }
      return true;
    },

    _bind: function (role) {
      var self = this;
      var $ = function (id) { return document.getElementById(id); };

      var mic = $('ctrl-mic');
      if (mic) mic.addEventListener('click', function () {
        if (!self._gateAllowed()) return;
        // 拆分状态：麦克风只看 audioOk，摄像头不可用不再连累麦克风
        if (!window.ClassroomRTC || !window.ClassroomRTC.audioOk) {
          self.toast('麦克风不可用，请到「课程准备」页检查设备与浏览器权限');
          return;
        }
        var on = window.ClassroomRTC.micEnabled;
        // F4-17：服务端全员禁言 → 学生不可自解麦克风
        if (!on && window.ClassroomRTC.serverMuted && self.ctx && self.ctx.role === 'student') {
          self.toast('全员禁言中，无法开启麦克风'); return;
        }
        var now = window.ClassroomRTC.setMicEnabled(!on);
        mic.classList.toggle('active', now);
      });

      var cam = $('ctrl-cam');
      if (cam) cam.addEventListener('click', function () {
        if (!self._gateAllowed()) return;
        if (!window.ClassroomRTC || !window.ClassroomRTC.videoOk) {
          self.toast('摄像头不可用，请到「课程准备」页检查设备与浏览器权限');
          return;
        }
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

      // 讲稿容器（F4-04~06）：教师点开可上传/翻页，学生点开只跟随
      var mat = $('ctrl-material');
      if (mat) mat.addEventListener('click', function () {
        if (!window.ClassroomMaterial) return;
        var on = window.ClassroomMaterial.toggle();
        mat.classList.toggle('active', on);
      });

      var hand = $('ctrl-hand');      if (hand && window.ClassroomStudent) {
        hand.addEventListener('click', function () {
          if (!self._gateAllowed()) return;
          var raised = window.ClassroomStudent.toggleHand();
          hand.classList.toggle('active', raised);
        });
      }

      var muteAll = $('ctrl-mute-all');
      if (muteAll && window.ClassroomTeacher) {
        muteAll.addEventListener('click', function () { window.ClassroomTeacher.muteAll(); });
      }

      var rollcall = $('ctrl-rollcall');
      if (rollcall && window.ClassroomTeacher) {
        rollcall.addEventListener('click', function () { window.ClassroomTeacher.initiateRollCall(); });
      }

      var wbSave = $('ctrl-wb-save');
      if (wbSave) {
        wbSave.addEventListener('click', function () {
          if (!window.ClassroomWS || !self.ctx) return;
          window.ClassroomWS.sendWhiteboard(self.ctx.scheduleId, { op: 'wb:save' });
        });
      }

      var upload = $('ctrl-upload');
      if (upload) {
        upload.addEventListener('click', function () {
          if (!self._gateAllowed()) return;
          var modal = document.getElementById('upload-modal');
          if (modal) modal.classList.remove('hidden');
        });
      }

      var review = $('ctrl-review');
      if (review && window.ClassroomTeacher) {
        review.addEventListener('click', function () { window.ClassroomTeacher.openReview(); });
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

      // 教师状态切换：控制类操作，不受发布门禁限制（暂停后仍须能恢复/下课）
      var live = $('ctrl-live');
      if (live && window.ClassroomTeacher) {
        live.addEventListener('click', function () { window.ClassroomTeacher.goLive(); });
      }
      var pause = $('ctrl-pause');
      if (pause && window.ClassroomTeacher) {
        pause.addEventListener('click', function () {
          if (window.confirm('确定暂停课堂吗？暂停期间教师端和学生端都不能发送音视频、白板与聊天。')) {
            window.ClassroomTeacher.pauseClass();
          }
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