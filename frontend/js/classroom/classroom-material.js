/**
 * classroom-material.js —— 讲稿容器（F4-04 / F4-05 / F4-06）
 *
 * 教师上传讲稿 → 服务端落对象存储并广播 page:state → 学生端跟随翻页。
 *
 * 渲染策略按文件类型分流：
 *   PDF   → <iframe src="...pdf#page=N&toolbar=0">，翻页就是改 hash（不重新下载整份文件）
 *   IMAGE → <img>，页码无意义（单图）
 *   OTHER → 给下载入口（PPT 等浏览器不能内联渲染）
 *
 * 学生端只读：翻页按钮对教师/管理员可见，学生点不动，且服务端也会拒绝非教师翻页。
 */
(function () {
  var ClassroomMaterial = {
    ctx: null,
    state: null,       // { materialId, fileName, fileType, url, page }
    visible: false,

    init: function (ctx) {
      this.ctx = ctx || {};
      this._bind();
      // 进房先定位当前讲稿（迟到/刷新的人也能看到老师正在讲的那一页）
      var self = this;
      if (window.ClassroomAPI && typeof window.ClassroomAPI.getCurrentMaterial === 'function') {
        window.ClassroomAPI.getCurrentMaterial(this.ctx.apiBaseUrl, this.ctx.scheduleId)
          .then(function (m) {
            if (!m || !m.ossKey) return;
            self._apply({
              materialId: m.materialId,
              fileName: m.fileName,
              fileType: m.fileType,
              url: m.url,
              page: m.currentPage && m.currentPage > 0 ? m.currentPage : 1
            }, false);
          })
          .catch(function () { /* 无讲稿是常态，不打扰用户 */ });
      }
      return this;
    },

    onSignal: function (msg) {
      if (!msg || msg.type !== 'page:state') return;
      this._apply(msg, true);
    },

    toggle: function () {
      if (!this.state || !this.state.url) {
        if (this._isTeacher()) this._pickFile();
        else this._toast('老师还没有上传讲稿');
        return false;
      }
      this.visible = !this.visible;
      var stage = document.getElementById('material-stage');
      if (stage) stage.classList.toggle('hidden', !this.visible);
      return this.visible;
    },

    next: function () { this._turn((this.state ? this.state.page : 1) + 1); },
    prev: function () { this._turn(Math.max(1, (this.state ? this.state.page : 1) - 1)); },
    goto: function (page) { this._turn(Math.max(1, page || 1)); },

    /** 教师翻页：只发请求，画面等后端广播回来再更新（单一真相源，避免多端不同步） */
    _turn: function (page) {
      if (!this._isTeacher()) return;
      if (!this.state || !this.state.materialId) return;
      if (window.ClassroomAPI && typeof window.ClassroomAPI.turnPage === 'function') {
        window.ClassroomAPI.turnPage(this.ctx.apiBaseUrl, this.ctx.scheduleId, this.state.materialId, page)
          .catch(function () { /* 广播会纠正，失败不额外弹窗 */ });
      }
    },

    _apply: function (state, reveal) {
      this.state = state;
      var stage = document.getElementById('material-stage');
      var frame = document.getElementById('ms-frame');
      var img = document.getElementById('ms-image');
      var empty = document.getElementById('ms-empty');
      var pageLabel = document.getElementById('ms-page');
      var bar = document.getElementById('ms-bar');
      if (!stage) return;

      empty.classList.add('hidden');
      var isPdf = String(state.fileType || '').toUpperCase() === 'PDF';
      var isImage = String(state.fileType || '').toUpperCase() === 'IMAGE';
      var page = state.page && state.page > 0 ? state.page : 1;

      if (isPdf && state.url) {
        frame.classList.remove('hidden');
        img.classList.add('hidden');
        // 改 hash 而不是重设 src：避免每次翻页都重新拉整份 PDF
        frame.src = state.url + '#page=' + page + '&toolbar=0&navpanes=0';
      } else if (isImage && state.url) {
        frame.classList.add('hidden');
        img.classList.remove('hidden');
        img.src = state.url;
      } else {
        frame.classList.add('hidden');
        img.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.innerHTML = state.url
          ? '该格式（' + this._escape(state.fileType || '未知') + '）不支持内联预览，' +
            '<a href="' + this._escape(state.url) + '" target="_blank" rel="noopener">点此下载</a>'
          : '暂无讲稿';
      }

      if (pageLabel) pageLabel.textContent = '第 ' + page + ' 页';
      if (bar) bar.classList.toggle('is-teacher', this._isTeacher());

      if (reveal) {
        this.visible = true;
        stage.classList.remove('hidden');
      }
    },

    _bind: function () {
      var self = this;
      var $ = function (id) { return document.getElementById(id); };

      var close = $('ms-close');
      if (close) close.addEventListener('click', function () {
        self.visible = false;
        var stage = $('material-stage');
        if (stage) stage.classList.add('hidden');
        var btn = $('ctrl-material');
        if (btn) btn.classList.remove('active');
      });

      var prev = $('ms-prev');
      if (prev) prev.addEventListener('click', function () { self.prev(); });
      var next = $('ms-next');
      if (next) next.addEventListener('click', function () { self.next(); });

      var up = $('ms-upload');
      if (up) up.addEventListener('click', function () { self._pickFile(); });

      var input = $('ms-file-input');
      if (input) input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (f) self._upload(f);
        input.value = '';
      });
    },

    _pickFile: function () {
      var input = document.getElementById('ms-file-input');
      if (input) input.click();
    },

    /**
     * 上传：≤100MB 走一次性 multipart（带进度）；上传成功后后端会广播 page:state，
     * 本地不抢先渲染——保证所有人看到的页码一致。
     */
    _upload: function (file) {
      var self = this;
      var max = 100 * 1024 * 1024;
      if (file.size > max) { this._toast('文件超过 100MB，请拆分或压缩后再传'); return; }

      var url = (this.ctx.apiBaseUrl || '') + '/api/v1/classrooms/' +
        encodeURIComponent(this.ctx.scheduleId) + '/materials/file';
      var form = new FormData();
      form.append('file', file);

      var hint = document.getElementById('ms-hint');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      if (this.ctx.token) xhr.setRequestHeader('Authorization', 'Bearer ' + this.ctx.token);
      xhr.upload.onprogress = function (e) {
        if (!hint) return;
        if (e.lengthComputable) {
          hint.textContent = '上传中 ' + Math.round(e.loaded * 100 / e.total) + '%';
          hint.classList.remove('hidden');
        }
      };
      xhr.onload = function () {
        if (hint) hint.classList.add('hidden');
        var ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          self._toast('上传失败（' + xhr.status + '）');
          return;
        }
        self._toast('讲稿已上传');
      };
      xhr.onerror = function () {
        if (hint) hint.classList.add('hidden');
        self._toast('上传失败，请检查网络');
      };
      xhr.send(form);
    },

    _isTeacher: function () {
      var r = (this.ctx && this.ctx.role) || '';
      return r === 'teacher' || r === 'admin' || r === 'platform_admin';
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    },

    _toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Material]', msg);
    }
  };

  window.ClassroomMaterial = ClassroomMaterial;
})();
