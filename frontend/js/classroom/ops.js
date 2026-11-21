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
      this._initPickers();
      this._defaultDates();
      this._defaultTempTime();
      this.load('monitor');
    },

    // ---------------- 候选数据源（可搜索选择器，2026-11-19） ----------------
    /*
     * 三处原来是「手抄 userId」：临时建课的教师、建课/加学员的学生、发通知的课堂号。
     * 现在都改成从下拉里点选，但候选从哪来必须说清楚：
     *
     *   · 教师/学生 → 主服务 GET /api/v1/user/page?role=teacher|student（管理面端点，
     *     AuthzRules 只给平台/租户管理员）。注意 **不能**用 /user/teacher/list：
     *     那个返回值没有分页、也没有关键字过滤，平台管理员跨租户时会一次拉全平台。
     *     这里按 role 拉第一页 500 条做本地过滤——单租户的师生数量级远小于 500，
     *     平台态超了就在下拉底部提示「仅显示前 N 人」，避免让人以为查不到就是没有。
     *   · 课堂 → 课堂服务 /api/v1/admin/classrooms/monitor?status=X，**必须逐状态查**
     *     （不传 status 时后端默认 LIVE，拿不到待开课的那些）。合并 SCHEDULED/READY/
     *     LIVE/PAUSED 四态；不含 CLOSED——已结束的课堂发上课通知没有意义。
     *     ⚠️ 候选来自 classroom 表而不是 course_schedule：临时建课没有排期，
     *     按排期查就正好漏掉最需要发通知的那批。
     */

    /** role='teacher'|'student' 的候选缓存 {list:[{value,label,sub}], total} */
    _userCache: {},
    _userPromise: {},

    _userStatusText: function (st) {
      var map = { active: '正常', pending: '待审批', frozen: '已冻结', inactive: '未激活', rejected: '已拒绝' };
      return map[String(st || '')] || (st || '');
    },

    _loadUserCandidates: function (role) {
      var self = this;
      if (this._userCache[role]) return Promise.resolve(this._userCache[role]);
      if (this._userPromise[role]) return this._userPromise[role];

      var p = window.request({
        url: EP.USER_PAGE,
        method: 'get',
        params: { role: role, pageNum: 1, pageSize: 500 },
        customLoading: false,
        customErrorMsg: false
      }).then(function (page) {
        var rows = (page && (page.rows || page.records)) || [];
        var list = [];
        rows.forEach(function (u) {
          if (!u || !u.userId) return;
          var nm = u.name || '';
          var acc = u.account || '';
          // 姓名可能还没解密出（老数据）→ 退回账号；两者都没有才显示 id
          var label = nm || acc || u.userId;
          var bits = [];
          if (acc && acc !== label) bits.push(acc);
          bits.push(self._userStatusText(u.status));
          list.push({ value: u.userId, label: label, sub: bits.filter(Boolean).join(' · ') });
        });
        self._userCache[role] = { list: list, total: (page && page.total) || list.length };
        return self._userCache[role];
      }).catch(function () {
        // 查不到不让页面卡住：给空列表 + 明确文案，用户能判断是「没匹配」还是「没权限」
        self._userCache[role] = { list: [], total: 0, failed: true };
        return self._userCache[role];
      }).then(function (v) {
        delete self._userPromise[role];
        return v;
      });
      this._userPromise[role] = p;
      return p;
    },

    /** 本地过滤：姓名 / 账号 / userId 三处命中任意一处即可 */
    _userOptions: function (role, keyword) {
      var kw = String(keyword || '').trim().toLowerCase();
      return this._loadUserCandidates(role).then(function (cache) {
        var list = (cache && cache.list) || [];
        if (kw) {
          list = list.filter(function (o) {
            return String(o.label).toLowerCase().indexOf(kw) >= 0
              || String(o.sub || '').toLowerCase().indexOf(kw) >= 0
              || String(o.value).toLowerCase().indexOf(kw) >= 0;
          });
        }
        return list;
      });
    },

    /** 课堂候选缓存：[{value(=scheduleId), label(课程名), sub(时间·状态)}] */
    _classroomCache: null,
    /**
     * 含「已结束」的课堂候选缓存。
     *
     * <p>补发课时回流恰恰要选 **CLOSED** 的课堂，而发通知/加学员那两份候选刻意不含已结束的
     * （给结束了的课发通知没有意义）。两份缓存分开，避免一边为了另一边放开 CLOSED。
     */
    _classroomClosedCache: null,

    _loadClassrooms: function (withClosed) {
      var self = this;
      var cache = withClosed ? this._classroomClosedCache : this._classroomCache;
      if (cache) return Promise.resolve(cache);
      var statuses = ['LIVE', 'SCHEDULED', 'READY', 'PAUSED'];
      if (withClosed) statuses.push('CLOSED');
      var reqs = statuses.map(function (st) {
        // 绕开 this.api()：它默认带全局 loading，并发会闪多次；候选加载不该打断操作
        return window.request({
          url: urlOf(self.base, EP.CLASSROOM_ADMIN_CLASSROOMS + '?status=' + encodeURIComponent(st)),
          method: 'get',
          customLoading: false,
          customErrorMsg: false
        }).catch(function () { return []; });
      });
      return Promise.all(reqs).then(function (groups) {
        var seen = {};
        var list = [];
        groups.forEach(function (rows) {
          (rows || []).forEach(function (c) {
            if (!c || !c.scheduleId || seen[c.scheduleId]) return;
            seen[c.scheduleId] = 1;
            var name = c.courseName || '（未命名课堂）';
            var bits = [];
            if (c.startTime) bits.push(self.fmtTime(c.startTime));
            bits.push(c.status || '');
            bits.push(self.shortId(c.scheduleId));
            list.push({ value: c.scheduleId, label: name, sub: bits.filter(Boolean).join(' · '), status: c.status || '' });
          });
        });
        // 进行中的排最前，其余按状态优先级（最近建的课堂在上，应急时最好找）；已结束的垫底
        var rank = { LIVE: 0, PAUSED: 1, READY: 2, SCHEDULED: 3, CLOSED: 4 };
        list.sort(function (a, b) {
          var ra = rank[a.status] === undefined ? 9 : rank[a.status];
          var rb = rank[b.status] === undefined ? 9 : rank[b.status];
          return ra - rb;
        });
        if (withClosed) {
          self._classroomClosedCache = list;
        } else {
          self._classroomCache = list;
        }
        return list;
      });
    },

    _classroomOptions: function (keyword, withClosed) {
      var kw = String(keyword || '').trim().toLowerCase();
      return this._loadClassrooms(!!withClosed).then(function (list) {
        if (!kw) return list;
        return list.filter(function (o) {
          return String(o.label).toLowerCase().indexOf(kw) >= 0
            || String(o.sub || '').toLowerCase().indexOf(kw) >= 0
            || String(o.value).toLowerCase().indexOf(kw) >= 0;
        });
      });
    },

    /** 创建四个选择器实例（DOM 已就绪）。缺 picker.js 时降级：不抛错，按钮点了会提示重选 */
    _initPickers: function () {
      var self = this;
      this.pickers = {};
      if (!window.ClassroomPicker) {
        console.error('[ops] picker.js 未加载，教师/学生/课堂将无法选择');
        return;
      }
      var make = function (id, cfg) {
        var el = document.getElementById(id);
        if (!el) return null;
        try { return window.ClassroomPicker.create(el, cfg); } catch (e) { console.error(e); return null; }
      };

      this.pickers.tmpTeacher = make('tmp-teacher-pick', {
        placeholder: '搜索教师姓名或账号',
        emptyText: '没有匹配的教师（候选只含 teacher 角色）',
        fetch: function (kw) { return self._userOptions('teacher', kw); }
      });
      this.pickers.tmpStudents = make('tmp-students-pick', {
        multiple: true,
        placeholder: '搜索学生姓名或账号，可多选',
        emptyText: '没有匹配的学生（候选只含 student 角色）',
        fetch: function (kw) { return self._userOptions('student', kw); }
      });
      this.pickers.memStudents = make('mem-students-pick', {
        multiple: true,
        placeholder: '搜索学生姓名或账号，可多选',
        emptyText: '没有匹配的学生（候选只含 student 角色）',
        fetch: function (kw) { return self._userOptions('student', kw); }
      });
      this.pickers.noticeClassroom = make('ntc-schedule-pick', {
        placeholder: '搜索课程名或课堂号',
        emptyText: '没有匹配的课堂（含临时建课；已结束的课堂不在此列）',
        fetch: function (kw) { return self._classroomOptions(kw); }
      });
      this.pickers.resendClassroom = make('rcs-schedule-pick', {
        placeholder: '搜索课程名或课堂号（含已结束）',
        emptyText: '没有匹配的课堂（补发只针对已结束的课堂）',
        fetch: function (kw) { return self._classroomOptions(kw, true); }
      });
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
      on('ct-resend', function () { self._resendConsumption(); });
      // 应急建课 / 加学员（B1/B2，2026-11-19）
      on('tmp-create', function () { self._createTemp(); });
      on('mem-add', function () { self._addMembers(); });
      // 发上课通知（C4，2026-11-19）
      on('ntc-send', function () { self._sendNotice(); });
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

    /**
     * 分钟数 → 「2 小时 15 分」。
     * 告警里要说明「超期多久」：只给一个绝对时间点（计划结束 18:00），管理员还得自己算；
     * 早上开班时看到「已超期 14 小时」和「已超期 5 分钟」的处置优先级完全不同。
     */
    fmtSpan: function (minutes) {
      var m = Math.max(0, Math.floor(Number(minutes) || 0));
      if (m < 60) return m + ' 分钟';
      var h = Math.floor(m / 60);
      var rest = m % 60;
      if (h < 24) return h + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
      return Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 小时';
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

    _createTemp: function () {
      var self = this;
      // 教师/学生改为从下拉选（2026-11-19）：手抄 userId 错一位，教师就进不去自己的课堂
      var pk = this.pickers || {};
      var teacherId = pk.tmpTeacher ? pk.tmpTeacher.getValue() : '';
      if (!teacherId) { self.toast('请从下拉列表选择教师'); return; }
      var teacherName = (pk.tmpTeacher.getLabel && pk.tmpTeacher.getLabel()) || teacherId;
      var name = ((document.getElementById('tmp-name') || {}).value || '').trim();
      var startVal = ((document.getElementById('tmp-start') || {}).value || '').trim();
      var endVal = ((document.getElementById('tmp-end') || {}).value || '').trim();
      var duration = Number((document.getElementById('tmp-duration') || {}).value || 60) || 60;
      // 学生的 name 一并带上：课堂「参与者」面板显示的是 membership.display_name，
      // 只传 id 的话名单里全是短码，教师点名时分不清谁是谁
      var students = (pk.tmpStudents ? pk.tmpStudents.getItems() : []).map(function (it) {
        return { userId: it.value, name: it.label || it.value };
      });

      var body = {
        courseName: name || '临时课堂',
        teacherId: teacherId,
        teacherName: teacherName,
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
          // 课堂候选缓存作废：刚建的这节课必须立刻能在「发上课通知」里选到
          self._classroomCache = null;
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
        // 建完课最常见的下一步就是「把链接发给学生」，这里直接把人送到发通知面板，省一次翻找
        + '<div style="margin-top:8px">'
        + '<button class="btn small" data-tmp-notice="' + this.esc(sid) + '" '
        + 'data-tmp-label="' + this.esc(d.courseName || '') + '">给这堂课发上课通知</button></div>'
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
      Array.prototype.forEach.call(el.querySelectorAll('[data-tmp-notice]'), function (btn) {
        btn.addEventListener('click', function () {
          self._fillNoticeForm(btn.getAttribute('data-tmp-notice'), btn.getAttribute('data-tmp-label'));
        });
      });
    },

    _addMembers: function () {
      var self = this;
      var sid = ((document.getElementById('mem-schedule') || {}).value || '').trim();
      if (!sid) { self.toast('请填写课堂号'); return; }
      var pk = this.pickers || {};
      var items = pk.memStudents ? pk.memStudents.getItems() : [];
      if (!items.length) { self.toast('请从下拉列表选择学生'); return; }
      var note = ((document.getElementById('mem-note') || {}).value || '').trim();
      var students = items.map(function (it) { return { userId: it.value, name: it.label || it.value }; });
      self.api(EP.CLASSROOM_ADMIN_ADD_MEMBERS(sid), 'post', { students: students, note: note })
        .then(function (d) {
          var msg = '已加入 ' + ((d && d.addedCount) || 0) + ' 人';
          if (d && d.skippedCount) msg += '，跳过 ' + d.skippedCount + ' 人（已在课堂）';
          self.toast(msg);
          if (pk.memStudents) pk.memStudents.clear();
          self.loadMonitor();
        })
        .catch(function (e) { self.toast((e && e.message) || '加入失败'); });
    },

    /** 点表格里的「加学员」：把课堂号填进表单并把焦点送到学生选择器 */
    _fillMemberForm: function (scheduleId) {
      var input = document.getElementById('mem-schedule');
      if (!input) return;
      input.value = scheduleId || '';
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var pickEl = document.querySelector('#mem-students-pick .pk-input');
      if (pickEl) setTimeout(function () { pickEl.focus(); }, 200);
      this.toast('已填入课堂号，从下拉选学生后点「加入」');
    },

    /**
     * 强制结束课堂（活跃课堂行的「结束」、告警区的「强制下课」共用）。
     *
     * 语义要先说清，免得管理员以为这是"作废"：服务端走 ClassroomService.endClass ——
     * 状态置 **CLOSED（正常结束）**、actualEnd 记当前时刻，随后 closeAfterEnd 归一出勤、
     * 回流课时、释放媒体房间与内存态。"强制"只表示不必等教师点下课，结算口径与正常下课一致。
     */
    _endClassroom: function (scheduleId) {
      if (!scheduleId) { this.toast('缺少课堂号'); return; }
      if (!window.confirm('确定结束课堂 ' + this.shortId(scheduleId) + ' 吗？\n'
        + '状态将置为 CLOSED（正常结束，不是作废）：出勤按已有记录归一、课时照常结算，结束后不可重开。')) return;
      var self = this;
      self.api(EP.CLASSROOM_ADMIN_END(scheduleId), 'post')
        .then(function () {
          self.toast('已结束课堂（CLOSED）');
          // 状态变了，发通知的课堂候选缓存作废
          self._classroomCache = null;
          self.loadMonitor();
        })
        .catch(function (e) {
          // 40901 = 当前状态不可下课（已 CLOSED，或还没开课）：
          // 这不是失败，多半是别人刚结束过 —— 刷新一次让列表与告警对齐就行
          if (e && e.code === 40901) {
            self.toast('这堂课已不在进行中（可能已被结束），列表已刷新');
            self.loadMonitor();
            return;
          }
          self.toast((e && e.message) || '结束失败');
        });
    },

    // ---------------- 上课通知（C4，2026-11-19） ----------------
    /*
     * 为什么需要它：应急建的临时课堂不进学生「我的课堂」（列表是排期驱动的），
     * 学生手上没有任何入口，管理员只能一对一贴链接。这里把「名单 → 群发站内信 → 消息里一键进课堂」
     * 串起来，一次点完。
     *
     * 名单从课堂服务取（GET /classrooms/{sid}/members，管理员放行），只挑 role=student 且未 kicked 的人。
     * 消息走主服务的 /api/v1/messages/send（网关按前缀分流到 message-service:8090），
     * payload.url 由收件箱渲染成「进入课堂」按钮 —— 纯正文里的链接是被转义的，点了没用。
     */

    /** 点表格里的「发通知」/ 建课结果区的按钮：把课堂回填进选择器（label 优先用课程名） */
    _fillNoticeForm: function (scheduleId, label) {
      var pk = this.pickers && this.pickers.noticeClassroom;
      if (!pk) { this.toast('发通知选择器未就绪，请刷新页面'); return; }
      var text = label || this.shortId(scheduleId);
      if (!label) {
        var cache = this._classroomCache || [];
        for (var i = 0; i < cache.length; i++) {
          if (cache[i].value === scheduleId) { text = cache[i].label; break; }
        }
      }
      pk.setValue(scheduleId, text);
      var box = document.getElementById('ntc-result');
      if (box) box.innerHTML = '';
      var el = document.getElementById('ntc-schedule-pick');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.toast('已选中「' + text + '」，点「发送通知」即可');
    },

    /** 取课堂信息 + 学生名单（两个接口都过 ClassroomAccessGuard，管理员可读） */
    _noticeTargets: function (scheduleId) {
      var api = window.ClassroomAPI;
      var base = this.base;
      if (!api || typeof api.getClassroomStatus !== 'function' || typeof api.getMembers !== 'function') {
        return Promise.reject({ message: '课堂接口未加载（js/public/api.js），请刷新页面' });
      }
      return Promise.all([
        api.getClassroomStatus(base, scheduleId),
        api.getMembers(base, scheduleId)
      ]).then(function (res) {
        var c = res[0] || {};
        var list = res[1] || [];
        var students = list.filter(function (m) {
          return m && m.userId && m.role === 'student' && !m.kicked;
        });
        return { classroom: c, students: students };
      });
    },

    _sendNotice: function () {
      var self = this;
      var pk = this.pickers || {};
      // 课堂号改成下拉选（2026-11-19）：候选是课堂实例（含临时建课），按课程名/时间挑
      var sid = pk.noticeClassroom ? pk.noticeClassroom.getValue() : '';
      if (!sid) { self.toast('请从下拉列表选择课堂'); return; }
      var btn = document.getElementById('ntc-send');
      var restore = function () { if (btn) { btn.disabled = false; btn.textContent = '发送通知'; } };
      if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
      var box = document.getElementById('ntc-result');

      self._noticeTargets(sid).then(function (info) {
        var students = info.students || [];
        if (!students.length) {
          // 空名单是最常见的一次性困惑：通知发出去了但没人收到，得先说清楚原因
          throw { message: '这间课堂的名单里还没有学生：先用上面的「给指定课堂加学员」把人加进来，再发通知' };
        }
        var c = info.classroom || {};
        var courseName = c.courseName || ('课堂 ' + self.shortId(sid));
        var whenText = c.startTime
          ? (self.fmtTime(c.startTime) + (c.endTime ? ' ~ ' + self.fmtTime(c.endTime) : ''))
          : '按老师通知的时间';
        var titleEl = document.getElementById('ntc-title');
        var contentEl = document.getElementById('ntc-content');
        var title = ((titleEl || {}).value || '').trim() || ('上课通知：' + courseName);
        var content = ((contentEl || {}).value || '').trim()
          || (courseName + ' 将于 ' + whenText + ' 开课。\n'
            + '课堂号：' + sid + '\n'
            + '进入方式：直接点本消息里的「进入课堂」按钮；也可以到「加入课堂」页粘贴课堂号。\n'
            + '请提前几分钟进入，确认麦克风与摄像头可用。');
        var withLink = !!(document.getElementById('ntc-with-link') || {}).checked;
        var high = !!(document.getElementById('ntc-high') || {}).checked;

        var body = {
          title: title,
          content: content,
          recipientUserIds: students.map(function (m) { return m.userId; }),
          // 上课通知是要马上看的，默认中优先级；管理员可显式提为 HIGH
          priority: high ? 'HIGH' : 'MEDIUM'
        };
        if (withLink) {
          body.payload = {
            type: 'classroom_join',
            scheduleId: sid,
            url: self._classroomLink(sid)
          };
        }
        // 平台管理员代别家租户发通知：不带 targetTenantId 会落成平台租户(0)，
        // 学生收件箱虽然按 userId 命中，但消息归属租户会错，后续按租户检索就丢这条。
        try {
          var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
          if (u && u.role === 'platform_admin' && c.tenantId) body.targetTenantId = c.tenantId;
        } catch (e) { /* 取不到就当普通租户 */ }

        if (!EP.MSG_SEND) throw { message: '缺少消息发送端点（shared/apiPaths.js 未同步）' };
        return window.request({ url: EP.MSG_SEND, method: 'post', data: body })
          .then(function (d) {
            self._renderNoticeResult(sid, students, d || {}, withLink);
            self.toast('已发送给 ' + students.length + ' 人');
          });
      }).catch(function (e) {
        var msg = (e && (e.message || e.bodyMsg)) || '发送失败';
        if (box) {
          box.innerHTML = '<div style="margin-top:10px;padding:8px 12px;border-radius:6px;'
            + 'background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;font-size:12.5px;">'
            + self.esc(msg) + '</div>';
        }
        self.toast(msg);
      }).then(restore);
    },

    _renderNoticeResult: function (sid, students, d, withLink) {
      var box = document.getElementById('ntc-result');
      if (!box) return;
      var link = this._classroomLink(sid);
      var names = students.map(function (m) {
        return m.displayName || m.userId;
      }).slice(0, 12).join('、') + (students.length > 12 ? ' 等 ' + students.length + ' 人' : '');
      box.innerHTML = '<div style="margin-top:10px;padding:10px 12px;background:#f6f8fa;'
        + 'border:1px solid #e5e7eb;border-radius:6px;font-size:13px;">'
        + '<div><b>已发送</b>：' + students.length + ' 人（messageId ' + this.esc(d.messageId || '-') + '）</div>'
        + '<div style="margin-top:4px;color:#6b7280;">收件人：' + this.esc(names) + '</div>'
        + '<div style="margin-top:6px;"><b>课堂链接</b>：'
        + '<input type="text" readonly value="' + this.esc(link) + '" style="width:66%"> '
        + '<button class="btn small" data-ntc-copy="' + this.esc(link) + '">复制</button></div>'
        + '<div class="muted" style="margin-top:6px;">'
        + (withLink
          ? '学生在「消息中心」打开这条通知，正文下方有「进入课堂」按钮，点一下即可（无需复制链接）。'
          : '本次未附带按钮：学生只能看到链接文本，需要自己复制到浏览器打开。')
        + '</div></div>';
      var self = this;
      Array.prototype.forEach.call(box.querySelectorAll('[data-ntc-copy]'), function (btn) {
        btn.addEventListener('click', function () {
          self._copyText(btn.getAttribute('data-ntc-copy'), '链接已复制');
        });
      });
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
                    + ' <button class="btn small" data-mem="' + sid + '">加学员</button>'
                    + ' <button class="btn small" data-notice="' + sid + '">发通知</button>';
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
              Array.prototype.forEach.call(document.querySelectorAll('#monitor-table [data-notice]'), function (btn) {
                btn.addEventListener('click', function () {
                  self._fillNoticeForm(btn.getAttribute('data-notice'));
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
            // 2026-11-19：这里补「强制下课」（需求）。告警原本只是"看一眼"，处置还得回上面的
            // 活跃课堂表里找同一节课——僵尸课往往已经不在 LIVE 列表的显眼位置。
            //
            // 走的是管理员结束端点 /admin/classrooms/{sid}/end → ClassroomService.endClass：
            // 状态置 **CLOSED（正常结束，不是作废）**，actualEnd 落当前时间，然后
            // closeAfterEnd 归一出勤、回流课时、释放媒体房间与内存态。也就是说「强制」
            // 只体现在"不用等教师点下课"，业务口径与正常下课完全一致，不会漏结算。
            (d.staleLive || []).forEach(function (c) {
              var over = '';
              if (c.endTime) {
                var mins = Math.floor((Date.now() - new Date(c.endTime).getTime()) / 60000);
                if (mins > 0) over = ' · <span style="color:#b42318">已超期 ' + self.fmtSpan(mins) + '</span>';
              }
              html += '<li style="margin:4px 0;">'
                + self.esc(c.courseName || self.classLabel(c.scheduleId))
                + ' 计划结束 ' + self.fmtTime(c.endTime) + over
                + ' <button class="btn small danger" type="button" data-alert-end="'
                + self.esc(c.scheduleId) + '">强制下课</button>'
                + '</li>';
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
          Array.prototype.forEach.call(el.querySelectorAll('[data-alert-end]'), function (btn) {
            btn.addEventListener('click', function () {
              self._endClassroom(btn.getAttribute('data-alert-end'));
            });
          });
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
            // denied = 课堂存在但属于别的租户（后端只回「不是你的」，不回状态与时间）
            var flag = r.denied
              ? '<span class="tag warn" title="该课次属于其他租户，平台管理员才可查看">非本租户</span>'
              : (r.exists ? '<span class="tag ok">存在</span>' : '<span class="tag err">缺失</span>');
            return '<tr>' +
              '<td>' + self.esc(r.scheduleId) + '</td>' +
              '<td>' + flag + '</td>' +
              '<td>' + self.esc(r.status || '-') + '</td>' +
              '<td>' + (r.version == null ? '-' : r.version) + '</td>' +
              '<td>' + (r.consumptionVersion == null ? '-' : r.consumptionVersion) + '</td>' +
              '<td>' + self.fmtTime(r.actualEnd) + '</td>' +
              '</tr>';
          });
          self.table('ct-resync-table', ['课次', '课堂侧', '状态', '版本', '消耗版本', '实际下课'], html);
        })
        .catch(function (e) { self.toast((e && e.message) || '对表失败'); });
    },

    /**
     * 补发课时回流（2026-11-19）——运营台里唯一会「动账」的按钮，所以先确认再发。
     *
     * <p>为什么必须选已结束的课堂：没下课就补发等于凭空造一份出勤账；
     * 后端也会挡（40901），这里提前拦是为了不让用户白点。
     */
    _resendConsumption: function () {
      var self = this;
      var pk = this.pickers && this.pickers.resendClassroom;
      var sid = pk ? pk.getValue() : '';
      if (!sid) { this.toast('请先选择课堂（只能选已结束的课堂）'); return; }
      if (!window.confirm('确定给「' + this.classLabel(sid) + '」补发课时回流吗？\n\n'
        + '· 只重发报文，不重算出勤（人工调整过的结论不受影响）\n'
        + '· 版本号会 +1，预约侧按版本覆盖，不会重复扣课时\n'
        + '· 未下课的课堂不允许补发')) return;
      var box = document.getElementById('ct-resend-result');
      if (box) box.innerHTML = '<div class="muted" style="margin-top:8px">补发中…</div>';
      this.api(EP.CLASSROOM_ADMIN_RESEND_CONSUMPTION(sid), 'post')
        .then(function (d) {
          var v = d && d.consumptionVersion;
          if (box) {
            box.innerHTML = '<div style="margin-top:8px" class="tag ok">已补发</div>'
              + '<div class="muted" style="margin-top:6px">' + self.esc(self.classLabel(sid))
              + ' · 消耗版本 → ' + self.esc(String(v == null ? '-' : v))
              + '（预约侧收到后按此版本覆盖旧报文）</div>';
          }
          self.toast('已补发回流 v' + v);
        })
        .catch(function (e) {
          var msg = (e && e.message) || '补发失败';
          // 40901 = 没下课 / 状态不对，指导用户先结束课堂，别让他反复重试同一个按钮
          if (box) {
            box.innerHTML = '<div style="margin-top:8px" class="tag err">补发失败</div>'
              + '<div class="muted" style="margin-top:6px">' + self.esc(msg) + '</div>';
          }
          self.toast(msg);
        });
    }
  };

  window.ClassroomOps = Ops;
  document.addEventListener('DOMContentLoaded', function () { Ops.run(); });
})();
