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
  // 端点常量统一取自 shared/apiPaths.js（经 js/shared-domain-bridge.js 挂到 window.ApiPaths）
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  // 见 api.js#window.classroomUrl：避免 apiBaseUrl(/api/v1) + EP(/api/v1/...) 双前缀 404
  var urlOf = function (base, path) {
    return typeof window.classroomUrl === 'function'
      ? window.classroomUrl(base, path) : (base || '') + path;
  };

  // ---------------- EBML Duration 修复（2026-11-18）----------------
  // Chrome 的 MediaRecorder 产出 webm 时**不写** Duration 元素，播放器读到的是 ∞，
  // 进度条因此拖不动（回放页实测）。录制收尾时把真实时长补进 Segment > Info：
  //   - 已有 Duration（部分浏览器写占位值）→ 原地覆写为 float32
  //   - 没有（Chrome）→ 插入 7 字节 `44 89 84 <float32>`，Info 的 size vint 同步 +7
  // Segment 本身是未知长度（0x01FF..），后续 Cluster 靠相对偏移定位，整体后移 7 字节不影响解析。
  // 任何解析异常都返回 null，由调用方降级为原样上传——绝不能因为修复失败丢掉录制文件。
  var EBML_HEADER = 0x1A45DFA3, EBML_SEGMENT = 0x18538067,
      EBML_INFO = 0x1549A966, EBML_TIMECODE_SCALE = 0x2AD7B1, EBML_DURATION = 0x4489,
      EBML_TRACKS = 0x1654AE6B, EBML_TRACKENTRY = 0xAE,
      EBML_TRACKNUMBER = 0xD7, EBML_TRACKTYPE = 0x83,
      EBML_CLUSTER = 0x1F43B675, EBML_TIMECODE = 0xE7,
      EBML_CUES = 0x1C53BB6B;

  /** 读 EBML 变长整数；keepMarker=true 用于元素 ID（marker 位属于 ID 本身） */
  function _ebmlReadVint(buf, pos, keepMarker) {
    if (pos == null || pos < 0 || pos >= buf.length) return null;
    var first = buf[pos];
    if (!first) return null;
    var len = 1, mask = 0x80;
    while (!(first & mask)) {
      mask >>= 1;
      len++;
      if (len > 8 || pos + len > buf.length) return null;
    }
    var dataBits = mask - 1;
    var value = keepMarker ? first : (first & dataBits);
    // unknown size 的判定只看「数据位」是否全 1：Chrome 写 8 字节 01 FF..FF，
    // 首字节含 marker 的 1，不能拿它跟 0xFF 比。
    var allOnes = ((first & dataBits) === dataBits);
    for (var k = 1; k < len; k++) {
      if (buf[pos + k] !== 0xFF) allOnes = false;
      // 8 字节 vint 会超出 32 位，位运算会溢出成负数，必须用乘法累加
      value = value * 256 + buf[pos + k];
    }
    return { value: value, length: len, unknown: !keepMarker && allOnes };
  }

  function _ebmlWriteVint(value, len) {
    var out = new Uint8Array(len);
    var marker = Math.pow(2, 7 * len);
    var v = marker + value;
    for (var i = len - 1; i >= 0; i--) {
      out[i] = v % 256;
      v = Math.floor(v / 256);
    }
    return out;
  }

  function _ebmlVintLen(value) {
    if (value <= 126) return 1;
    if (value <= 16382) return 2;
    if (value <= 2097150) return 3;
    return 4;
  }

  function _ebmlElement(buf, pos) {
    var id = _ebmlReadVint(buf, pos, true);
    if (!id) return null;
    var size = _ebmlReadVint(buf, pos + id.length, false);
    if (!size) return null;
    var dataStart = pos + id.length + size.length;
    return {
      id: id.value,
      idEnd: pos + id.length,
      size: size.value,
      sizeUnknown: size.unknown,
      dataStart: dataStart,
      dataEnd: size.unknown ? buf.length : Math.min(dataStart + size.value, buf.length)
    };
  }

  /** 定位 Segment > Info；Segment 长度未知时从 dataStart 顺序扫到文件尾 */
  function _ebmlFindInfo(buf) {
    var header = _ebmlElement(buf, 0);
    if (!header || header.id !== EBML_HEADER) return null;
    var seg = _ebmlElement(buf, header.dataEnd);
    if (!seg || seg.id !== EBML_SEGMENT) return null;
    var pos = seg.dataStart;
    while (pos + 12 <= buf.length) {
      var el = _ebmlElement(buf, pos);
      if (!el || el.dataEnd <= pos) return null;
      if (el.id === EBML_INFO) return el;
      if (el.sizeUnknown) return null;   // 未知长度的 Cluster 无法跳过
      pos = el.dataEnd;
    }
    return null;
  }

  function _ebmlChild(buf, parent, wantedId) {
    var pos = parent.dataStart;
    while (pos + 6 <= parent.dataEnd) {
      var el = _ebmlElement(buf, pos);
      if (!el || el.dataEnd > parent.dataEnd || el.dataEnd <= pos) return null;
      if (el.id === wantedId) return el;
      pos = el.dataEnd;
    }
    return null;
  }

  function _ebmlFloat32(value) {
    var out = new Uint8Array(4);
    new DataView(out.buffer).setFloat32(0, value, false); // EBML 约定 big-endian
    return out;
  }

  function _ebmlFloat64(value) {
    var out = new Uint8Array(8);
    new DataView(out.buffer).setFloat64(0, value, false);
    return out;
  }

  /**
   * 给 webm 补 Duration。
   * @param {Uint8Array} buf 原始文件字节
   * @param {number} durationMs 真实录制时长（毫秒）
   * @returns {Uint8Array|null} 修补后的完整字节；无法安全修补时返回 null
   */
  function _ebmlPatchDuration(buf, durationMs) {
    if (!(durationMs > 0) || !buf || buf.length < 64) return null;
    var info = _ebmlFindInfo(buf);
    if (!info || info.sizeUnknown) return null;

    // Duration 的单位是 TimecodeScale（纳秒）。Chrome 默认 1000000ns=1ms，
    // 这里按实际值换算，避免将来改了 scale 后时长差 1000000 倍。
    var scale = 1000000;
    var ts = _ebmlChild(buf, info, EBML_TIMECODE_SCALE);
    if (ts) {
      var s = 0;
      for (var i = ts.dataStart; i < ts.dataEnd; i++) s = s * 256 + buf[i];
      if (s > 0) scale = s;
    }
    var dur = durationMs * 1000000 / scale;

    var existing = _ebmlChild(buf, info, EBML_DURATION);
    if (existing) {
      // EBML Duration 是 float，宽度可为 4 或 8 字节。必须按原宽度覆写：
      // 只写前 4 字节会把 float64 的后半截留成旧值，得到一个谁也不认的怪数。
      if (existing.size !== 4 && existing.size !== 8) return null;
      var fWide = (existing.size === 8) ? _ebmlFloat64(dur) : _ebmlFloat32(dur);
      var out = new Uint8Array(buf);
      for (var j = 0; j < fWide.length; j++) out[existing.dataStart + j] = fWide[j];
      return out;
    }

    // Chrome 路径：Info 内插入 Duration 元素（2B ID + 1B size + 4B float = 7B）
    var f = _ebmlFloat32(dur);
    var durEl = new Uint8Array(7);
    durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x84;
    durEl.set(f, 3);
    var newSize = info.size + durEl.length;
    var sizeBytes = _ebmlWriteVint(newSize, _ebmlVintLen(newSize));
    var parts = [
      buf.subarray(0, info.idEnd),          // EBML ID 原样
      sizeBytes,                             // 新的 Info size
      buf.subarray(info.dataStart, info.dataEnd),
      durEl,
      buf.subarray(info.dataEnd)             // Tracks / Cluster / ...
    ];
    var total = 0;
    for (var p = 0; p < parts.length; p++) total += parts[p].length;
    var merged = new Uint8Array(total);
    var off = 0;
    for (var q = 0; q < parts.length; q++) {
      merged.set(parts[q], off);
      off += parts[q].length;
    }
    return merged;
  }

  /** 把若干 Uint8Array 拼成一个新的 Uint8Array */
  function _ebmlJoin(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), off = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], off);
      off += parts[j].length;
    }
    return out;
  }

  /** 无符号整数转 EBML 大端最短字节（uint 元素用） */
  function _ebmlUInt(value) {
    var v = Math.floor(value);
    if (!(v > 0)) return new Uint8Array([0]);
    var out = [];
    while (v > 0) { out.unshift(v & 0xFF); v = Math.floor(v / 256); }
    return new Uint8Array(out);
  }

  /** 长度转 EBML size vint（marker 位保留，不带 marker 的数值部分） */
  function _ebmlSize(len) {
    if (len <= 126) return new Uint8Array([0x80 | len]);
    if (len <= 16382) return new Uint8Array([0x40 | (len >> 8), len & 0xFF]);
    if (len <= 2097150) return new Uint8Array([0x20 | (len >> 16), (len >> 8) & 0xFF, len & 0xFF]);
    if (len <= 268435454) return new Uint8Array([0x10 | (len >> 24), (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
    return null;
  }

  /** 造一个 EBML 元素：ID 原样 + size vint + 负载 */
  function _ebmlMake(idBytes, payload) {
    var sz = _ebmlSize(payload.length);
    if (!sz) return null;
    return _ebmlJoin([idBytes, sz, payload]);
  }

  /** 找视频轨的 TrackNumber（TrackType=1）；Cues 的 CueTrack 要用它 */
  function _ebmlVideoTrack(buf) {
    var header = _ebmlElement(buf, 0);
    if (!header) return 0;
    var seg = _ebmlElement(buf, header.dataEnd);
    if (!seg || seg.id !== EBML_SEGMENT) return 0;
    var pos = seg.dataStart, end = Math.min(buf.length, seg.dataEnd);
    while (pos + 12 <= end) {
      var el = _ebmlElement(buf, pos);
      if (!el || el.dataEnd <= pos || el.dataEnd > end) break;
      if (el.id === EBML_TRACKS) {
        var p2 = el.dataStart;
        while (p2 + 8 <= el.dataEnd) {
          var entry = _ebmlElement(buf, p2);
          if (!entry || entry.id !== EBML_TRACKENTRY || entry.dataEnd > el.dataEnd || entry.dataEnd <= p2) break;
          var num = 0, type = 0;
          var p3 = entry.dataStart;
          while (p3 + 6 <= entry.dataEnd) {
            var c = _ebmlElement(buf, p3);
            if (!c || c.dataEnd > entry.dataEnd || c.dataEnd <= p3) break;
            var val = 0;
            for (var k = c.dataStart; k < c.dataEnd; k++) val = val * 256 + buf[k];
            if (c.id === EBML_TRACKNUMBER) num = val;
            if (c.id === EBML_TRACKTYPE) type = val;
            p3 = c.dataEnd;
          }
          if (type === 1 && num > 0) return num;
          p2 = entry.dataEnd;
        }
      }
      if (el.sizeUnknown) break;
      pos = el.dataEnd;
    }
    return 0;
  }

  /**
   * 扫描全部 Cluster，返回 {abs, pos, time}：
   *  - abs  = 文件绝对偏移
   *  - pos  = 相对 Segment 数据起点的偏移（CueClusterPosition 要这个值）
   *  - time = Cluster Timecode（CueTime）
   * Chrome 的 Cluster 长度是 unknown，不能靠 size 跳；改为按 ID 字节模式线性扫，
   * 并要求 ID 后紧跟合法 size vint + Timecode 元素，避免媒体数据里的偶然命中。
   */
  function _ebmlClusters(buf, seg) {
    var pat = [0x1F, 0x43, 0xB6, 0x75];
    var list = [];
    var end = Math.min(buf.length, seg.dataEnd);
    for (var p = seg.dataStart; p + 16 < end; p++) {
      if (buf[p] !== pat[0] || buf[p + 1] !== pat[1] || buf[p + 2] !== pat[2] || buf[p + 3] !== pat[3]) continue;
      var sz = _ebmlReadVint(buf, p + 4, false);
      if (!sz || p + 4 + sz.length + 2 >= end) continue;
      var q = p + 4 + sz.length;
      if (buf[q] !== EBML_TIMECODE) continue;
      var tsz = _ebmlReadVint(buf, q + 1, false);
      if (!tsz || tsz.value < 1 || tsz.value > 8) continue;
      var d0 = q + 1 + tsz.length;
      if (d0 + tsz.value > end) continue;
      var tc = 0;
      for (var i = d0; i < d0 + tsz.value; i++) tc = tc * 256 + buf[i];
      list.push({ abs: p, pos: p - seg.dataStart, time: tc });
      p = q; // 从 Timecode 处继续，Cluster 内数据不再误判
    }
    return list;
  }

  /**
   * 检测文件末尾是否已有 Cues。不能用「顺序遍历 Segment 子元素」——
   * Cluster 是未知长度，顺序遍历到第一个 Cluster 就断了，不能靠层级遍历。
   * 全文件按字节模式找 Cues ID，要求后跟合法 size vint 且首个子元素是 CuePoint(0xBB)，
   * 避免媒体数据里的偶然 4 字节命中。不再限定尾部——标准 muxer 会把 Cues 写在中段。
   */
  function _ebmlHasCues(buf) {
    var from = 0, p;
    while ((p = buf.indexOf(0x1C, from)) >= 0) {
      from = p + 1;
      if (p + 12 > buf.length) break;
      if (buf[p + 1] !== 0x53 || buf[p + 2] !== 0xBB || buf[p + 3] !== 0x6B) continue;
      var sz = _ebmlReadVint(buf, p + 4, false);
      if (!sz || sz.unknown || sz.value < 8) continue;
      var body = p + 4 + sz.length;
      if (body + sz.value > buf.length) continue;
      if (buf[body] !== 0xBB) continue;   // Cues 的第一个子元素必须是 CuePoint
      return true;
    }
    return false;
  }

  /**
   * 在文件末尾追加 Cues（Segment 是未知长度，末尾仍在 Segment 内，无需移动既有字节）。
   * 每个视频帧簇一个 CuePoint，播放器据此直接跳到目标秒对应的 Cluster。
   * 已有 Cues 时原样返回（幂等）。
   */
  function _ebmlAppendCues(buf) {
    if (_ebmlHasCues(buf)) return buf;
    var header = _ebmlElement(buf, 0);
    if (!header) return null;
    var seg = _ebmlElement(buf, header.dataEnd);
    if (!seg || seg.id !== EBML_SEGMENT) return null;
    var track = _ebmlVideoTrack(buf);
    if (!track) return null;
    var clusters = _ebmlClusters(buf, seg);
    if (!clusters.length) return null;

    var points = [];
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      var cueTime = _ebmlMake(new Uint8Array([0xB3]), _ebmlUInt(c.time));
      var cueTrack = _ebmlMake(new Uint8Array([0xF7]), _ebmlUInt(track));
      var cuePos = _ebmlMake(new Uint8Array([0xF1]), _ebmlUInt(c.pos));
      var positions = _ebmlMake(new Uint8Array([0xB7]), _ebmlJoin([cueTrack, cuePos]));
      var point = _ebmlMake(new Uint8Array([0xBB]), _ebmlJoin([cueTime, positions]));
      if (!cueTime || !cueTrack || !cuePos || !positions || !point) return null;
      points.push(point);
    }
    var cues = _ebmlMake(new Uint8Array([0x1C, 0x53, 0xBB, 0x6B]), _ebmlJoin(points));
    return cues ? _ebmlJoin([buf, cues]) : null;
  }

  /** 先补 Duration（Cluster 会整体后移 7 字节），再按最终偏移追加 Cues */
  function _ebmlPatchWebm(buf, durationMs) {
    var withDuration = _ebmlPatchDuration(buf, durationMs);
    if (!withDuration) return null;
    try {
      return _ebmlAppendCues(withDuration) || withDuration;
    } catch (e) {
      return withDuration;  // Cues 失败至少保住 Duration
    }
  }

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
      // 开录前读模式下拉（P1）：screen=教学区域（共享屏幕），video=仅人像（默认）
      var sel = document.getElementById('ctrl-record-mode');
      var mode = sel ? sel.value : 'video';
      this.start(mode);
      return true;
    },

    // ---------------- 开始 ----------------
    start: function (mode) {
      var self = this;
      mode = (mode === 'screen') ? 'screen' : 'video';
      this.mode = mode;
      this.recordExt = '.webm';   // 默认；_doStart 拿到 recorder.mimeType 后按实际容器覆盖
      var stream = this._pickStream(mode);
      // screen 模式 getDisplayMedia 返回 Promise：等用户授权后再开录
      if (stream && typeof stream.then === 'function') {
        stream.then(function (s) { self._doStart(s, mode); })
              .catch(function (e) {
                var msg = (e && e.name === 'NotAllowedError') ? '已取消共享，未开始录制' : ('无法共享教学区域：' + ((e && e.message) || e));
                self._toast(msg);
              });
        return;
      }
      if (!stream) {
        this._toast('没有可录制的内容（摄像头/麦克风未就绪）');
        return;
      }
      this._doStart(stream, mode);
    },

    /** 拿到录制流后的实际开录流程（mode 与 start 共用） */
    _doStart: function (stream, mode) {
      var self = this;
      if (!stream || !stream.getTracks || !stream.getTracks().length) {
        this._toast('没有可录制的内容（流为空）');
        return;
      }
      // 共享屏幕被浏览器/用户停止时自动收尾，不让记录悬在 RECORDING 状态
      if (mode === 'screen' && stream.getVideoTracks && stream.getVideoTracks().length) {
        var track = stream.getVideoTracks()[0];
        if (track && typeof track.addEventListener === 'function') {
          track.addEventListener('ended', function () {
            if (self.isRecording()) self.stop();
          });
        }
      }
      var capturedStream = stream;   // screen 模式是独占的共享流，失败时需主动释放
      this._lastStream = stream;
      this._api('start', mode).then(function (resp) {
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
          // 实际容器由浏览器决定：Chrome/Firefox 是 webm，Safari 18.3- 只会是 mp4。
          // 用 recorder.mimeType（而不是我们请求的 mime）定扩展名，后端按 key 推断
          // Content-Type 才不会把 MP4 当成 video/webm 发出去。
          self.recordExt = (/mp4/i.test(self.recorder.mimeType || '')) ? '.mp4' : '.webm';
        } catch (e) {
          self._toast('当前浏览器不支持录制：' + (e && e.message ? e.message : ''));
          self.recordingId = null;
          self._releaseStream(capturedStream, mode);
          return;
        }
        self.recorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size > 0) self.chunks.push(ev.data);
        };
        self.recorder.onstop = function () { self._onRecorderStop(); };
        self.recorder.start(1000); // 每秒切一块，避免长时间内存里攒一个巨大 blob
        self._tick();
        var hint = (mode === 'screen')
          ? '教学区域录制已开始（共享画面 + 系统声音，若需人声请开麦克风）'
          : (resp.notice || '人像录制已开始');
        self._toast(hint + '（学员端会看到录制提示）');
        self._updateUi(true);
      }).catch(function (e) {
        self._releaseStream(capturedStream, mode);
        self._toast('开始录制失败：' + ((e && e.message) || ''));
      });
    },

    /** screen 模式独占流，开录失败/录制结束时要 stop，否则浏览器共享指示器一直亮 */
    _releaseStream: function (stream, mode) {
      if (mode !== 'screen' || !stream || !stream.getTracks) return;
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
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
      var elapsedMs = this.startedAt ? (Date.now() - this.startedAt) : 0;
      this.chunks = [];
      this._releaseStream(this._lastStream, this.mode);
      this._lastStream = null;
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
      // 补 Duration + Cues 后再上传：Chrome 原生 webm 两样都没有，
      // 回放进度条显示 ∞ 且拖不动。修补失败一律降级为原文件，不能丢录制。
      this._withDuration(blob, elapsedMs).then(function (fixed) {
        self._toast('录制文件 ' + self._size(fixed.size) + '，开始上传…');
        return self._upload(fixed);
      }).then(function (ossKey) {
        return self._api('stop', { ossKey: ossKey });
      }).then(function () {
        self._toast('录制已保存，可在回放页观看');
        self.recordingId = null;
      }).catch(function (e) {
        self._toast('录制上传失败：' + ((e && e.message) || ''));
      });
    },

    /** 补 webm Duration + Cues；任何异常都原样返回 blob，保证上传链路不受影响 */
    _withDuration: function (blob, elapsedMs) {
      // MP4 自带 moov 里的时长和采样表，不需要也不该按 EBML 解析
      if (this.recordExt === '.mp4') return Promise.resolve(blob);
      if (!(elapsedMs > 1000) || typeof blob.arrayBuffer !== 'function') {
        return Promise.resolve(blob);
      }
      return blob.arrayBuffer().then(function (ab) {
        try {
          var fixed = _ebmlPatchWebm(new Uint8Array(ab), elapsedMs);
          return fixed ? new Blob([fixed], { type: 'video/webm' }) : blob;
        } catch (e) {
          return blob;
        }
      }).catch(function () { return blob; });
    },

    // ---------------- 分片上传 ----------------
    _upload: function (blob) {
      var self = this;
      var base = this.ctx.apiBaseUrl || '';
      // 扩展名跟随实际容器（见 _doStart 的 recordExt）；ext 进 oss_key 后，
      // FileAccessController.contentTypeOf() 自然返回 video/mp4 或 video/webm
      var fileName = 'recording-' + this.recordingId + (this.recordExt || '.webm');

      return this._postJson(urlOf(base, EP.UPLOAD_INIT), {
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
                urlOf(base, EP.UPLOAD_PART(init.uploadId, n)),
                blob.slice(start, end)
              ).then(function () {
                self.uploadProgress = Math.round(n * 100 / count);
                self._toast('上传中 ' + self.uploadProgress + '%');
              });
            });
          })(i);
        }
        return chain.then(function () {
          return self._postJson(urlOf(base, EP.UPLOAD_COMPLETE(init.uploadId)), {});
        });
      }).then(function (done) {
        return done.ossKey;
      });
    },

    // ---------------- HTTP ----------------
    _api: function (action, arg) {
      var base = this.ctx.apiBaseUrl || '';
      var root = urlOf(base, EP.CLASSROOM_RECORDING(this.ctx.scheduleId));
      if (action === 'start') {
        // captureMode 是「录什么」（video/screen），与后端 client/cloud 的 mode 不是一回事
        return this._postJson(root + '/start', { captureMode: arg || 'video' });
      }
      return this._postJson(root + '/' + encodeURIComponent(this.recordingId) + '/stop', arg || {});
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
    /**
     * 按模式取录制流：
     *  - video（默认）：本地摄像头+麦克风（原逻辑）
     *  - screen：getDisplayMedia 共享的屏幕/窗口（教学区域），返回 Promise
     */
    _pickStream: function (mode) {
      if (mode === 'screen') {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          this._toast('当前浏览器不支持共享屏幕录制（需 Chrome/Edge 且为 HTTPS）');
          return null;
        }
        return navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 15 },
          audio: true   // Chrome 共享标签页可带系统音频；整屏通常无声，UI 提示教师开麦
        });
      }
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
