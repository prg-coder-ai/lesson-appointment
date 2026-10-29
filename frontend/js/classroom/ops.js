/**
 * ops.js —— 课堂运营台（F8-01 监控 / F7-04 学情 / F7-05 对账 / F8-03 审核 / F8-05 联调）
 *
 * 一个页面五个 tab，全部走同一套 {code,data,message} 契约。
 * 权限口径由后端定（仅管理员），前端只做展示——不拿前端判断当权限。
 */
(function () {
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
      this.load('monitor');
    },

    // ---------------- 基础设施 ----------------
    api: function (path, method, data) {
      return window.request({ url: this.base + path, method: method || 'get', data: data });
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
      try {
        var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
        var el = document.getElementById('ops-user');
        if (el && u) el.textContent = (u.name || u.account || u.userId || '') + ' · ' + (u.role || '');
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
        self.api('/api/v1/admin/reconcile/run', 'post')
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
        self.api('/api/v1/admin/audit/chat/' + encodeURIComponent(sid) + '/view', 'post', { note: '运营台查阅' })
          .then(function () { self.toast('已留痕'); self.loadAuditLogs(); })
          .catch(function (e) { self.toast((e && e.message) || '留痕失败'); });
      });
      on('ct-query', function () { self.loadContract(); });
      on('ct-replay', function () { self._replay(); });
      on('ct-resync', function () { self._resync(); });
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

    // ---------------- 监控 ----------------
    loadMonitor: function () {
      var self = this;
      this.api('/api/v1/admin/monitor/overview')
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

          var rows = (d.activeClasses || []).map(function (c) {
            var tag = c.status === 'LIVE' ? '<span class="tag ok">LIVE</span>'
              : '<span class="tag mute">' + self.esc(c.status) + '</span>';
            var ratio = c.memberCount ? (c.onlineCount + '/' + c.memberCount) : (c.onlineCount + '/-');
            return '<tr>' +
              '<td>' + self.esc(c.courseName || '-') + '</td>' +
              '<td>' + self.esc(c.teacherName || c.teacherId || '-') + '</td>' +
              '<td>' + self.fmtTime(c.startTime) + '</td>' +
              '<td>' + tag + '</td>' +
              '<td>' + ratio + '</td>' +
              '</tr>';
          });
          self.table('monitor-table', ['课程', '教师', '开始时间', '状态', '在线/成员'], rows);
        })
        .catch(function (e) { self.toast((e && e.message) || '监控加载失败'); });

      this.api('/api/v1/admin/monitor/alerts')
        .then(function (d) {
          var el = document.getElementById('monitor-alerts');
          if (!el) return;
          var html = '';
          if (d.staleLiveCount > 0) {
            html += '<div style="margin-bottom:8px;color:#b42318;font-weight:600">卡在 LIVE 未下课的课堂 '
              + d.staleLiveCount + ' 节</div><ul style="margin:0 0 12px 18px;padding:0">';
            (d.staleLive || []).forEach(function (c) {
              html += '<li>' + self.esc(c.courseName || c.scheduleId) + '（' + self.esc(c.scheduleId) +
                '）计划结束 ' + self.fmtTime(c.endTime) + '</li>';
            });
            html += '</ul>';
          }
          if (d.openDiffCount > 0) {
            html += '<div style="color:#b54708;font-weight:600">未处置对账差异 ' + d.openDiffCount + ' 条</div>';
            html += '<ul style="margin:6px 0 0 18px;padding:0">';
            (d.diffs || []).slice(0, 8).forEach(function (x) {
              html += '<li>' + self.esc(x.diffType) + ' · ' + self.esc(x.scheduleId) +
                ' · ' + self.esc(x.detail || '') + '</li>';
            });
            html += '</ul>';
          }
          if (!html) html = '<div class="muted">当前无告警</div>';
          el.innerHTML = html;
        })
        .catch(function () { /* 告警失败不打扰 */ });

      this.api('/api/v1/admin/monitor/metrics')
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
      this.api('/api/v1/admin/reports/learning', 'get', { from: from, to: to })
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
          var rows = (d.byClass || []).map(function (c) {
            var rate = c.total ? (c.present / c.total) : 0;
            return '<tr>' +
              '<td>' + self.esc(c.courseName || '-') + '</td>' +
              '<td>' + self.esc(c.teacherName || '-') + '</td>' +
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

          var srows = (d.byStudent || []).map(function (x) {
            return '<tr>' +
              '<td>' + self.esc(x.userId) + '</td>' +
              '<td>' + (x.total || 0) + '</td>' +
              '<td>' + (x.present || 0) + '</td>' +
              '<td>' + (x.absent || 0) + '</td>' +
              '<td>' + (x.late || 0) + '</td>' +
              '<td>' + self.pct(x.attendanceRate) + '</td>' +
              '<td>' + (x.avgMinutes == null ? '-' : x.avgMinutes) + '</td>' +
              '</tr>';
          });
          self.table('rep-student-table', ['学员ID', '应到', '实到', '缺勤', '迟到', '出勤率', '平均时长'], srows);
        })
        .catch(function (e) { self.toast((e && e.message) || '报表加载失败'); });
    },

    /** 导出：必须带 Authorization，所以用 fetch 取 blob 再触发下载（不能直接 window.open） */
    _export: function (type) {
      var self = this;
      var from = (document.getElementById('rep-from') || {}).value;
      var to = (document.getElementById('rep-to') || {}).value;
      var url = this.base + '/api/v1/admin/exports/' + type +
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
      this.api('/api/v1/admin/reconcile/diffs', 'get', { status: status, days: days })
        .then(function (rows) {
          var html = (rows || []).map(function (d) {
            var sev = d.severity === 'ERROR' ? '<span class="tag err">ERROR</span>'
              : '<span class="tag warn">WARN</span>';
            var st = d.status === 'OPEN' ? '<span class="tag warn">未处置</span>'
              : (d.status === 'IGNORED' ? '<span class="tag mute">已忽略</span>' : '<span class="tag ok">已处置</span>');
            var ops = d.status === 'OPEN'
              ? '<button class="btn small" data-resolve="' + d.diffId + '" data-ignore="0">处置</button> ' +
                '<button class="btn small danger" data-resolve="' + d.diffId + '" data-ignore="1">忽略</button>'
              : (d.resolveNote ? self.esc(d.resolveNote) : '');
            return '<tr>' +
              '<td>' + self.esc(d.scheduleId) + '</td>' +
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
              self.api('/api/v1/admin/reconcile/diffs/' + id + '/resolve', 'post',
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
      this.api('/api/v1/admin/audit/submissions', 'get',
        { scheduleId: scheduleId, status: status, limit: 50 })
        .then(function (rows) {
          var html = (rows || []).map(function (r) {
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
            return '<tr>' +
              '<td>' + self.esc(r.scheduleId) + '</td>' +
              '<td>' + self.esc(r.userId) + '</td>' +
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
              self.api('/api/v1/admin/audit/submissions/' + btn.getAttribute('data-flag') + '/flag',
                'post', { note: note })
                .then(function () { self.toast('已标记'); self.loadAudit(); self.loadAuditLogs(); })
                .catch(function (e) { self.toast((e && e.message) || '操作失败'); });
            });
          });
          Array.prototype.forEach.call(document.querySelectorAll('#au-table [data-pass]'), function (btn) {
            btn.addEventListener('click', function () {
              self.api('/api/v1/admin/audit/submissions/' + btn.getAttribute('data-pass') + '/pass',
                'post', { note: '运营抽查通过' })
                .then(function () { self.toast('已通过'); self.loadAuditLogs(); })
                .catch(function (e) { self.toast((e && e.message) || '操作失败'); });
            });
          });
        })
        .catch(function (e) { self.toast((e && e.message) || '抽查失败'); });
    },

    loadAuditLogs: function () {
      var self = this;
      this.api('/api/v1/admin/audit/logs', 'get', { days: 7 })
        .then(function (rows) {
          var html = (rows || []).map(function (l) {
            return '<tr>' +
              '<td>' + self.fmtTime(l.createdAt) + '</td>' +
              '<td>' + self.esc(l.operatorId) + '</td>' +
              '<td>' + self.esc(l.targetType) + '</td>' +
              '<td>' + self.esc(l.targetId || '-') + '</td>' +
              '<td>' + self.esc(l.scheduleId || '-') + '</td>' +
              '<td>' + self.esc(l.action) + '</td>' +
              '<td>' + self.esc(l.note || '') + '</td>' +
              '</tr>';
          });
          self.table('au-log-table', ['时间', '操作人', '对象类型', '对象', '课次', '动作', '备注'], html);
        })
        .catch(function () { /* 留痕失败不打扰主流程 */ });
    },

    // ---------------- 联调 ----------------
    loadContract: function () {
      var self = this;
      var scheduleId = (document.getElementById('ct-schedule') || {}).value || '';
      var result = (document.getElementById('ct-result') || {}).value || '';
      var days = (document.getElementById('ct-days') || {}).value || 7;
      this.api('/api/v1/admin/contract/events', 'get',
        { scheduleId: scheduleId, result: result, days: days })
        .then(function (rows) {
          var html = (rows || []).map(function (r) {
            var tag = r.result === 'SUCCESS' ? '<span class="tag ok">SUCCESS</span>'
              : (r.result === 'FAILED' ? '<span class="tag err">FAILED</span>' : '<span class="tag mute">SKIPPED</span>');
            return '<tr>' +
              '<td>' + self.fmtTime(r.receivedAt) + '</td>' +
              '<td>' + self.esc(r.eventId) + '</td>' +
              '<td>' + self.esc(r.eventType) + '</td>' +
              '<td>' + self.esc(r.scheduleId) + '</td>' +
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
      this.api('/api/v1/admin/contract/replay', 'post', obj)
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
      this.api('/api/v1/admin/contract/resync', 'post', { scheduleIds: ids })
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
