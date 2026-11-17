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
  // 回放偏好：进度按 recordingId 存，音量/倍速全局共享。localStorage 不可用时静默降级。
  var LS = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式/超额：不影响播放 */ }
    }
  };
  var PROGRESS_KEY = 'classroom.replay.progress.v1.';
  var VOLUME_KEY = 'classroom.replay.volume.v1';
  var RATE_KEY = 'classroom.replay.rate.v1';

  var Replay = {
    apiBaseUrl: '',
    scheduleId: '',
    rows: [],
    current: null,      // 当前播放的录制记录
    _seekReady: false,  // 本次播放是否已在 loadedmetadata 后处理过续播
    _courseName: '',    // 课程名（取自课堂状态接口，用于课次可读化）

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
      var manual = document.getElementById('rp-manual');
      if (sid) {
        // 已从课堂/我的课堂带参进来：界面只显示「课程名 · 第N课次」，不再露出课次编码
        if (manual) manual.classList.add('hidden');
        this.load(sid);
      }
    },

    _bind: function () {
      var self = this;
      var btn = document.getElementById('rp-load');
      var input = document.getElementById('rp-schedule');
      if (btn) btn.addEventListener('click', function () {
        var sid = self._extractScheduleId(input ? input.value : '');
        if (!sid) { self._empty('请粘贴课次链接或标识'); return; }
        self.load(sid);
      });
      if (input) input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && btn) btn.click();
      });

      // 倍速按钮：设 playbackRate 并记忆；原生菜单仍可用，这里是快捷入口
      Array.prototype.forEach.call(document.querySelectorAll('.rp-rate'), function (b) {
        b.addEventListener('click', function () {
          var rate = parseFloat(b.getAttribute('data-rate')) || 1;
          var video = document.getElementById('rp-video');
          if (video) video.playbackRate = rate;
          LS.set(RATE_KEY, String(rate));
          self._syncRateUi(rate);
        });
      });

      this._bindVideo();
      this._bindKeys();
    },

    /** 手工入口宽容解析：允许粘贴完整链接（?scheduleId=xxx）或裸课次标识 */
    _extractScheduleId: function (raw) {
      var s = (raw == null) ? '' : String(raw).trim();
      if (!s) return '';
      var m = s.match(/[?&]scheduleId=([^&#]+)/i);
      if (m && m[1]) {
        try { return decodeURIComponent(m[1]).trim(); } catch (e) { return m[1].trim(); }
      }
      return s;
    },

    /** 视频事件：进度/音量记忆、续播提示、连播。原生 controls 负责交互，这里只加增强。 */
    _bindVideo: function () {
      var self = this;
      var video = document.getElementById('rp-video');
      if (!video || video._rpBound) return;
      video._rpBound = true;

      video.addEventListener('loadedmetadata', function () {
        self._seekReady = false;
        // 恢复全局音量/静音
        var vol = parseFloat(LS.get(VOLUME_KEY));
        if (!isNaN(vol) && vol >= 0 && vol <= 1) video.volume = vol;
        var savedRate = parseFloat(LS.get(RATE_KEY));
        if (!isNaN(savedRate) && savedRate > 0) {
          video.playbackRate = savedRate;
          self._syncRateUi(savedRate);
        }
        // 进度续播：超过 5 秒且未看完才提示，避免"刚开始"打扰
        var pos = self._savedProgress();
        var resume = document.getElementById('rp-resume');
        if (pos > 5 && pos < (video.duration || 0) - 5 && resume) {
          resume.textContent = '从 ' + self._mmss(pos) + ' 继续播放';
          resume.style.display = 'block';
        } else if (resume) {
          resume.style.display = 'none';
        }
      });

      video.addEventListener('timeupdate', function () {
        if (!self.current || !video.duration) return;
        // 看完（剩 ≤3s）就清进度，下次从头播
        if (video.currentTime >= video.duration - 3) {
          LS.set(PROGRESS_KEY + self.current.recordingId, '0');
        } else {
          LS.set(PROGRESS_KEY + self.current.recordingId, String(Math.floor(video.currentTime)));
        }
      });

      video.addEventListener('volumechange', function () {
        LS.set(VOLUME_KEY, String(video.volume));
      });

      video.addEventListener('ended', function () {
        self._playNext();
      });

      var resume = document.getElementById('rp-resume');
      if (resume) resume.addEventListener('click', function () {
        var pos = self._savedProgress();
        if (pos > 0) video.currentTime = pos;
        resume.style.display = 'none';
        self._safePlay(video);
      });
    },

    /** play() 在老浏览器/测试桩里返回 undefined，统一处理自动播放拦截 */
    _safePlay: function (video) {
      try {
        var pp = video.play();
        if (pp && typeof pp.catch === 'function') pp.catch(function () {});
      } catch (e) { /* 播放失败不打扰 */ }
    },

    /** 回放快捷键：绑在 player 容器，输入框聚焦时不响应 */
    _bindKeys: function () {
      var self = this;
      var box = document.getElementById('rp-player');
      if (!box || box._rpKeysBound) return;
      box._rpKeysBound = true;
      box.addEventListener('keydown', function (e) {
        var video = document.getElementById('rp-video');
        if (!video || video.style.display === 'none') return;
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        var handled = true;
        switch (e.key) {
          case ' ': case 'Spacebar':
            if (video.paused) self._safePlay(video); else video.pause();
            break;
          case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 5); break;
          case 'ArrowRight': video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); break;
          case 'ArrowUp': video.volume = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10); break;
          case 'ArrowDown': video.volume = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10); break;
          default: handled = false;
        }
        if (handled) e.preventDefault();
      });
    },

    _syncRateUi: function (rate) {
      Array.prototype.forEach.call(document.querySelectorAll('.rp-rate'), function (b) {
        b.classList.toggle('active', Math.abs((parseFloat(b.getAttribute('data-rate')) || 0) - rate) < 0.01);
      });
    },

    _savedProgress: function () {
      if (!this.current) return 0;
      var v = parseInt(LS.get(PROGRESS_KEY + this.current.recordingId), 10);
      return (isNaN(v) || v < 0) ? 0 : v;
    },

    _mmss: function (sec) {
      var m = Math.floor(sec / 60), s = sec % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    },

    /** 播完自动高亮下一条并提示（不强制自动播，避免连续输出打扰） */
    _playNext: function () {
      var self = this;
      var idx = this.rows.findIndex(function (r) { return self.current && r.recordingId === self.current.recordingId; });
      if (idx < 0 || idx >= this.rows.length - 1) return;
      var nextEl = document.querySelector('.rp-item[data-idx="' + (idx + 1) + '"]');
      if (!nextEl) return;
      Array.prototype.forEach.call(document.querySelectorAll('.rp-item'), function (x) { x.classList.remove('active'); });
      nextEl.classList.add('active');
      this._toastHint('本条已播完，已选中下一条（点击即可播放）');
    },

    _toastHint: function (msg) {
      var hint = document.getElementById('rp-hint');
      if (!hint) return;
      var old = hint.textContent;
      hint.textContent = msg;
      setTimeout(function () { hint.textContent = old; }, 4000);
    },

    load: function (scheduleId) {
      var self = this;
      this.scheduleId = scheduleId;
      var list = document.getElementById('rp-list');
      var listEmpty = document.getElementById('rp-list-empty');
      if (listEmpty) listEmpty.style.display = 'none';
      if (list) list.innerHTML = '<div class="rp-item">加载中…</div>';

      // 先把课次序号渲染出来（此刻还没有课程名），再异步补课程名
      this._renderClassLabel(scheduleId, '');
      this._loadClassName(scheduleId);

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

    /**
     * 课次可读化（2026-11-17）：与课堂准备页、在线课堂标题同口径——
     * 有课程名 → 「课程名 · 第N课次」（第 1 课次只给课程名）；无课程名 → 「第N课次」。
     * 界面上不再出现课次编码（含 title 悬停提示也不带），排障请看浏览器地址栏参数。
     */
    _renderClassLabel: function (sid, courseName) {
      this._courseName = courseName || this._courseName || '';
      var el = document.getElementById('rp-class');
      if (!el) return;
      var idx = this._classIndexOf(sid || this.scheduleId);
      el.textContent = this._courseName
        ? (String(this._courseName) + (idx > 1 ? ' · 第' + idx + '课次' : ''))
        : ('第' + idx + '课次');
    },

    /** 课程名来自课堂状态接口；课堂未创建/无权限时静默失败，保留「第N课次」 */
    _loadClassName: function (sid) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getClassroomStatus !== 'function') return;
      window.ClassroomAPI.getClassroomStatus(this.apiBaseUrl, sid)
        .then(function (res) {
          if (res && res.courseName) self._renderClassLabel(sid, res.courseName);
        })
        .catch(function () { /* 无课程名不影响回放播放 */ });
    },

    /** scheduleId 复合键取课次序号（与后端 ClassroomKey / classroom-main.js 同口径，容错回落 1） */
    _classIndexOf: function (key) {
      var s = (key == null) ? '' : String(key);
      var i = s.indexOf('~');
      if (i < 0 || i === s.length - 1) return 1;
      var v = parseInt(s.slice(i + 1), 10);
      return (v > 0) ? v : 1;
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
        var mode = self._modeLabel(r.recordMode);
        return '<div class="rp-item" data-idx="' + idx + '">' +
          '<div class="rp-time">' + start + badge + '</div>' +
          '<div class="rp-meta">' + (duration ? '时长 ' + duration : '时长未知') +
          ' · ' + self._statusText(r.status) + ' · ' + mode + '</div>' +
          '</div>';      }).join('');

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
      var extra = document.getElementById('rp-extra');
      var resume = document.getElementById('rp-resume');
      if (!video) return;
      this.current = null;
      if (extra) extra.style.display = 'none';
      if (resume) resume.style.display = 'none';
      if (!r || !r.url) {
        this._empty(r && r.status === 'RECORDING'
          ? '该录制仍在进行中，结束后才能观看'
          : '录制文件不可用（可能已过期或上传未完成）');
        return;
      }
      if (empty) empty.style.display = 'none';
      video.style.display = '';
      this.current = r;                 // 进度记忆的键
      if (extra) extra.style.display = 'flex';
      var hint = document.getElementById('rp-hint');
      if (hint) hint.textContent = '当前：' + this._modeLabel(r.recordMode)
        + ' · 空格 播放/暂停 · ←→ 快退/快进 5 秒 · ↑↓ 音量 · 文件保留 90 天';
      if (video.src !== r.url) video.src = r.url;
      video.load();                      // 确保 loadedmetadata 重新触发，恢复音量/倍速/续播提示
      this._safePlay(video);
    },

    _badge: function (status) {
      var cls = String(status || '').toLowerCase();
      return '<span class="rp-badge ' + cls + '">' + this._statusText(status) + '</span>';
    },

    /** 录制模式标注（P2）：区分人像录制 / 教学区域录制；老记录默认人像 */
    _modeLabel: function (mode) {
      return 'screen' === mode ? '教学区域录制' : '人像录制';
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
      var extra = document.getElementById('rp-extra');
      var resume = document.getElementById('rp-resume');
      this.current = null;
      if (extra) extra.style.display = 'none';
      if (resume) resume.style.display = 'none';
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
        // 只显示姓名/账号，缺省时留空——不拿 userId 兜底，避免界面出现一串编码
        if (el && u) el.textContent = (u.name || u.account || '') + (u.role ? ' · ' + u.role : '');
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
