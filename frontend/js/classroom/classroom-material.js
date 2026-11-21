/**
 * classroom-material.js —— 讲稿容器（F4-04 / F4-05 / F4-06 / 滚动同步）
 *
 * 教师上传讲稿 → 服务端落对象存储并广播 page:state → 学生端跟随翻页。
 *
 * 渲染策略按文件类型分流：
 *   PDF   → PDF.js 解析 + <canvas> 自渲染（离屏双缓冲翻页，根治 iframe 换页黑闪/延迟，并解锁滚动同步）
 *   IMAGE → <img>，页码无意义（单图）
 *   OTHER → 给下载入口（PPT 等浏览器不能内联渲染）
 *
 * 学生端只读：翻页按钮对教师/管理员可见，学生点不动，且服务端也会拒绝非教师翻页。
 *
 * 滚动同步（2026-11-15）：教师滚动讲稿面板 → 节流广播 page:scroll → 学生跟随滚动。
 *   IMAGE 与 PDF 都可同步——PDF 用 PDF.js 渲染到父文档 <canvas>，.ms-body 是真实可滚动容器；
 *   滚动广播只由教师发出，学生端只接收。PDF 翻页/换稿时离屏渲染完成后复位到顶并广播。
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
      // 教师/管理员：拉资料列表填「选择展示」下拉（学生只看当前稿，不给选择器）
      if (this._isTeacher()) this._loadMaterialList();
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
        var changed = !this.state || this.state.materialId !== msg.materialId;
        this._apply(msg, true);
        // 换稿/上传都带新 materialId：教师端顺手刷新下拉，让列表与画面一致
        if (changed && this._isTeacher()) this._loadMaterialList(msg.materialId);
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
      var ft = String(state.fileType || '').toUpperCase();
      var isPdf = ft === 'PDF';
      var isImage = ft === 'IMAGE';
      var page = state.page && state.page > 0 ? state.page : 1;
      var cv = document.getElementById('ms-pdf-canvas');

      // 切到非 PDF（或无可渲染 URL）时取消在途 PDF 渲染，避免后台解码占内存 / 旧页残留
      if ((!isPdf || !state.url) && (this._pdfDoc || this._pdfTask)) this._cancelPdf();
      if (cv && (!isPdf || !state.url)) cv.classList.add('hidden');

      if (isPdf && state.url) {
        // PDF.js 自渲染：旧页保留在 canvas 上直到新页画完（离屏双缓冲），无空白帧 → 不黑闪
        frame.classList.add('hidden');
        img.classList.add('hidden');
        if (cv) cv.classList.remove('hidden');
        this._renderPdf(state.url, page);
      } else if (isImage && state.url) {
        frame.classList.add('hidden');
        img.classList.remove('hidden');
        if (cv) cv.classList.add('hidden');
        img.src = state.url;
      } else {
        frame.classList.add('hidden');
        img.classList.add('hidden');
        if (cv) cv.classList.add('hidden');
        empty.classList.remove('hidden');
        if (!state.url) {
          empty.textContent = '暂无讲稿';
        } else {
          // 不支持内联的文件（PPT/Word 等）：下载名必须带原始扩展名，
          // 否则浏览器按签名 URL 的 Base64 token 串存盘，本地系统认不出格式打不开。
          // download 属性同源生效；跨域时由后端 download=1 的 Content-Disposition 兜底。
          var dlName = this._downloadName(state);
          var dlUrl = state.url + (state.url.indexOf('?') >= 0 ? '&' : '?') + 'download=1';
          empty.innerHTML = '该格式（' + this._escape(state.fileType || '未知') + '）不支持内联预览，'
            + '<a href="' + this._escape(dlUrl) + '" download="' + this._escape(dlName) + '" rel="noopener">点此下载</a>';
        }
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

    /**
     * PDF.js 渲染指定页到可见 canvas。
     * 黑闪根治：新页先画在「离屏 canvas」，画完再一次性贴到可见 canvas，
     * 旧页一直保留到新页就绪，中间没有空白帧 → 不再露底、不再黑闪。
     */
    _renderPdf: function (url, page) {
      var self = this;
      if (!window.pdfjsLib) { this._toast('讲稿渲染组件未加载'); return; }

      // workerSrc 只设一次；必须与主库同版本（3.11.174）。
      // classroom.html 在站点根、worker 在 js/public/vendor/，相对路径成立；
      // 云托管若挂在子目录，改为按 location 推导的绝对前缀。
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/public/vendor/pdf.worker.min.js';
      }

      var seq = (this._pdfSeq || 0) + 1;
      this._pdfSeq = seq; // 竞态令牌：只认最后一次渲染

      // 同一 URL 复用文档，避免重复下载/解析；换 URL 时先销毁旧 document
      var docReady = (this._pdfDoc && this._pdfDocUrl === url)
        ? Promise.resolve(this._pdfDoc)
        : window.pdfjsLib.getDocument({ url: url, withCredentials: false }).promise
            .then(function (doc) {
              if (self._pdfDoc && self._pdfDoc.destroy) { try { self._pdfDoc.destroy(); } catch (e) {} }
              self._pdfDoc = doc;
              self._pdfDocUrl = url;
              return doc;
            });

      docReady.then(function (doc) {
        if (seq !== self._pdfSeq) return; // 期间又翻页/换稿 → 丢弃
        var p = Math.min(Math.max(1, page), doc.numPages);
        return doc.getPage(p).then(function (pdfPage) {
          if (seq !== self._pdfSeq) return;

          // 取消上一次未完成的渲染，防止旧页后完成覆盖新页
          if (self._pdfTask) { try { self._pdfTask.cancel(); } catch (e) {} }

          var canvas = document.getElementById('ms-pdf-canvas');
          if (!canvas) return;
          var host = canvas.parentNode;
          var dpr = window.devicePixelRatio || 1;
          var availW = Math.max(240, (host.clientWidth || 800) - 16);
          var base = pdfPage.getViewport({ scale: 1 });
          var scale = Math.min(availW / base.width, 2.0) * dpr; // 限宽 + 限最大倍率，控内存
          var vp = pdfPage.getViewport({ scale: scale });

          // ★ 离屏渲染：先画到临时 canvas，旧页仍留在可见 canvas 上
          var off = document.createElement('canvas');
          off.width = Math.floor(vp.width);
          off.height = Math.floor(vp.height);
          var task = pdfPage.render({ canvasContext: off.getContext('2d'), viewport: vp });
          self._pdfTask = task;

          return task.promise.then(function () {
            if (seq !== self._pdfSeq) return; // 渲染期间又翻页 → 丢弃
            // ★ 画完再贴到可见 canvas：中间无空白帧，旧页留到此刻才被替换
            canvas.width = off.width;
            canvas.height = off.height;
            canvas.style.width = Math.round(vp.width / dpr) + 'px';
            canvas.style.height = Math.round(vp.height / dpr) + 'px';
            canvas.getContext('2d').drawImage(off, 0, 0);
            canvas.classList.remove('hidden');
            self._pdfTask = null;

            // 新页从顶部看（与翻页复位一致）。教师端复位已在 _apply 的 pageChanged 广播，
            // 渲染完成这里再兜一次，避免离屏渲染异步期间滚动位置漂移。
            var body = document.getElementById('ms-body');
            if (body && body.scrollTop !== 0) body.scrollTop = 0;
          }).catch(function (e) {
            if (e && e.name === 'RenderingCancelledException') return; // 正常取消，不算错误
            throw e;
          });
        });
      }).catch(function (e) {
        if (seq === self._pdfSeq) {
          self._toast('讲稿加载失败：' + (e && e.message ? e.message : '未知错误'));
        }
      });
    },

    /** 关闭讲稿 / 换课 / 换稿时取消渲染并释放文档 */
    _cancelPdf: function () {
      this._pdfSeq = (this._pdfSeq || 0) + 1; // 令牌 +1，令在途渲染全部作废
      if (this._pdfTask) { try { this._pdfTask.cancel(); } catch (e) {} this._pdfTask = null; }
      if (this._pdfDoc) { try { this._pdfDoc.destroy(); } catch (e) {} this._pdfDoc = null; }
      this._pdfDocUrl = null;
      var canvas = document.getElementById('ms-pdf-canvas');
      if (canvas) canvas.classList.add('hidden');
    },

    /**
     * 学生端应用教师广播的滚动位置（IMAGE / PDF 均真实生效）。
     * PDF 渲染到父文档 canvas 后，.ms-body 成为真实可滚动容器，scrollTop 可读可写。
     */
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
        self._cancelPdf(); // 关讲稿即停 PDF 解码，避免后台占内存
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

      // 选择多份资料中的一份展示（教师/管理员；学生端选择器被 CSS 隐藏）
      var picker = $('ms-material-picker');
      if (picker) picker.addEventListener('change', function () {
        self._selectMaterial(picker.value);
      });

      var input = $('ms-file-input');
      if (input) input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (f) self._upload(f);
        input.value = '';
      });

      // 滚动同步源（仅教师）：节流广播 ms-body 的滚动位置。
      // 学生端只接收，不发送。IMAGE 与 PDF 都可同步——PDF 经 PDF.js 渲染到父文档 canvas，
      // .ms-body 是可滚动容器，scrollTop 可读可写（不再受 iframe 跨文档限制）。
      var body = $('ms-body');
      if (body && !body._materialScrollBound) {
        body._materialScrollBound = true;
        var scrollTimer = null;
        body.addEventListener('scroll', function () {
          if (!self._isTeacher()) return;           // 只有教师是滚动源
          if (!self.state) return;
          var ft = String(self.state.fileType || '').toUpperCase();
          if (ft !== 'IMAGE' && ft !== 'PDF') return; // IMAGE / PDF 都同步滚动
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

      // PDF canvas 按容器宽度算 scale，窗口变化后需防抖重绘，否则模糊或错位
      var resizeTimer = null;
      window.addEventListener('resize', function () {
        if (!self.state || String(self.state.fileType || '').toUpperCase() !== 'PDF') return;
        if (!self.state.url) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (self.state && self.state.url) self._renderPdf(self.state.url, self.state.page || 1);
        }, 200);
      });
    },

    /**
     * 加载资料列表填「选择展示」下拉（2026-11-17）。
     * @param preferredId 期望选中的 materialId（换稿广播时传入）；缺省沿用当前 state
     */
    _loadMaterialList: function (preferredId) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMaterials !== 'function') return;
      window.ClassroomAPI.getMaterials(this.ctx.apiBaseUrl, this.ctx.scheduleId)
        .then(function (list) {
          var sel = document.getElementById('ms-material-picker');
          if (!sel) return;
          var arr = Array.isArray(list) ? list : [];
          var want = String(preferredId || (self.state && self.state.materialId) || '');
          var html = '<option value="">选择资料…</option>';
          arr.forEach(function (m) {
            var id = String(m.materialId || '');
            html += '<option value="' + self._escape(id) + '"' + (id === want ? ' selected' : '') + '>'
              + self._escape(m.fileName || '未命名') + '</option>';
          });
          sel.innerHTML = html;
        })
        .catch(function () { /* 列表拉取失败不打扰上课，保留原下拉 */ });
    },

    /** 切换展示资料：只发请求，画面等后端 page:state 广播回来再更新（单一真相源） */
    _selectMaterial: function (materialId) {
      if (!this._isTeacher() || !materialId) return;
      if (window.ClassroomAPI && typeof window.ClassroomAPI.selectCurrentMaterial === 'function') {
        window.ClassroomAPI.selectCurrentMaterial(this.ctx.apiBaseUrl, this.ctx.scheduleId, materialId)
          .catch(function () { /* 广播会纠正，失败不额外弹窗 */ });
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

    /**
     * 下载文件名（2026-11-17）：保证带原始扩展名，本地系统才能识别并打开。
     * fileName 来自上传时的原始文件名（含扩展名）；若缺失则从 fileType 兜底推断。
     */
    _downloadName: function (state) {
      var name = String((state && state.fileName) || '').trim() || '讲稿';
      // 已带扩展名（末段 .xxx，且不是点开头的隐藏文件）直接返回
      if (/\.[A-Za-z0-9]{1,10}$/.test(name) && name.lastIndexOf('.') > 0) return name;
      var extByType = { PDF: 'pdf', PPT: 'pptx', IMAGE: 'png', VIDEO: 'mp4', AUDIO: 'mp3' };
      var ext = extByType[String((state && state.fileType) || '').toUpperCase()] || 'bin';
      return name + '.' + ext;
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
