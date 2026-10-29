/**
 * classroom-record.js —— 课堂录制（F6-01 / F6-02，教师侧）
 *
 * 技术路线：教师端 MediaRecorder 录「本地上行流」（摄像头 + 麦克风），
 * 录完整包分片上传到对象存储，再由 RecordingControlController 登记。
 *
 * <p>为什么不是云录制：云录制（合流）需要厂商侧开通 REST 与回调验签，
 * 见 RecordingBackendRegistry 的说明。本实现零成本、私有化可用，
 * 局限是只录教师画面——界面上会明确告诉教师，不让人误以为学生在录。
 *
 * 分片上传而非一次性：一节 90 分钟的 720p 约 400~800MB，超过单请求上限
 * 也扛不住一次失败重传，5MB/片 + 断点续传（服务端保留已传分片）才现实。
 */
(function () {
  var ClassroomRecord = {
    ctx: null,
    recordingId: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    timer: null,
    uploadProgress: 0,

    init: function (ctx) {
      this.ctx = ctx || {};
      return this;
    },

    isRecording: function () {
      return this.recorder != null && this.recorder.state === 'recording';
    },

    toggle: function () {
      if (this.isRecording()) {
        this.stop();
        return false;
      }
      this.start();
      return true;
    },

    // ---------------- 开始 ----------------
    start: function () {
      var self = this;
      var stream = this._pickStream();
      if (!stream) {
        this._toast('没有可录制的内容（摄像头/麦克风未就绪）');
        return;
      }
      this._api('start').then(function (resp) {
        self.recordingId = resp.recordingId;
        self.chunks = [];
        self.startedAt = Date.now();

        var mime = 'video/webm;codecs=vp8,opus';
        if (window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function'
            && !MediaRecorder.isTypeSupported(mime)) {
          mime = ''; // 交给浏览器自选
        }
        try {
          self.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch (e) {
          self._toast('当前浏览器不支持录制：' + (e && e.message ? e.message : ''));
          self.recordingId = null;
          return;
        }
        self.recorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size > 0) self.chunks.push(ev.data);
        };
        self.recorder.onstop = function () { self._onRecorderStop(); };
        self.recorder.start(1000); // 每秒切一块，避免长时间内存里攒一个巨大 blob
        self._tick();
        self._toast((resp.notice || '录制已开始') + '（学员端会看到录制提示）');
        self._updateUi(true);
      }).catch(function (e) {
        self._toast('开始录制失败：' + ((e && e.message) || ''));
      });
    },

    // ---------------- 停止 ----------------
    stop: function () {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.recorder && this.recorder.state !== 'inactive') {
        this._toast('正在结束录制并上传…');
        this.recorder.stop();
      } else {
        this._updateUi(false);
      }
    },

    _onRecorderStop: function () {
      var self = this;
      var blob = new Blob(this.chunks, { type: 'video/webm' });
      this.chunks = [];
      this.recorder = null;
      this._updateUi(false);

      if (!blob.size) {
        this._toast('录制内容为空（可能一开始就没有画面）');
        return;
      }
      if (!this.recordingId) {
        this._toast('录制记录丢失，文件未上传');
        return;
      }
      this._toast('录制文件 ' + this._size(blob.size) + '，开始上传…');
      this._upload(blob).then(function (ossKey) {
        return self._api('stop', { ossKey: ossKey });
      }).then(function () {
        self._toast('录制已保存，可在回放页观看');
        self.recordingId = null;
      }).catch(function (e) {
        self._toast('录制上传失败：' + ((e && e.message) || ''));
      });
    },

    // ---------------- 分片上传 ----------------
    _upload: function (blob) {
      var self = this;
      var base = this.ctx.apiBaseUrl || '';
      var fileName = 'recording-' + this.recordingId + '.webm';

      return this._postJson(base + '/api/v1/uploads/init', {
        purpose: 'RECORDING',
        scheduleId: this.ctx.scheduleId,
        fileName: fileName,
        fileSize: blob.size
      }).then(function (init) {
        var partSize = init.partSize;
        var count = init.partCount;
        var chain = Promise.resolve();
        for (var i = 1; i <= count; i++) {
          (function (n) {
            chain = chain.then(function () {
              var start = (n - 1) * partSize;
              var end = Math.min(start + partSize, blob.size);
              return self._putBinary(
                base + '/api/v1/uploads/' + init.uploadId + '/parts/' + n,
                blob.slice(start, end)
              ).then(function () {
                self.uploadProgress = Math.round(n * 100 / count);
                self._toast('上传中 ' + self.uploadProgress + '%');
              });
            });
          })(i);
        }
        return chain.then(function () {
          return self._postJson(base + '/api/v1/uploads/' + init.uploadId + '/complete', {});
        });
      }).then(function (done) {
        return done.ossKey;
      });
    },

    // ---------------- HTTP ----------------
    _api: function (action, body) {
      var base = this.ctx.apiBaseUrl || '';
      var root = base + '/api/v1/classrooms/' + encodeURIComponent(this.ctx.scheduleId) + '/recording';
      if (action === 'start') {
        return this._postJson(root + '/start', {});
      }
      return this._postJson(root + '/' + encodeURIComponent(this.recordingId) + '/stop', body || {});
    },

    _postJson: function (url, body) {
      return this._xhr('POST', url, JSON.stringify(body || {}), 'application/json').then(function (text) {
        var json = text ? JSON.parse(text) : {};
        if (json && typeof json.code === 'number' && json.code !== 200) {
          throw new Error(json.message || ('接口返回 ' + json.code));
        }
        return json && json.data !== undefined ? json.data : json;
      });
    },

    _putBinary: function (url, blob) {
      return this._xhr('PUT', url, blob, 'application/octet-stream');
    },

    _xhr: function (method, url, payload, contentType) {
      var token = this.ctx ? this.ctx.token : null;
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        if (contentType) xhr.setRequestHeader('Content-Type', contentType);
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
          else reject(new Error('HTTP ' + xhr.status + ' ' + (xhr.responseText || '').slice(0, 120)));
        };
        xhr.onerror = function () { reject(new Error('网络错误')); };
        xhr.send(payload);
      });
    },

    // ---------------- 本地流选择 ----------------
    /** 优先用已渲染的本地画面流（mesh/SDK 都把本地轨道 attach 到了该 video） */
    _pickStream: function () {
      var v = document.getElementById('vt-local-video');
      if (v && v.srcObject && v.srcObject.getTracks && v.srcObject.getTracks().length) {
        return v.srcObject;
      }
      if (window.ClassroomRTC && typeof window.ClassroomRTC.getLocalStream === 'function') {
        var s = window.ClassroomRTC.getLocalStream();
        if (s && s.getTracks && s.getTracks().length) return s;
      }
      return null;
    },

    // ---------------- UI ----------------
    _tick: function () {
      var self = this;
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(function () {
        var sec = Math.floor((Date.now() - self.startedAt) / 1000);
        var el = document.getElementById('record-timer');
        if (el) el.textContent = self._hms(sec);
        var banner = document.getElementById('record-banner');
        if (banner) banner.classList.remove('hidden');
      }, 1000);
    },

    _updateUi: function (on) {
      var btn = document.getElementById('ctrl-record');
      if (btn) btn.classList.toggle('active', !!on);
      var banner = document.getElementById('record-banner');
      if (banner) banner.classList.toggle('hidden', !on);
      if (!on) {
        var el = document.getElementById('record-timer');
        if (el) el.textContent = '';
      }
    },

    _hms: function (sec) {
      var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
    },

    _size: function (bytes) {
      if (bytes > 1024 * 1024 * 1024) return (bytes / 1073741824).toFixed(1) + 'GB';
      if (bytes > 1024 * 1024) return (bytes / 1048576).toFixed(1) + 'MB';
      return Math.round(bytes / 1024) + 'KB';
    },

    _toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Record]', msg);
    }
  };

  window.ClassroomRecord = ClassroomRecord;
})();
