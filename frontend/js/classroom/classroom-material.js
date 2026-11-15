/**
 * classroom-material.js —— 讲稿容器（F4-04 / F4-05 / F4-06 / 滚动同步）
 *
 * 教师上传讲稿 → 服务端落对象存储并广播 page:state → 学生端跟随翻页。
 *
 * 渲染策略按文件类型分流：
 *   PDF   → <iframe src="...pdf#page=N&toolbar=0">，翻页就是改 hash（不重新下载整份文件）
 *   IMAGE → <img>，页码无意义（单图）
 *   OTHER → 给下载入口（PPT 等浏览器不能内联渲染）
 *
 * 学生端只读：翻页按钮对教师/管理员可见，学生点不动，且服务端也会拒绝非教师翻页。
 *
 * 滚动同步（2026-11-15）：教师滚动讲稿面板 → 节流广播 page:scroll → 学生跟随滚动。
 *   仅 IMAGE 类型可真实同步——PDF 走原生 iframe 查看器，滚动位置在跨文档内部，
 *   前端读不到也设不了；要同步 PDF 滚动必须把 PDF 改用 PDF.js 自行渲染（见文档/方案）。
 */
(function () {
  // 端点常量统一取自 shared/apiPaths.js（经 js/shared-domain-bridge.js 挂到 window.ApiPaths）
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  // 见 api.js#window.classroomUrl：避免 apiBaseUrl(/api/v1) + EP(/api/v1/...) 双前缀 404
  var urlOf = function (base, path) {
    return typeof window.classroomUrl === 'function'
      ? window.classroomUrl(base, path) : (base || '') + path;
  };
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
      if (!msg || !msg.type) return;
      if (msg.type === 'page:state') {
        this._apply(msg, true);
        return;
      }
      // 滚动同步：仅学生/非教师跟随；教师端不响应（自己是滚动源）
      if (msg.type === 'page:scroll') {
        if (this._isTeacher()) return;
        this._applyScroll(msg.scrollTop || 0);
      }
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
      var prevPage = this.state ? (this.state.page || 0) : 0;
      var prevUrl = this.state ? (this.state.url || '') : '';
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

      // 翻页（或换讲稿）时滚动复位到顶部：学生跟随翻页的同时也要跟随滚动复位，
      // 否则旧滚动量套在新页上会错位。教师端也复位，并广播给所有人。
      var pageChanged = (page !== prevPage) || (state.url && state.url !== prevUrl);
      var body = document.getElementById('ms-body');
      if (body && pageChanged) {
        if (body.scrollTop !== 0) body.scrollTop = 0;
        if (this._isTeacher() && window.ClassroomWS && this.ctx.scheduleId) {
          window.ClassroomWS.sendSignal(this.ctx.scheduleId, {
            type: 'page:scroll', scrollTop: 0, by: this.ctx.userId
          });
        }
      }

      if (pageLabel) pageLabel.textContent = '第 ' + page + ' 页';
      if (bar) bar.classList.toggle('is-teacher', this._isTeacher());

      if (reveal) {
        this.visible = true;
        stage.classList.remove('hidden');
      }
    },

    /** 学生端应用教师广播的滚动位置（仅 IMAGE 真实生效；PDF 走 iframe 不可控） */
    _applyScroll: function (scrollTop) {
      var body = document.getElementById('ms-body');
      if (!body) return;
      if (body.scrollTop !== scrollTop) body.scrollTop = scrollTop;
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

      // 滚动同步源（仅教师）：节流广播 ms-body 的滚动位置。
      // 学生端只接收，不发送；PDF 走 iframe 原生查看器，跨文档读不到滚动，这里跳过。
      var body = $('ms-body');
      if (body && !body._materialScrollBound) {
        body._materialScrollBound = true;
        var scrollTimer = null;
        body.addEventListener('scroll', function () {
          if (!self._isTeacher()) return;           // 只有教师是滚动源
          if (!self.state) return;
          var ft = String(self.state.fileType || '').toUpperCase();
          if (ft !== 'IMAGE') return;               // 仅 IMAGE 可同步滚动
          if (scrollTimer) return;                  // 节流 60ms，避免高频信令
          scrollTimer = setTimeout(function () {
            scrollTimer = null;
            if (window.ClassroomWS && self.ctx.scheduleId) {
              window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
                type: 'page:scroll',
                scrollTop: body.scrollTop,
                by: self.ctx.userId
              });
            }
          }, 60);
        }, { passive: true });
      }
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

      var url = urlOf(this.ctx.apiBaseUrl, EP.CLASSROOM_MATERIAL_FILE(this.ctx.scheduleId));
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
