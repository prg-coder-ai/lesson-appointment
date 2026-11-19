/**
 * ops.js —— 课堂运营台（F8-01 监控 / F7-04 学情 / F7-05 对账 / F8-03 审核 / F8-05 联调）
 *
 * 一个页面五个 tab，全部走同一套 {code,data,message} 契约。
 * 权限口径由后端定（仅管理员），前端只做展示——不拿前端判断当权限。
 */
(function () {
  // 端点常量统一取自 shared/apiPaths.js（经 js/shared-domain-bridge.js 挂到 window.ApiPaths）。
  // classroom-ops.html 必须先加载 shared-domain-bridge.js，否则 EP 为空 → 请求打到 "undefined"。
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  // 见 api.js#window.classroomUrl：避免 apiBaseUrl(/api/v1) + EP(/api/v1/...) 双前缀 404
  var urlOf = function (base, path) {
    return typeof window.classroomUrl === 'function'
      ? window.classroomUrl(base, path) : (base || '') + path;
  };
  var Ops = {
    base: '',
    tab: 'monitor',
    report: null,

    run: function () {
      this.base = (typeof window.getClassroomApiBaseUrl === 'function')
        ? (window.getClassroomApiBaseUrl() || '') : '';
      if (!localStorage.getItem('token')) {
        document.body.innerHTML = '<div style="padding:40px;font-size:14px">请先登录后再使用运营台</div>';
        return;
      }
      this._renderUser();
      this._bindTabs();
      this._bindActions();
      this._defaultDates();
      this._defaultTempTime();
      this.load('monitor');
    },

    // ---------------- 基础设施 ----------------
    api: function (path, method, data) {
      return window.request({ url: urlOf(this.base, path), method: method || 'get', data: data });
    },

    toast: function (msg) {
      var el = document.getElementById('ops-toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
    },

    _renderUser: function () {
      var self = this;
      try {
        var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
        var el = document.getElementById('ops-user');
        if (!el || !u) return;
        // currentUser.name 可能沿用了未解密的密文，先给不含乱码的兜底，再按 userId 反查真名
        var nm = u.name || u.account || u.userId || '';
        el.textContent = (self.looksEncrypted(nm) ? (u.account || '管理员') : nm) + ' · ' + (u.role || '');
        if (u.userId) {
          self.userBriefs([u.userId]).then(function (map) {
            var b = map[u.userId];
            if (b && (b.account || b.name)) {
              el.textContent = (b.account || b.name) + ' · ' + (u.role || '');
            }
          });
        }
      } catch (e) { /* 展示失败无所谓 */ }
    },

    _defaultDates: function () {
      var to = new Date();
      var from = new Date(Date.now() - 29 * 86400000);
      var fmt = function (d) {
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      };
      var f = document.getElementById('rep-from');
      var t = document.getElementById('rep-to');
      if (f) f.value = fmt(from);
      if (t) t.value = fmt(to);
    },

    _bindTabs: function () {
      var self = this;
      var tabs = document.querySelectorAll('.ops-tabs button');
      Array.prototype.forEach.call(tabs, function (btn) {
        btn.addEventListener('click', function () {
          Array.prototype.forEach.call(tabs, function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var name = btn.getAttribute('data-tab');
          self.tab = name;
          Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (sec) {
            sec.classList.remove('active');
          });
          var sec = document.getElementById('tab-' + name);
          if (sec) sec.classList.add('active');
          self.load(name);
        });
      });
      var refresh = document.getElementById('ops-refresh');
      if (refresh) refresh.addEventListener('click', function () { self.load(self.tab); });
    },

    _bindActions: function () {
      var self = this;
      var on = function (id, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
      };
      on('rep-query', function () { self.loadReport(); });
      on('rep-export-attendance', function () { self._export('attendance'); });
      on('rep-export-recordings', function () { self._export('recordings'); });
      on('rc-query', function () { self.loadReconcile(); });
      on('rc-run', function () {
        self.api(EP.CLASSROOM_ADMIN_RECONCILE_RUN, 'post')
          .then(function (data) {
            self.toast('对账完成：上报 ' + ((data && data.reported) || 0) + ' 条差异');
            self.loadReconcile();
          })
          .catch(function (e) { self.toast((e && e.message) || '对账失败'); });
      });
      on('au-query', function () { self.loadAudit(); });
      on('au-chat-view', function () {
        var sid = (document.getElementById('au-schedule') || {}).value;
        if (!sid) { self.toast('请先填写课次后再记录查阅'); return; }
        self.api(EP.CLASSROOM_ADMIN_AUDIT_CHAT_VIEW(sid), 'post', { note: '运营台查阅' })
          .then(function () { self.toast('已留痕'); self.loadAuditLogs(); })
          .catch(function (e) { self.toast((e && e.message) || '留痕失败'); });
      });
      on('ct-query', function () { self.loadContract(); });
      on('ct-replay', function () { self._replay(); });
      on('ct-resync', function () { self._resync(); });
      // 应急建课 / 加学员（B1/B2，2026-11-19）
      on('tmp-create', function () { self._createTemp(); });
      on('mem-add', function () { self._addMembers(); });
    },

    load: function (tab) {
      if (tab === 'monitor') this.loadMonitor();
      else if (tab === 'report') this.loadReport();
      else if (tab === 'reconcile') this.loadReconcile();
      else if (tab === 'audit') { this.loadAudit(); this.loadAuditLogs(); }
      else if (tab === 'contract') this.loadContract();
    },

    // ---------------- 渲染辅助 ----------------
    table: function (elId, headers, rows) {
      var el = document.getElementById(elId);
      if (!el) return;
      if (!rows || !rows.length) {
        el.innerHTML = '<tr><td colspan="' + headers.length + '" class="empty">暂无数据</td></tr>';
        return;
      }
      var head = '<tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
      el.innerHTML = head + rows.join('');
    },

    esc: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    fmtTime: function (v) {
      if (!v) return '';
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      var p = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    },

    pct: function (v) {
      if (v == null) return '-';
      return (Number(v) * 100).toFixed(1) + '%';
    },

    card: function (k, v, warn) {
      return '<div class="card"><div class="k">' + k + '</div><div class="v' +
        (warn ? ' warn' : '') + '">' + v + '</div></div>';
    },

    /** 进入课堂：与预定审核 enterClassroom 同一跳转语义，pageUrl 存在时带上 base */
    _enterClassroom: function (scheduleId) {
      if (!scheduleId) { this.toast('缺少排期信息'); return; }
      window.location.href = (typeof window.pageUrl === 'function')
        ? window.pageUrl('classroom.html', { scheduleId: scheduleId })
        : './classroom.html?scheduleId=' + encodeURIComponent(scheduleId);
    },

    // ---------------- 应急建课 / 加学员 / 强制结束（B1~B3，2026-11-19） ----------------

    /** 默认时间：现在 ~ +60 分钟（datetime-local 需要 yyyy-MM-ddThh:mm） */
    _defaultTempTime: function () {
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      var fmt = function (d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
          + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      };
      var s = document.getElementById('tmp-start');
      var e = document.getElementById('tmp-end');
      var now = new Date();
      if (s && !s.value) s.value = fmt(now);
      if (e && !e.value) e.value = fmt(new Date(now.getTime() + 60 * 60000));
    },

    /** 拼课堂页绝对链接；经 pageUrl 走同一套规则（会自动带 tCode，多租户下登录页才不会锁错机构） */
    _classroomLink: function (scheduleId, extra) {
      var params = { scheduleId: scheduleId };
      if (extra) {
        Object.keys(extra).forEach(function (k) { params[k] = extra[k]; });
      }
      var rel = (typeof window.pageUrl === 'function')
        ? window.pageUrl('classroom.html', params)
        : ('./classroom.html?scheduleId=' + encodeURIComponent(scheduleId));
      try {
        return new URL(rel, window.location.href).href;
      } catch (err) {
        return rel;
      }
    },

    /** 复制到剪贴板：clipboard API 不可用（非 HTTPS / 老浏览器）时退回 execCommand */
    _copyText: function (text, okMsg) {
      var self = this;
      var done = function () { self.toast(okMsg || '已复制'); };
      var fallback = function () {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (err) {
          self.toast('复制失败，请手动选中链接');
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }
    },

    /** 「,」「，」「空格」「;」都能当分隔符——管理员多半是从聊天里粘一串 id 过来 */
    _splitIds: function (raw) {
      return String(raw || '')
        .split(/[,，;；\s]+/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return !!s; });
    },

    _createTemp: function () {
      var self = this;
      var teacherId = ((document.getElementById('tmp-teacher') || {}).value || '').trim();
      if (!teacherId) { self.toast('请填写教师 userId'); return; }
      var name = ((document.getElementById('tmp-name') || {}).value || '').trim();
      var startVal = ((document.getElementById('tmp-start') || {}).value || '').trim();
      var endVal = ((document.getElementById('tmp-end') || {}).value || '').trim();
      var duration = Number((document.getElementById('tmp-duration') || {}).value || 60) || 60;
      var students = self._splitIds((document.getElementById('tmp-students') || {}).value)
        .map(function (id) { return { userId: id, name: id }; });

      var body = {
        courseName: name || '临时课堂',
        teacherId: teacherId,
        teacherName: teacherId,
        students: students,
        duration: duration
      };
      // datetime-local 可能给到分钟（yyyy-MM-ddThh:mm），也可能是秒；后端两种都收，
      // 但**绝不能带 Z**（LocalDateTime 不接偏移，带了直接 400）
      if (startVal) body.startTime = startVal.length === 16 ? startVal + ':00' : startVal;
      if (endVal) body.endTime = endVal.length === 16 ? endVal + ':00' : endVal;

      var btn = document.getElementById('tmp-create');
      if (btn) { btn.disabled = true; btn.textContent = '创建中…'; }
      var restore = function () {
        if (btn) { btn.disabled = false; btn.textContent = '创建临时课堂'; }
      };
      self.api(EP.CLASSROOM_ADMIN_CREATE, 'post', body)
        .then(function (d) {
          self.toast('临时课堂已创建');
          self._renderTempResult(d || {});
          self.loadMonitor();
        })
        .catch(function (e) { self.toast((e && e.message) || '创建失败'); })
        .then(restore);
    },

    _renderTempResult: function (d) {
      var el = document.getElementById('tmp-result');
      if (!el) return;
      var sid = d.scheduleId || '';
      if (!sid) { el.innerHTML = ''; return; }
      var studentLink = this._classroomLink(sid);
      var teacherLink = this._classroomLink(sid, { role: 'teacher' });
      el.innerHTML = '<div style="margin-top:10px;padding:10px 12px;background:#f6f8fa;border:1px solid #e5e7eb;border-radius:6px;font-size:13px">'
        + '<div><b>课堂号</b>：<code>' + this.esc(sid) + '</code>'
        + ' <b>状态</b>：' + this.esc(d.status || '-')
        + (d.studentCount ? ' <b>学生</b>：' + d.studentCount + ' 人' : '') + '</div>'
        + '<div style="margin-top:4px"><b>时间</b>：' + this.fmtTime(d.startTime) + ' ~ ' + this.fmtTime(d.endTime) + '</div>'
        + '<div style="margin-top:8px"><b>学生链接</b>：'
        + '<input type="text" readonly value="' + this.esc(studentLink) + '" style="width:66%"> '
        + '<button class="btn small" data-tmp-copy="' + this.esc(studentLink) + '">复制</button></div>'
        + '<div style="margin-top:4px"><b>管理员代开课</b>：'
        + '<input type="text" readonly value="' + this.esc(teacherLink) + '" style="width:66%"> '
        + '<button class="btn small" data-tmp-copy="' + this.esc(teacherLink) + '">复制</button></div>'
        + '<div class="muted" style="margin-top:6px">'
        + '① 建出来是「待开课」，需点「进行中」才开课；② 学生需先登录——未登录会被带到登录页，登录后自动回课堂；'
        + '③ 不计课时、不进学情报表，也不在学生「我的课堂」里。</div>'
        + '</div>';
      var self = this;
      Array.prototype.forEach.call(el.querySelectorAll('[data-tmp-copy]'), function (btn) {
        btn.addEventListener('click', function () {
          self._copyText(btn.getAttribute('data-tmp-copy'), '链接已复制，发给学生即可');
        });
      });
    },

    _addMembers: function () {
      var self = this;
      var sid = ((document.getElementById('mem-schedule') || {}).value || '').trim();
      if (!sid) { self.toast('请填写课堂号'); return; }
      var ids = self._splitIds((document.getElementById('mem-students') || {}).value);
      if (!ids.length) { self.toast('请填写学生 userId'); return; }
      var note = ((document.getElementById('mem-note') || {}).value || '').trim();
      var students = ids.map(function (id) { return { userId: id, name: id }; });
      self.api(EP.CLASSROOM_ADMIN_ADD_MEMBERS(sid), 'post', { students: students, note: note })
        .then(function (d) {
          var msg = '已加入 ' + ((d && d.addedCount) || 0) + ' 人';
          if (d && d.skippedCount) msg += '，跳过 ' + d.skippedCount + ' 人（已在课堂）';
          self.toast(msg);
          var stu = document.getElementById('mem-students');
          if (stu) stu.value = '';
          self.loadMonitor();
        })
        .catch(function (e) { self.toast((e && e.message) || '加入失败'); });
    },

    /** 点表格里的「加学员」：把课堂号填进表单并滚过去，避免管理员手抄 32 位 id */
    _fillMemberForm: function (scheduleId) {
      var input = document.getElementById('mem-schedule');
      if (!input) return;
      input.value = scheduleId || '';
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var stu = document.getElementById('mem-students');
      if (stu) setTimeout(function () { stu.focus(); }, 200);
      this.toast('已填入课堂号，填学生 userId 后点「加入」');
    },

    _endClassroom: function (scheduleId) {
      if (!scheduleId) { this.toast('缺少课堂号'); return; }
      if (!window.confirm('确定强制结束课堂 ' + this.shortId(scheduleId) + ' 吗？\n'
        + '结束后状态变为 CLOSED：出勤与课时按当前记录归一，不可重开。')) return;
      var self = this;
      self.api(EP.CLASSROOM_ADMIN_END(scheduleId), 'post')
        .then(function () { self.toast('已结束课堂'); self.loadMonitor(); })
        .catch(function (e) { self.toast((e && e.message) || '结束失败'); });
    },

    // ---------------- 监控 ----------------
    /**
     * 批量把 userId 反查成可展示的 {name, account}（教师/学员/操作人通用）。
     * 背景：① 预约侧推排期事件时把 user.name 原文（入库即密文）塞进 classroom.teacher_name，
     * 课堂侧没有 AES_KEY 解不开，前端直接显示就是一串十六进制、看起来像 id；
     * ② 学情/审核报表按 userId 聚合，不带姓名（见 StudentLearningStatVO 注释）。
     * 权威解在主服务 /api/v1/user/briefs（服务端 decryptUserFields 后回明 name，
     * account 仅管理员下发），同源走 api(8081)，带 token、自动解包 data。
     * 失败一律吞掉回退空 map，不影响各 tab 主流程。
     */
    userBriefs: function (ids) {
      var uniq = [];
      (ids || []).forEach(function (id) {
        if (id && uniq.indexOf(id) < 0) uniq.push(id);
      });
      if (!uniq.length || !EP.USER_BRIEFS || !window.request) return Promise.resolve({});
      return window.request({ url: EP.USER_BRIEFS(uniq), method: 'get', customErrorMsg: false })
        .then(function (list) {
          var map = {};
          (list || []).forEach(function (b) { if (b && b.userId) map[b.userId] = b; });
          return map;
        })
        .catch(function () { return {}; });
    },

    /**
     * 库里的姓名是不是密文（主库 user.name 入库即加密，形如 "ivHex:cipherBase64"）。
     * 反查失败时绝不能把密文直接摆到界面上——它看着像 id，用户根本认不出是谁。
     */
    looksEncrypted: function (s) {
      var v = (s == null) ? '' : String(s);
      if (v.length <= 24) return false;
      if (!/[\u4e00-\u9fa5\s]/.test(v) && v.indexOf(':') > 8) return true;
      // 纯十六进制串（无冒号）也当密文：真实姓名不会是 40 位以上纯 hex
      return /^[0-9a-f]{32,}$/i.test(v);
    },

    /** brief → 可展示名（账号唯一可辨识优先，其次姓名，最后回退原始值；密文一律不原样展示） */
    personLabel: function (b, raw) {
      if (b && (b.account || b.name)) return b.account || b.name;
      var s = (raw == null) ? '' : String(raw);
      if (!s) return '-';
      if (this.looksEncrypted(s)) return '未知用户';
      return s;
    },

    /**
     * scheduleId 是「排期~课次」的复合键（见后端 ClassroomKey）：
     *   第 1 课次 = 裸排期 id；第 2 课次起 = "<排期id>~<N>"。
     * 直接摆出来就是一串 UUID，这里取课次序号。
     */
    classIndexOf: function (key) {
      var s = (key == null) ? '' : String(key);
      var i = s.indexOf('~');
      if (i < 0 || i === s.length - 1) return 1;
      var v = parseInt(s.slice(i + 1), 10);
      return (v > 0) ? v : 1;
    },

    /** 课程名字典：scheduleId → courseName（由课堂列表接口顺手填充） */
    _classNameMap: {},

    cacheClassNames: function (list) {
      var m = this._classNameMap;
      (list || []).forEach(function (c) {
        if (c && c.scheduleId && c.courseName) m[c.scheduleId] = c.courseName;
      });
    },

    /**
     * 建「课堂字典」：审核/联调/对账各表只存 schedule_id，展示要「课程名 · 第N课次」。
     * 后端没有按 id 批量查的接口，但有按状态列全量的 /admin/classrooms/monitor，
     * 故并行走几个状态一次性建好字典（只拉一次，之后 tab 切换零请求）。
     * 失败静默——最差退化成只显示「第N课次」，也比 UUID 可读。
     */
    primeClassNames: function () {
      var self = this;
      if (!EP.CLASSROOM_ADMIN_CLASSROOMS) return Promise.resolve();
      if (self._classNamesPriming) return self._classNamesPriming;
      var statuses = ['LIVE', 'PAUSED', 'READY', 'SCHEDULED', 'CLOSED'];
      self._classNamesPriming = Promise.all(statuses.map(function (st) {
        return self.api(EP.CLASSROOM_ADMIN_CLASSROOMS, 'get', { status: st })
          .then(function (list) { self.cacheClassNames(list); })
          .catch(function () { /* 单个状态失败不影响其它 */ });
      }));
      return self._classNamesPriming;
    },

    /** 课次可读化：「课程名 · 第N课次」；课程名缺失时至少给出课次序号 */
    classLabel: function (key) {
      var s = (key == null) ? '' : String(key);
      if (!s) return '-';
      var name = this._classNameMap[s] || '';
      var idx = this.classIndexOf(s);
      var tail = '第' + idx + '课次';
      return name ? (name + ' · ' + tail) : tail;
    },

    /** eventId 截断：只显示前 8 个字符 + 省略号，完整值放 title 备查 */
    shortId: function (id) {
      var s = (id == null) ? '' : String(id);
      return s.length > 8 ? s.slice(0, 8) + '…' : s;
    },

    loadMonitor: function () {
      var self = this;
      this.api(EP.CLASSROOM_ADMIN_MONITOR_OVERVIEW)
        .then(function (d) {
          var cards = document.getElementById('monitor-cards');
          if (cards) {
            cards.innerHTML =
              self.card('今日课程', d.todayClasses || 0) +
              self.card('并发课堂（LIVE）', d.liveClasses || 0) +
              self.card('在线人数', d.onlineUsers || 0) +
              self.card('未处置差异', d.openDiffs || 0, (d.openDiffs || 0) > 0);
          }
          var t = document.getElementById('monitor-time');
          if (t) t.textContent = '更新于 ' + self.fmtTime(d.serverTime);

          var active = d.activeClasses || [];
          // 顺手把「scheduleId → 课程名」灌进字典，供审核/联调/对账把课次翻成可读文字
          self.cacheClassNames(active);
          // 教师名反查：拿明文 name/account 覆盖库里的密文 teacher_name（见 userBriefs 注释）
          return self.userBriefs(active.map(function (c) { return c.teacherId; }))
            .then(function (briefs) {
              var rows = active.map(function (c) {
                var b = briefs[c.teacherId] || {};
                // 优先账号（唯一可辨识），其次姓名，最后才回退库里的 teacher_name / teacher_id
                var label = self.personLabel(b, c.teacherName || c.teacherId);
                var title = b.name ? (b.name + (b.account ? ' / ' + b.account : '')) : (b.account || c.teacherId || '');
                var tag = c.status === 'LIVE' ? '<span class="tag ok">LIVE</span>'
                  : '<span class="tag mute">' + self.esc(c.status) + '</span>';
                var ratio = c.memberCount ? (c.onlineCount + '/' + c.memberCount) : (c.onlineCount + '/-');
                // 进入课堂（2026-11-15）：活跃课堂均有对应 scheduleId，管理端可直接旁听。
                // 本页未加载全局 enterClassroom，故走 data-enter 事件委托（同对账表 data-resolve 模式）。
                // 操作列（2026-11-19 扩）：进入课堂 / 复制学生链接 / 加学员 / 强制结束。
                // 链接由 _classroomLink 统一拼（带 tCode），避免手抄或漏参数进不去。
                var sid = c.scheduleId ? self.esc(c.scheduleId) : '';
                var ops = '-';
                if (sid) {
                  ops = '<button class="btn small" data-enter="' + sid + '">进入课堂</button>'
                    + ' <button class="btn small" data-copy="' + sid + '">复制学生链接</button>'
                    + ' <button class="btn small" data-mem="' + sid + '">加学员</button>';
                  if (c.status === 'LIVE' || c.status === 'PAUSED') {
                    ops += ' <button class="btn small danger" data-end="' + sid + '">结束</button>';
                  }
                }
                return '<tr>' +
                  '<td>' + self.esc(c.courseName || '-') + '</td>' +
                  '<td title="' + self.esc(title) + '">' + self.esc(label) + '</td>' +
                  '<td>' + self.fmtTime(c.startTime) + '</td>' +
                  '<td>' + tag + '</td>' +
                  '<td>' + ratio + '</td>' +
                  '<td>' + ops + '</td>' +
                  '</tr>';
              });
              self.table('monitor-table', ['课程', '教师', '开始时间', '状态', '在线/成员', '操作'], rows);
              Array.prototype.forEach.call(document.querySelectorAll('#monitor-table [data-enter]'), function (btn) {
                btn.addEventListener('click', function () {
                  self._enterClassroom(btn.getAttribute('data-enter'));
                });
              });
              Array.prototype.forEach.call(document.querySelectorAll('#monitor-table [data-copy]'), function (btn) {
                btn.addEventListener('click', function () {
                  var id = btn.getAttribute('data-copy');
                  self._copyText(self._classroomLink(id), '学生链接已复制');
                });
              });
              Array.prototype.forEach.call(document.querySelectorAll('#monitor-table [data-mem]'), function (btn) {
                btn.addEventListener('click', function () {
                  self._fillMemberForm(btn.getAttribute('data-mem'));
                });
              });
              Array.prototype.forEach.call(document.querySelectorAll('#monitor-table [data-end]'), function (btn) {
                btn.addEventListener('click', function () {
                  self._endClassroom(btn.getAttribute('data-end'));
                });
              });
            });
        })
        .catch(function (e) { self.toast((e && e.message) || '监控加载失败'); });

      this.api(EP.CLASSROOM_ADMIN_MONITOR_ALERTS)
        .then(function (d) {
          var el = document.getElementById('monitor-alerts');
          if (!el) return;
          var html = '';
          if (d.staleLiveCount > 0) {
            html += '<div style="margin-bottom:8px;color:#b42318;font-weight:600">卡在 LIVE 未下课的课堂 '
              + d.staleLiveCount + ' 节</div><ul style="margin:0 0 12px 18px;padding:0">';
            (d.staleLive || []).forEach(function (c) {
              html += '<li>' + self.esc(c.courseName || self.classLabel(c.scheduleId)) +
                ' 计划结束 ' + self.fmtTime(c.endTime) + '</li>';
            });
            html += '</ul>';
          }
          if (d.openDiffCount > 0) {
            html += '<div style="color:#b54708;font-weight:600">未处置对账差异 ' + d.openDiffCount + ' 条</div>';
            html += '<ul style="margin:6px 0 0 18px;padding:0">';
            (d.diffs || []).slice(0, 8).forEach(function (x) {
              html += '<li>' + self.esc(x.diffType) + ' · ' + self.esc(self.classLabel(x.scheduleId)) +
                ' · ' + self.esc(x.detail || '') + '</li>';
            });
            html += '</ul>';
          }
          if (!html) html = '<div class="muted">当前无告警</div>';
          el.innerHTML = html;
        })
        .catch(function () { /* 告警失败不打扰 */ });

      this.api(EP.CLASSROOM_ADMIN_MONITOR_METRICS)
        .then(function (d) {
          var el = document.getElementById('monitor-metrics');
          if (!el) return;
          var rtc = d.rtc || {};
          var rec = d.recording || {};
          var st = d.storage || {};
          var html = '<div class="kv">';
          html += '<div class="k">RTC 生效</div><div>' + self.esc(rtc.active) + '</div>';
          html += '<div class="k">RTC 可选</div><div>' + (rtc.providers || []).map(function (p) {
            return self.esc(p.name) + '(' + self.esc(p.topology) + (p.available ? '' : '/不可用') + (p.active ? '/生效' : '') + ')';
          }).join('、') + '</div>';
          html += '<div class="k">录制模式</div><div>' + self.esc(rec.active) +
            (rec.degraded ? ' <span class="tag warn">已降级（配置 ' + self.esc(rec.configured) + '）</span>' : '') + '</div>';
          html += '<div class="k">存储</div><div>' + self.esc(st.type) + '</div>';
          html += '</div>';
          el.innerHTML = html;
        })
        .catch(function () { /* 同上 */ });
    },

    // ---------------- 学情 ----------------
    loadReport: function () {
      var self = this;
      var from = (document.getElementById('rep-from') || {}).value;
      var to = (document.getElementById('rep-to') || {}).value;
      this.api(EP.CLASSROOM_ADMIN_REPORT_LEARNING, 'get', { from: from, to: to })
        .then(function (d) {
          self.report = d;
          var s = d.summary || {};
          var cards = document.getElementById('rep-cards');
          if (cards) {
            cards.innerHTML =
              self.card('出勤率', self.pct(s.attendanceRate)) +
              self.card('迟到率', self.pct(s.lateRate)) +
              self.card('缺勤率', self.pct(s.absenceRate), (s.absenceRate || 0) > 0.2) +
              self.card('平均有效时长', (s.avgEffectiveMinutes || 0) + ' 分') +
              self.card('互动次数', (s.interactions || 0)) +
              self.card('课堂数', s.classCount || 0);
          }
          // 教师/学员名统一反查（教师列是密文、学员列是裸 userId，见 userBriefs 注释）
          var byClass = d.byClass || [];
          var byStudent = d.byStudent || [];
          // 学情按课堂维度返回了 courseName，正好喂给课次字典（其它 tab 复用）
          self.cacheClassNames(byClass);
          var ids = byClass.map(function (c) { return c.teacherId; })
            .concat(byStudent.map(function (x) { return x.userId; }));
          return self.userBriefs(ids).then(function (briefs) {
            var rows = byClass.map(function (c) {
              var b = briefs[c.teacherId] || {};
              var tname = self.personLabel(b, c.teacherName || c.teacherId);
              var rate = c.total ? (c.present / c.total) : 0;
              return '<tr>' +
                '<td>' + self.esc(c.courseName || '-') + '</td>' +
                '<td title="' + self.esc(tname) + '">' + self.esc(tname) + '</td>' +
                '<td>' + self.fmtTime(c.startTime) + '</td>' +
                '<td>' + (c.total || 0) + '</td>' +
                '<td>' + (c.present || 0) + '</td>' +
                '<td>' + (c.late || 0) + '</td>' +
                '<td>' + (c.absent || 0) + '</td>' +
                '<td>' + self.pct(rate) + '</td>' +
                '<td>' + (c.rollcallAnswered || 0) + '</td>' +
                '<td>' + (c.submissions || 0) + '</td>' +
                '</tr>';
            });
            self.table('rep-class-table',
              ['课程', '教师', '上课时间', '应到', '实到', '迟到', '缺勤', '出勤率', '点名应答', '作品'],
              rows);

            var srows = byStudent.map(function (x) {
              var b = briefs[x.userId] || {};
              var sname = self.personLabel(b, x.userId);
              return '<tr>' +
                '<td title="' + self.esc(sname) + '">' + self.esc(sname) + '</td>' +
                '<td>' + (x.total || 0) + '</td>' +
                '<td>' + (x.present || 0) + '</td>' +
                '<td>' + (x.absent || 0) + '</td>' +
                '<td>' + (x.late || 0) + '</td>' +
                '<td>' + self.pct(x.attendanceRate) + '</td>' +
                '<td>' + (x.avgMinutes == null ? '-' : x.avgMinutes) + '</td>' +
                '</tr>';
            });
            self.table('rep-student-table', ['学员', '应到', '实到', '缺勤', '迟到', '出勤率', '平均时长'], srows);
          });
        })
        .catch(function (e) { self.toast((e && e.message) || '报表加载失败'); });
    },

    /** 导出：必须带 Authorization，所以用 fetch 取 blob 再触发下载（不能直接 window.open） */
    _export: function (type) {
      var self = this;
      var from = (document.getElementById('rep-from') || {}).value;
      var to = (document.getElementById('rep-to') || {}).value;
      var url = urlOf(this.base, EP.CLASSROOM_ADMIN_EXPORT(type)) +
        '?from=' + encodeURIComponent(from || '') + '&to=' + encodeURIComponent(to || '');
      fetch(url, { headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') } })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        })
        .then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = type + '.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          self.toast('导出已开始下载');
        })
        .catch(function (e) { self.toast('导出失败：' + ((e && e.message) || '')); });
    },

    // ---------------- 对账 ----------------
    loadReconcile: function () {
      var self = this;
      var status = (document.getElementById('rc-status') || {}).value;
      var days = (document.getElementById('rc-days') || {}).value || 7;
      this.api(EP.CLASSROOM_ADMIN_RECONCILE_DIFFS, 'get', { status: status, days: days })
        .then(function (rows) {
          // 课次列要「课程名 · 第N课次」，先确保课堂字典就绪
          return self.primeClassNames().then(function () { return rows || []; });
        })
        .then(function (rows) {
          var html = rows.map(function (d) {
            var sev = d.severity === 'ERROR' ? '<span class="tag err">ERROR</span>'
              : '<span class="tag warn">WARN</span>';
            var st = d.status === 'OPEN' ? '<span class="tag warn">未处置</span>'
              : (d.status === 'IGNORED' ? '<span class="tag mute">已忽略</span>' : '<span class="tag ok">已处置</span>');
            var ops = d.status === 'OPEN'
              ? '<button class="btn small" data-resolve="' + d.diffId + '" data-ignore="0">处置</button> ' +
                '<button class="btn small danger" data-resolve="' + d.diffId + '" data-ignore="1">忽略</button>'
              : (d.resolveNote ? self.esc(d.resolveNote) : '');
            var clabel = self.classLabel(d.scheduleId);
            return '<tr>' +
              '<td title="' + self.esc(d.scheduleId) + '">' + self.esc(clabel) + '</td>' +
              '<td>' + self.esc(d.diffType) + '</td>' +
              '<td>' + sev + '</td>' +
              '<td>' + self.esc(d.detail || '') + '</td>' +
              '<td>' + st + '</td>' +
              '<td>' + self.fmtTime(d.createdAt) + '</td>' +
              '<td>' + ops + '</td>' +
              '</tr>';
          });
          self.table('rc-table', ['课次', '差异类型', '级别', '明细', '状态', '发现时间', '操作'], html);

          Array.prototype.forEach.call(document.querySelectorAll('#rc-table [data-resolve]'), function (btn) {
            btn.addEventListener('click', function () {
              var id = btn.getAttribute('data-resolve');
              var ignore = btn.getAttribute('data-ignore') === '1';
              var note = window.prompt(ignore ? '忽略原因（可留空）：' : '处置说明（可留空）：', '') || '';
              self.api(EP.CLASSROOM_ADMIN_RECONCILE_RESOLVE(id), 'post',
                { note: note, ignore: ignore })
                .then(function () { self.toast('已处置'); self.loadReconcile(); })
                .catch(function (e) { self.toast((e && e.message) || '处置失败'); });
            });
          });
        })
        .catch(function (e) { self.toast((e && e.message) || '对账查询失败'); });
    },

    // ---------------- 审核 ----------------
    loadAudit: function () {
      var self = this;
      var scheduleId = (document.getElementById('au-schedule') || {}).value || '';
      var status = (document.getElementById('au-status') || {}).value || '';
      this.api(EP.CLASSROOM_ADMIN_AUDIT_SUBMISSIONS, 'get',
        { scheduleId: scheduleId, status: status, limit: 50 })
        .then(function (rows) {
          rows = rows || [];
          // 学员名反查 + 课次字典并行：等齐再渲染，否则会先画「第N课次」再刷成「课程名 · 第N课次」
          return Promise.all([
            self.userBriefs(rows.map(function (r) { return r.userId; })),
            self.primeClassNames()
          ]).then(function (res) {
              var briefs = res[0] || {};
              var html = rows.map(function (r) {
                var media = '';
                if (r.url) {
                  var u = self.esc(r.url);
                  if (r.submissionType === 'AUDIO') media = '<audio controls preload="none" src="' + u + '"></audio>';
                  else if (r.submissionType === 'IMAGE') media = '<a href="' + u + '" target="_blank" rel="noopener">查看图片</a>';
                  else if (r.submissionType !== 'TEXT') media = '<a href="' + u + '" target="_blank" rel="noopener">下载附件</a>';
                }
                var st = r.status === 'FLAGGED' ? '<span class="tag err">违规</span>'
                  : (r.status === 'REVIEWED' ? '<span class="tag ok">已点评</span>' : '<span class="tag mute">待审</span>');
                var ops = '<button class="btn small" data-pass="' + r.submissionId + '">通过</button> ' +
                  '<button class="btn small danger" data-flag="' + r.submissionId + '">标记违规</button>';
                var sname = self.personLabel(briefs[r.userId], r.userId);
                // 课次列：schedule_id 是「排期~课次」复合键，翻成「课程名 · 第N课次」，原值留 title
                var clabel = self.classLabel(r.scheduleId);
                return '<tr>' +
                  '<td title="' + self.esc(r.scheduleId) + '">' + self.esc(clabel) + '</td>' +
                  '<td title="' + self.esc(sname) + '">' + self.esc(sname) + '</td>' +
                  '<td>' + self.esc(r.submissionType) + '</td>' +
                  '<td>' + self.esc(r.content || '') + '<div>' + media + '</div></td>' +
                  '<td>' + st + '</td>' +
                  '<td>' + self.fmtTime(r.createdAt) + '</td>' +
                  '<td>' + ops + '</td>' +
                  '</tr>';
              });
              self.table('au-table', ['课次', '学员', '类型', '内容/附件', '状态', '提交时间', '操作'], html);

              Array.prototype.forEach.call(document.querySelectorAll('#au-table [data-flag]'), function (btn) {
                btn.addEventListener('click', function () {
                  var note = window.prompt('标记违规原因：', '');
                  if (note === null) return;
                  self.api(EP.CLASSROOM_ADMIN_AUDIT_SUBMISSION_FLAG(btn.getAttribute('data-flag')),
                    'post', { note: note })
                    .then(function () { self.toast('已标记'); self.loadAudit(); self.loadAuditLogs(); })
                    .catch(function (e) { self.toast((e && e.message) || '操作失败'); });
                });
              });
              Array.prototype.forEach.call(document.querySelectorAll('#au-table [data-pass]'), function (btn) {
                btn.addEventListener('click', function () {
                  self.api(EP.CLASSROOM_ADMIN_AUDIT_SUBMISSION_PASS(btn.getAttribute('data-pass')),
                    'post', { note: '运营抽查通过' })
                    .then(function () { self.toast('已通过'); self.loadAuditLogs(); })
                    .catch(function (e) { self.toast((e && e.message) || '操作失败'); });
                });
              });
            });
        })
        .catch(function (e) { self.toast((e && e.message) || '抽查失败'); });
    },

    loadAuditLogs: function () {
      var self = this;
      this.api(EP.CLASSROOM_ADMIN_AUDIT_LOGS, 'get', { days: 7 })
        .then(function (rows) {
          rows = rows || [];
          // 操作人反查 + 课次字典并行
          return Promise.all([
            self.userBriefs(rows.map(function (l) { return l.operatorId; })),
            self.primeClassNames()
          ]).then(function (res) {
              var briefs = res[0] || {};
              var html = rows.map(function (l) {
                var oper = self.personLabel(briefs[l.operatorId], l.operatorId);
                var clabel = self.classLabel(l.scheduleId);
                return '<tr>' +
                  '<td>' + self.fmtTime(l.createdAt) + '</td>' +
                  '<td title="' + self.esc(oper) + '">' + self.esc(oper) + '</td>' +
                  '<td>' + self.esc(l.targetType) + '</td>' +
                  '<td>' + self.esc(l.targetId || '-') + '</td>' +
                  '<td title="' + self.esc(l.scheduleId || '') + '">' + self.esc(clabel) + '</td>' +
                  '<td>' + self.esc(l.action) + '</td>' +
                  '<td>' + self.esc(l.note || '') + '</td>' +
                  '</tr>';
              });
              self.table('au-log-table', ['时间', '操作人', '对象类型', '对象', '课次', '动作', '备注'], html);
            });
        })
        .catch(function () { /* 留痕失败不打扰主流程 */ });
    },

    // ---------------- 联调 ----------------
    loadContract: function () {
      var self = this;
      var scheduleId = (document.getElementById('ct-schedule') || {}).value || '';
      var result = (document.getElementById('ct-result') || {}).value || '';
      var days = (document.getElementById('ct-days') || {}).value || 7;
      this.api(EP.CLASSROOM_ADMIN_CONTRACT_EVENTS, 'get',
        { scheduleId: scheduleId, result: result, days: days })
        .then(function (rows) {
          // 课次列要「课程名 · 第N课次」，先确保课堂字典就绪（首次并发拉，之后走缓存）
          return self.primeClassNames().then(function () { return rows || []; });
        })
        .then(function (rows) {
          var html = rows.map(function (r) {
            var tag = r.result === 'SUCCESS' ? '<span class="tag ok">SUCCESS</span>'
              : (r.result === 'FAILED' ? '<span class="tag err">FAILED</span>' : '<span class="tag mute">SKIPPED</span>');
            var clabel = self.classLabel(r.scheduleId);
            return '<tr>' +
              '<td>' + self.fmtTime(r.receivedAt) + '</td>' +
              // eventId 只显示前 8 字符 + 省略号，完整值留 title 备查（2026-11-15）
              '<td title="' + self.esc(r.eventId) + '">' + self.esc(self.shortId(r.eventId)) + '</td>' +
              '<td>' + self.esc(r.eventType) + '</td>' +
              '<td title="' + self.esc(r.scheduleId) + '">' + self.esc(clabel) + '</td>' +
              '<td>' + tag + '</td>' +
              '<td>' + self.esc(r.skipReason || r.failReason || '') + '</td>' +
              '</tr>';
          });
          self.table('ct-table', ['接收时间', 'eventId', '类型', '课次', '结果', '原因'], html);
        })
        .catch(function (e) { self.toast((e && e.message) || '事件查询失败'); });
    },

    _replay: function () {
      var self = this;
      var el = document.getElementById('ct-payload');
      var raw = el ? el.value.trim() : '';
      if (!raw) { this.toast('请先粘贴事件报文'); return; }
      var obj;
      try { obj = JSON.parse(raw); } catch (e) { this.toast('报文不是合法 JSON'); return; }
      this.api(EP.CLASSROOM_ADMIN_CONTRACT_REPLAY, 'post', obj)
        .then(function (d) {
          self.toast('已重放：' + (d && d.eventId ? d.eventId : ''));
          self.loadContract();
        })
        .catch(function (e) { self.toast('重放失败：' + ((e && e.message) || '')); });
    },

    _resync: function () {
      var self = this;
      var el = document.getElementById('ct-ids');
      var ids = (el ? el.value : '').split('\n')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return !!s; });
      if (!ids.length) { this.toast('请先填写 scheduleId'); return; }
      this.api(EP.CLASSROOM_ADMIN_CONTRACT_RESYNC, 'post', { scheduleIds: ids })
        .then(function (rows) {
          var html = (rows || []).map(function (r) {
            return '<tr>' +
              '<td>' + self.esc(r.scheduleId) + '</td>' +
              '<td>' + (r.exists ? '<span class="tag ok">存在</span>' : '<span class="tag err">缺失</span>') + '</td>' +
              '<td>' + self.esc(r.status || '-') + '</td>' +
              '<td>' + (r.version == null ? '-' : r.version) + '</td>' +
              '<td>' + (r.consumptionVersion == null ? '-' : r.consumptionVersion) + '</td>' +
              '<td>' + self.fmtTime(r.actualEnd) + '</td>' +
              '</tr>';
          });
          self.table('ct-resync-table', ['课次', '课堂侧', '状态', '版本', '消耗版本', '实际下课'], html);
        })
        .catch(function (e) { self.toast((e && e.message) || '对表失败'); });
    }
  };

  window.ClassroomOps = Ops;
  document.addEventListener('DOMContentLoaded', function () { Ops.run(); });
})();
