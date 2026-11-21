/**
 * classroom-admin.js —— 管理员专属功能
 * 巡课监控浮层、强制结束课堂。
 * 后端接口：/admin/classrooms/monitor、/admin/classrooms/{sid}/end（AdminConsoleController）。
 */
(function () {
  var ClassroomAdmin = {
    ctx: null,
    panel: null,
    monitorOn: false,

    init: function (ctx) {
      this.ctx = ctx || {};
      return this;
    },

    toggleMonitor: function () {
      this.monitorOn = !this.monitorOn;
      if (!this.panel) this._createPanel();
      if (this.panel) this.panel.classList.toggle('hidden', !this.monitorOn);
      if (this.monitorOn) this.refresh();
      return this.monitorOn;
    },

    _createPanel: function () {
      var area = document.getElementById('video-whiteboard-area');
      if (!area) return;
      var panel = document.createElement('div');
      panel.id = 'admin-monitor-panel';
      panel.innerHTML = '<div class="amp-title"><i class="fas fa-eye"></i> 巡课监控</div><div id="amp-body">加载中...</div>';
      area.appendChild(panel);
      this.panel = panel;
    },

    refresh: function () {
      var body = document.getElementById('amp-body');
      if (!body) return;
      var CAPI = window.ClassroomAPI;
      if (!CAPI || typeof CAPI.monitorClassrooms !== 'function') {
        body.innerHTML = '<div class="amp-row">接口未就绪</div>';
        return;
      }
      var self = this;
      CAPI.monitorClassrooms(this.ctx.apiBaseUrl, '')
        .then(function (list) {
          var rows = Array.isArray(list) ? list : (list && list.rows ? list.rows : []);
          if (!rows.length) { body.innerHTML = '<div class="amp-row">暂无进行中的课堂</div>'; return; }
          body.innerHTML = rows.map(function (c) {
            return '<div class="amp-row">' +
              '<div>' + self._escape(c.courseName || c.scheduleId || '') + '</div>' +
              '<div style="color:#8b949e;">' + self._escape(c.teacherName || '') + ' / ' + self._escape(c.status || '') + '</div>' +
              (c.scheduleId ? '<button class="cl-btn" style="margin-top:4px;" onclick="ClassroomAdmin.forceEnd(\'' + self._escape(c.scheduleId) + '\')">强制结束</button>' : '') +
              '</div>';
          }).join('');
        })
        .catch(function (e) {
          console.warn('[Admin] monitor failed', e);
          body.innerHTML = '<div class="amp-row">加载失败</div>';
        });
    },

    forceEnd: function (scheduleId) {
      if (!scheduleId) return;
      if (this.ctx.role !== 'admin') { this.toast('仅管理员可强制结束'); return; }
      var CAPI = window.ClassroomAPI;
      if (!CAPI || typeof CAPI.remoteEndClass !== 'function') { this.toast('接口未就绪'); return; }
      CAPI.remoteEndClass(this.ctx.apiBaseUrl, scheduleId)
        .then(function () { this.toast('已强制结束'); this.refresh(); }.bind(this))
        .catch(function (e) { console.warn('[Admin] forceEnd failed', e); this.toast('强制结束失败'); }.bind(this));
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Admin]', msg);
    }
  };

  window.ClassroomAdmin = ClassroomAdmin;
})();