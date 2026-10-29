/**
 * replay.js —— 课堂回放页（F6-03 / F6-04）
 *
 * 数据来源：GET /api/v1/recordings/{scheduleId}（含签名 url 字段）。
 * 播放直接用签名 URL —— 服务端已实现 Range 206，所以拖动进度条与倍速都是原生能力，
 * 不需要额外做流式切片。
 *
 * 权限：接口内部有 ClassroomAccessGuard（仅本课堂成员/授权运营），
 * 越权访问会返回 40402/40301，这里如实提示，不做兜底猜测。
 */
(function () {
  var Replay = {
    apiBaseUrl: '',
    scheduleId: '',
    rows: [],

    run: function () {
      this.apiBaseUrl = (typeof window.getClassroomApiBaseUrl === 'function')
        ? window.getClassroomApiBaseUrl() : '';
      var token = localStorage.getItem('token');
      if (!token) {
        this._empty('请先登录后再查看回放');
        return;
      }
      this._renderUser();
      this._bind();

      var sid = this._param('scheduleId');
      var input = document.getElementById('rp-schedule');
      if (sid && input) {
        input.value = sid;
        this.load(sid);
      }
    },

    _bind: function () {
      var self = this;
      var btn = document.getElementById('rp-load');
      var input = document.getElementById('rp-schedule');
      if (btn) btn.addEventListener('click', function () {
        var sid = input ? input.value.trim() : '';
        if (!sid) { self._empty('请输入课次 ID'); return; }
        self.load(sid);
      });
      if (input) input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && btn) btn.click();
      });
    },

    load: function (scheduleId) {
      var self = this;
      this.scheduleId = scheduleId;
      var list = document.getElementById('rp-list');
      var listEmpty = document.getElementById('rp-list-empty');
      if (listEmpty) listEmpty.style.display = 'none';
      if (list) list.innerHTML = '<div class="rp-item">加载中…</div>';

      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getRecordings !== 'function') {
        this._empty('回放接口未就绪');
        return;
      }
      window.ClassroomAPI.getRecordings(this.apiBaseUrl, scheduleId)
        .then(function (rows) {
          self.rows = rows || [];
          self._renderList();
        })
        .catch(function (e) {
          var msg = (e && e.message) || '查询失败';
          if (list) list.innerHTML = '';
          self._empty(msg + '（若确认是本课堂成员，请检查登录是否过期）');
        });
    },

    _renderList: function () {
      var list = document.getElementById('rp-list');
      if (!list) return;
      if (!this.rows.length) {
        list.innerHTML = '';
        this._empty('该课堂暂无录制记录');
        return;
      }
      var self = this;
      list.innerHTML = this.rows.map(function (r, idx) {
        var badge = self._badge(r.status);
        var duration = self._duration(r.startTime, r.endTime);
        var start = self._fmt(r.startTime);
        return '<div class="rp-item" data-idx="' + idx + '">' +
          '<div class="rp-time">' + start + badge + '</div>' +
          '<div class="rp-meta">' + (duration ? '时长 ' + duration : '时长未知') +
          ' · ' + self._statusText(r.status) + '</div>' +
          '</div>';
      }).join('');

      Array.prototype.forEach.call(list.querySelectorAll('.rp-item'), function (el) {
        el.addEventListener('click', function () {
          Array.prototype.forEach.call(list.querySelectorAll('.rp-item'), function (x) {
            x.classList.remove('active');
          });
          el.classList.add('active');
          self._play(self.rows[Number(el.getAttribute('data-idx'))]);
        });
      });
    },

    _play: function (r) {
      var video = document.getElementById('rp-video');
      var empty = document.getElementById('rp-empty');
      if (!video) return;
      if (!r || !r.url) {
        this._empty(r && r.status === 'RECORDING'
          ? '该录制仍在进行中，结束后才能观看'
          : '录制文件不可用（可能已过期或上传未完成）');
        return;
      }
      if (empty) empty.style.display = 'none';
      video.style.display = '';
      video.src = r.url;
      video.play().catch(function () { /* 自动播放被拦截时用户手动点播放即可 */ });
    },

    _badge: function (status) {
      var cls = String(status || '').toLowerCase();
      return '<span class="rp-badge ' + cls + '">' + this._statusText(status) + '</span>';
    },

    _statusText: function (status) {
      if (status === 'READY') return '可回放';
      if (status === 'RECORDING') return '录制中';
      if (status === 'FAILED') return '录制失败';
      return status || '未知';
    },

    _duration: function (start, end) {
      if (!start || !end) return '';
      var s = new Date(start).getTime();
      var e = new Date(end).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) return '';
      var sec = Math.round((e - s) / 1000);
      var m = Math.floor(sec / 60), rest = sec % 60;
      var h = Math.floor(m / 60);
      m = m % 60;
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(rest);
    },

    _fmt: function (iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    _empty: function (msg) {
      var video = document.getElementById('rp-video');
      var empty = document.getElementById('rp-empty');
      if (video) { video.style.display = 'none'; video.removeAttribute('src'); }
      if (empty) {
        empty.style.display = '';
        empty.innerHTML = msg;
      }
    },

    _renderUser: function () {
      try {
        var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
        var el = document.getElementById('rp-user');
        if (el && u) el.textContent = (u.name || u.account || u.userId || '') + ' · ' + (u.role || '');
      } catch (e) { /* 展示失败无所谓 */ }
    },

    _param: function (name) {
      try {
        var v = new URLSearchParams(window.location.search).get(name);
        return v && v.trim() ? v.trim() : '';
      } catch (e) { return ''; }
    }
  };

  window.ClassroomReplay = Replay;
  document.addEventListener('DOMContentLoaded', function () { Replay.run(); });
})();
