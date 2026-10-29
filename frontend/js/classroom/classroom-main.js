/**
 * classroom-main.js —— 课堂主逻辑（初始化 / 角色适配 / 模块串联）
 *
 * 流程：
 *   1) 读取登录态（localStorage.currentUser）
 *   2) 确保课堂开关配置存在（无则补拉 /api/v1/eclassroom/config）
 *   3) guardClassroom() 课堂守卫
 *   4) POST /classrooms/{scheduleId}/enter 进入课堂
 *   5) GET  /classrooms/{scheduleId}/status 补课堂信息（后端 enter 不返回配置）
 *   6) 初始化 RTC / 白板 / 聊天 / 控制栏 / 角色模块
 *   7) 建立 WS 三通道并集中分发消息
 */
(function () {
  var ROLE_HOME = {
    admin: 'admin.html',
    teacher: 'teacher.html',
    student: 'student.html',
    platform_admin: 'platform_admin.html'
  };

  var ClassroomMain = {
    ctx: null,
    participants: {},
    leaving: false,

    run: function () {
      var self = this;
      var user = this._currentUser();
      if (!user || !user.role) { this._gotoLogin(); return; }

      var scheduleId = this._getParam('scheduleId');

      // 先确保课堂配置，再进入守卫（否则刷新页面时可能因配置缺失被误踢）
      this._ensureConfig(function () {
        if (typeof window.guardClassroom === 'function' && !window.guardClassroom()) return;
        if (!scheduleId) { self._gotoHome(user.role); return; }
        self._boot(user, scheduleId);
      });
    },

    _currentUser: function () {
      try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); }
      catch (e) { return null; }
    },

    _getParam: function (name) {
      try {
        var v = new URLSearchParams(window.location.search).get(name);
        return v && v.trim() ? v.trim() : '';
      } catch (e) { return ''; }
    },

    _ensureConfig: function (cb) {
      if (typeof window.hasClassroom === 'function' && window.hasClassroom()) { cb(); return; }
      var token = localStorage.getItem('token');
      if (!token || typeof window.request !== 'function') { cb(); return; }
      var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
      if (!EP.ECLASSROOM_CONFIG) { cb(); return; }
      window.request({ url: EP.ECLASSROOM_CONFIG, method: 'get' })
        .then(function (data) {
          if (data && typeof window.setEclassroomConfig === 'function') window.setEclassroomConfig(data);
        })
        .catch(function () { /* ignore，交由守卫判定 */ })
        .then(function () { cb(); });
    },

    _boot: function (user, scheduleId) {
      var self = this;
      var apiBaseUrl = (typeof window.getClassroomApiBaseUrl === 'function') ? window.getClassroomApiBaseUrl() : '';
      var ctx = {
        scheduleId: scheduleId,
        userId: user.userId,
        userName: user.name || user.account || user.userId,
        role: this._getParam('role') || user.role,
        tenantCode: user.tenantCode,
        apiBaseUrl: apiBaseUrl,
        token: user.token || localStorage.getItem('token') || ''
      };
      this.ctx = ctx;
      this._setStatus('connecting', '进入中...');

      var enterP = (window.ClassroomAPI && typeof window.ClassroomAPI.enterClassroom === 'function')
        ? window.ClassroomAPI.enterClassroom(apiBaseUrl, scheduleId)
        : Promise.reject(new Error('ClassroomAPI 未加载'));

      enterP
        .then(function () { return self._loadStatus(apiBaseUrl, scheduleId); })
        .then(function (classroom) {
          self._renderHeader(classroom, ctx);
          self._initModules(ctx);
          self._refreshMembers(apiBaseUrl, scheduleId);
          if (ctx.role === 'student') self._initMyAttendance(ctx);
          self._connectWS(ctx);
          self._bindBackButton();
          self._hidePlaceholder();
          self._setStatus('live', '进行中');
        })
        .catch(function (e) {
          console.error('[ClassroomMain] 进入课堂失败', e);
          window.clToast((e && e.message) || '进入课堂失败，请稍后重试');
          self._setStatus('ended', '进入失败');
        });
    },

    _loadStatus: function (apiBaseUrl, scheduleId) {
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getClassroomStatus !== 'function') {
        return Promise.resolve(null);
      }
      return window.ClassroomAPI.getClassroomStatus(apiBaseUrl, scheduleId)
        .catch(function (e) { console.warn('[ClassroomMain] getStatus failed', e); return null; });
    },

    _renderHeader: function (classroom, ctx) {
      var title = document.getElementById('classroom-title');
      if (title) {
        if (classroom) {
          title.textContent = (classroom.courseName || '在线课堂') +
            (classroom.teacherName ? ' - ' + classroom.teacherName : '');
        } else {
          title.textContent = '在线课堂';
        }
      }
    },

    _initModules: function (ctx) {
      if (window.ClassroomRTC) window.ClassroomRTC.init(ctx);
      if (window.ClassroomWhiteboard) window.ClassroomWhiteboard.init(ctx);
      if (window.ClassroomChat) window.ClassroomChat.init(ctx);
      if (window.ClassroomTeacher) window.ClassroomTeacher.init(ctx);
      if (window.ClassroomStudent) window.ClassroomStudent.init(ctx);
      if (window.ClassroomAdmin) window.ClassroomAdmin.init(ctx);
      if (window.ClassroomControls) window.ClassroomControls.init(ctx);
    },

    _connectWS: function (ctx) {
      if (!window.ClassroomWS) { this._setStatus('idle', '信令未就绪'); return; }
      var self = this;
      try {
        window.ClassroomWS.connect(ctx.scheduleId, ctx.token, {
          userId: ctx.userId,
          onOpen: function () { window.clToast('已连接课堂'); },
          onClose: function (ch) { console.warn('[ClassroomMain] WS 关闭', ch); },
          onError: function (ch) { console.warn('[ClassroomMain] WS 错误', ch); },
          onHeartbeat: function () { /* 心跳保活 */ },
          onSignal: function (msg) { self._dispatchSignal(msg); },
          onWhiteboard: function (msg) {
            if (window.ClassroomWhiteboard) window.ClassroomWhiteboard.onMessage(msg);
          }
        });
      } catch (e) {
        console.warn('[ClassroomMain] WS connect failed', e);
        this._setStatus('idle', '信令连接失败');
      }
    },

    _dispatchSignal: function (msg) {
      if (!msg || !msg.type) return;
      if (window.ClassroomRTC) window.ClassroomRTC.onSignal(msg);
      if (window.ClassroomChat) window.ClassroomChat.onSignal(msg);
      if (window.ClassroomStudent) window.ClassroomStudent.onSignal(msg);

      var self = this;
      switch (msg.type) {
        case 'rtc-peer-join':
          this._addParticipant(msg.from, msg.name, msg.role);
          break;
        case 'rtc-peer-leave':
        case 'member-kicked':
          this._removeParticipant(msg.to || msg.from);
          break;
        case 'hand':
          this._markHand(msg.from, msg.raised);
          break;
        case 'class-start':
          this._setStatus('live', '进行中');
          window.clToast('课堂已开始');
          break;
        case 'class-end':
          window.clToast('课堂已结束');
          this._setStatus('ended', '已结束');
          setTimeout(function () { self.leave(); }, 1200);
          break;
        default:
          break;
      }
    },

    _bindBackButton: function () {
      var self = this;
      var btn = document.getElementById('btn-back');
      if (btn) {
        btn.addEventListener('click', function () {
          if (window.confirm('确定要离开课堂吗？')) self.leave();
        });
      }
      window.addEventListener('pagehide', function () { self._bestEffortLeave(); });
    },

    leave: function () {
      if (this.leaving) return;
      this.leaving = true;
      var self = this;
      var ctx = this.ctx || {};
      this._bestEffortLeave();
      setTimeout(function () { self._gotoHome(ctx.role); }, 150);
    },

    _bestEffortLeave: function () {
      var ctx = this.ctx || {};
      try {
        if (window.ClassroomRTC && typeof window.ClassroomRTC.leave === 'function') window.ClassroomRTC.leave();
      } catch (e) {}
      try {
        if (window.ClassroomWS && typeof window.ClassroomWS.disconnectAll === 'function') window.ClassroomWS.disconnectAll();
      } catch (e) {}
      try {
        if (window.ClassroomAPI && typeof window.ClassroomAPI.leaveClassroom === 'function' && ctx.scheduleId) {
          window.ClassroomAPI.leaveClassroom(ctx.apiBaseUrl, ctx.scheduleId);
        }
      } catch (e) {}
    },

    // ---- 参与者列表 ----
    _addParticipant: function (userId, name, role) {
      if (!userId) return;
      this.participants[userId] = { userId: userId, name: name || userId, role: role || '' };
      this._renderParticipants();
      this._renderCount();
    },

    _removeParticipant: function (userId) {
      if (!userId || !this.participants[userId]) return;
      delete this.participants[userId];
      this._renderParticipants();
      this._renderCount();
    },

    _markHand: function (userId, raised) {
      var li = document.querySelector('#participant-list li[data-uid="' + this._cssEscape(userId) + '"]');
      if (li) li.classList.toggle('pt-hand', !!raised);
    },

    _renderParticipants: function () {
      var list = document.getElementById('participant-list');
      if (!list) return;
      var self = this;
      var ids = Object.keys(this.participants);
      var isTeacher = self.ctx && (self.ctx.role === 'teacher' || self.ctx.role === 'admin');
      list.innerHTML = ids.map(function (id) {
        var p = self.participants[id];
        var roleLabel = p.role === 'teacher' ? '教师' : (p.role === 'admin' ? '管理员' : '学生');
        var roleCls = p.role === 'teacher' ? 'pt-role-teacher' : (p.role === 'admin' ? 'pt-role-admin' : '');
        // F2-04：教师/管理员对学生可补签（此前后端有接口但前端无入口）
        var adjustBtn = (isTeacher && p.role === 'student')
          ? '<button class="pt-adjust" data-uid="' + self._cssEscape(id) + '">补签</button>' : '';
        return '<li data-uid="' + self._cssEscape(id) + '">' +
          '<span class="pt-avatar">' + self._initial(p.name) + '</span>' +
          '<span>' + self._escape(p.name) + '</span>' +
          '<span class="pt-role-tag ' + roleCls + '">' + roleLabel + '</span>' +
          adjustBtn +
          '</li>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('.pt-adjust'), function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-uid');
          var reason = window.prompt('请输入补签原因：');
          if (reason === null) return;
          self._doManualAdjust(self.ctx.apiBaseUrl, self.ctx.scheduleId, uid, reason);
        });
      });
    },

    _renderCount: function () {
      var n = document.getElementById('participant-count');
      if (n) n.textContent = Object.keys(this.participants).length;
    },

    // F1-06：进入课堂后加载全名单渲染参与者面板（修复此前只显示自己、看不到同学的问题）
    _refreshMembers: function (apiBaseUrl, scheduleId) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMembers !== 'function') {
        self._addParticipant(self.ctx.userId, self.ctx.userName, self.ctx.role);
        return;
      }
      window.ClassroomAPI.getMembers(apiBaseUrl, scheduleId)
        .then(function (list) {
          self.participants = {};
          (list || []).forEach(function (m) {
            self.participants[m.userId] = {
              userId: m.userId,
              name: m.displayName || m.userId,
              role: m.role
            };
          });
          self._renderParticipants();
          self._renderCount();
        })
        .catch(function () {
          self._addParticipant(self.ctx.userId, self.ctx.userName, self.ctx.role);
        });
    },

    // F2-04：教师补签（原因由 prompt 录入，操作人由后端从 token 取）
    _doManualAdjust: function (apiBaseUrl, scheduleId, userId, reason) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.manualAdjust !== 'function') return;
      window.ClassroomAPI.manualAdjust(apiBaseUrl, scheduleId, userId, reason)
        .then(function () {
          window.clToast('已补签：' + (self.participants[userId] ? self.participants[userId].name : userId));
        })
        .catch(function (e) { window.clToast((e && e.message) || '补签失败'); });
    },

    // F2-07：学生端「我的出勤」入口初始化
    _initMyAttendance: function (ctx) {
      var self = this;
      var btn = document.getElementById('btn-my-attendance');
      var modal = document.getElementById('my-attendance-modal');
      var closeBtn = document.getElementById('mam-close');
      if (btn) btn.classList.remove('hidden');
      if (closeBtn) closeBtn.addEventListener('click', function () {
        if (modal) modal.classList.add('hidden');
      });
      if (btn) btn.addEventListener('click', function () { self._showMyAttendance(ctx); });
    },

    _showMyAttendance: function (ctx) {
      var self = this;
      var modal = document.getElementById('my-attendance-modal');
      var listEl = document.getElementById('mam-list');
      if (!modal || !listEl) return;
      modal.classList.remove('hidden');
      listEl.innerHTML = '<li class="mam-loading">加载中...</li>';
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMyAttendanceHistory !== 'function') {
        listEl.innerHTML = '<li>出勤接口未就绪</li>'; return;
      }
      window.ClassroomAPI.getMyAttendanceHistory(ctx.apiBaseUrl)
        .then(function (rows) {
          if (!rows || !rows.length) { listEl.innerHTML = '<li class="mam-empty">暂无出勤记录</li>'; return; }
          var statusMap = { ABSENT: '缺席', PRESENT: '出勤', LATE: '迟到', LEFT: '离开', REJOINED: '重连' };
          listEl.innerHTML = rows.map(function (r) {
            var status = statusMap[r.attendanceStatus] || r.attendanceStatus || '-';
            var time = r.checkInAt ? String(r.checkInAt).replace('T', ' ') : '-';
            var mins = (r.effectiveMinutes != null) ? (r.effectiveMinutes + ' 分钟') : '-';
            return '<li><span>' + self._escape(r.courseName || r.scheduleId) + '</span>' +
              '<span>' + self._escape(time) + '</span>' +
              '<span>' + self._escape(status) + '</span>' +
              '<span>' + self._escape(mins) + '</span></li>';
          }).join('');
        })
        .catch(function (e) {
          listEl.innerHTML = '<li class="mam-empty">加载失败：' + self._escape((e && e.message) || '') + '</li>';
        });
    },

    _setStatus: function (kind, text) {
      var badge = document.getElementById('classroom-status');
      var label = document.getElementById('classroom-status-text');
      if (badge) badge.className = 'cl-status cl-status-' + kind;
      if (label) label.textContent = text;
    },

    _hidePlaceholder: function () {
      var ph = document.getElementById('main-placeholder');
      if (ph) ph.classList.add('hidden');
    },

    _gotoHome: function (role) {
      var file = ROLE_HOME[role] || 'login.html';
      window.location.href = (typeof window.pageUrl === 'function') ? window.pageUrl(file) : './' + file;
    },

    _gotoLogin: function () {
      window.location.href = (typeof window.pageUrl === 'function') ? window.pageUrl('login.html') : './login.html';
    },

    _initial: function (name) {
      if (!name) return '?';
      return String(name).charAt(0).toUpperCase();
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    _cssEscape: function (s) {
      if (s == null) return '';
      return String(s).replace(/["\\]/g, '\\$&');
    }
  };

  // 全局 toast
  window.clToast = function (msg) {
    var el = document.getElementById('cl-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cl-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.style.display = 'none'; }, 2600);
  };

  window.ClassroomMain = ClassroomMain;

  window.onload = function () { ClassroomMain.run(); };
})();