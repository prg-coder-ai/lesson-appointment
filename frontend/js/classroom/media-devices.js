/**
 * media-devices.js —— 本地音视频设备能力与选择（课前准备页 + 课堂页共用）
 *
 * 设计要点：
 *  1. 只依赖浏览器原生 API，不依赖任何 RTC 引擎 —— 课前页没有引擎也能做预检；
 *  2. 设备选择存在 localStorage，课前页选好、课堂页引擎启动时读取并应用；
 *  3. deviceId 只在「当前浏览器 + 当前授权会话」内稳定：清缓存/换浏览器会变，
 *     所以加载偏好时按 deviceId 匹配，匹配不到再按 label 兜底，仍失败则回退默认设备；
 *  4. device.label 只有在 getUserMedia 授权成功后才非空 —— 必须先采集再枚举；
 *  5. 音视频分离采集：任一设备缺失/被占用不应连累另一路（旧实现 video+audio 一个 Promise 全废）。
 *
 * 对外：window.ClassroomMediaDevices（避开与原生 navigator.mediaDevices 同名）
 */
(function () {
  'use strict';

  var PREF_KEY = 'classroomMediaPrefs';

  /** 把浏览器错误翻成可读中文 + 自救建议 */
  function describeError(err, kind) {
    var name = (err && (err.name || err.code)) || '';
    var what = kind === 'audio' ? '麦克风' : '摄像头';
    var map = {
      NotAllowedError: '浏览器拒绝了该设备的权限，请点击地址栏的锁形图标允许使用' + what + '，然后重试',
      PermissionDeniedError: '浏览器拒绝了该设备的权限，请点击地址栏的锁形图标允许使用' + what + '，然后重试',
      SecurityError: '当前页面不是安全上下文，音视频采集要求 HTTPS 或 localhost',
      NotFoundError: '未检测到' + what + '，请确认设备已连接',
      DevicesNotFoundError: '未检测到' + what + '，请确认设备已连接',
      NotReadableError: what + '被其他程序占用（或系统层面被禁用），请关闭占用它的软件后重试',
      TrackStartError: what + '被其他程序占用（或系统层面被禁用），请关闭占用它的软件后重试',
      OverconstrainedError: '所选' + what + '不可用（可能已被拔出），已回退到系统默认设备',
      ConstraintNotSatisfiedError: '所选' + what + '不可用（可能已被拔出），已回退到系统默认设备',
      AbortError: what + '启动被中断，请重试',
      TypeError: '当前浏览器不支持音视频采集，请换用新版 Chrome / Edge / Safari'
    };
    var msg = map[name] || (what + '采集失败' + (name ? '（' + name + '）' : ''));
    return { code: name || 'Unknown', message: msg, kind: kind };
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isSecure() {
    return !!(window.isSecureContext || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  }

  function readPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return {
        audioInputId: p.audioInputId || '',
        videoInputId: p.videoInputId || '',
        audioLabel: p.audioLabel || '',
        videoLabel: p.videoLabel || ''
      };
    } catch (e) {
      return { audioInputId: '', videoInputId: '', audioLabel: '', videoLabel: '' };
    }
  }

  function writePrefs(p) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        audioInputId: p.audioInputId || '',
        videoInputId: p.videoInputId || '',
        audioLabel: p.audioLabel || '',
        videoLabel: p.videoLabel || ''
      }));
    } catch (e) { /* 隐私模式下 localStorage 不可用，忽略 */ }
  }

  /** 按当前已枚举设备把偏好解析成「真正可用的 deviceId」，找不到就回退默认 */
  function resolvePrefs(devices) {
    var want = readPrefs();
    var audios = (devices && devices.audioinput) || [];
    var videos = (devices && devices.videoinput) || [];

    function resolve(list, id, label) {
      if (!id) return '';
      var hit = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].deviceId && list[i].deviceId === id) { hit = list[i]; break; }
      }
      // deviceId 变了但 label 还在（换浏览器/清权限后常见）→ 用 label 兜底
      if (!hit && label) {
        for (var j = 0; j < list.length; j++) {
          if (list[j].label && list[j].label === label) { hit = list[j]; break; }
        }
      }
      return hit ? hit.deviceId : '';
    }

    var out = {
      audioInputId: resolve(audios, want.audioInputId, want.audioLabel),
      videoInputId: resolve(videos, want.videoInputId, want.videoLabel),
      audioLabel: want.audioLabel,
      videoLabel: want.videoLabel
    };
    // 偏好失效时写回清空，避免每次都做无谓的 exact 约束导致 OverconstrainedError
    if (want.audioInputId && !out.audioInputId) { out.audioInputId = ''; out.audioLabel = ''; writePrefs(out); }
    if (want.videoInputId && !out.videoInputId) { out.videoInputId = ''; out.videoLabel = ''; writePrefs(out); }
    return out;
  }

  /** 枚举设备：先确保有权限（label 才非空），再按 kind 分组 */
  function enumerate() {
    var empty = { audioinput: [], videoinput: [], audiooutput: [], error: null };
    if (!supported()) {
      empty.error = isSecure()
        ? '当前浏览器不支持音视频采集，请换用新版 Chrome / Edge / Safari'
        : '当前页面不是 HTTPS/localhost，浏览器禁用了设备枚举';
      return Promise.resolve(empty);
    }
    return navigator.mediaDevices.enumerateDevices()
      .then(function (list) {
        list.forEach(function (d) {
          if (!d || !empty[d.kind]) return;
          empty[d.kind].push({
            deviceId: d.deviceId || '',
            label: d.label || '',
            groupId: d.groupId || ''
          });
        });
        return empty;
      })
      .catch(function (e) {
        empty.error = '设备枚举失败：' + (e && e.name ? e.name : '未知错误');
        return empty;
      });
  }

  /** 构造单路约束；exact 指定设备，无偏好时用 true */
  function constraints(deviceId) {
    if (!deviceId) return true;
    return { deviceId: { exact: deviceId } };
  }

  /**
   * 分离采集音视频：两路各自 Promise，互不连累。
   * 选中设备失效（OverconstrainedError）时自动清偏好并回退默认重试一次。
   * 返回 { stream, audioOk, videoOk, errors: [] }，stream 一定是单个 MediaStream（合并两路 track）。
   */
  function capture(prefs, opts) {
    prefs = prefs || {};
    opts = opts || {};
    var result = {
      stream: (typeof MediaStream === 'function') ? new MediaStream() : null,
      audioOk: false, videoOk: false, errors: []
    };
    if (!supported()) {
      result.errors.push(describeError({ name: isSecure() ? 'TypeError' : 'SecurityError' }, 'audio'));
      result.errors.push(describeError({ name: isSecure() ? 'TypeError' : 'SecurityError' }, 'video'));
      return Promise.resolve(result);
    }
    if (!result.stream) {
      result.errors.push(describeError({ name: 'TypeError' }, 'audio'));
      return Promise.resolve(result);
    }

    function one(kind, devId) {
      var c = {};
      c[kind] = constraints(devId);
      return navigator.mediaDevices.getUserMedia(c)
        .then(function (s) { return { ok: true, stream: s, kind: kind }; })
        .catch(function (err) {
          // 精确约束失败（设备被拔出 / deviceId 失效）→ 清偏好并用默认设备再试一次
          var isConstraint = /Overconstrained|ConstraintNotSatisfied/.test((err && err.name) || '');
          if (isConstraint && devId) {
            var p = readPrefs();
            if (kind === 'audio') { p.audioInputId = ''; p.audioLabel = ''; }
            else { p.videoInputId = ''; p.videoLabel = ''; }
            writePrefs(p);
            var fallback = {};
            fallback[kind] = true;
            return navigator.mediaDevices.getUserMedia(fallback)
              .then(function (s) { return { ok: true, stream: s, kind: kind, fallback: true }; })
              .catch(function (e2) { return { ok: false, error: describeError(e2, kind) }; });
          }
          return { ok: false, error: describeError(err, kind) };
        });
    }

    var jobs = [];
    if (opts.audio !== false) jobs.push(one('audio', prefs.audioInputId));
    if (opts.video !== false) jobs.push(one('video', prefs.videoInputId));

    return Promise.all(jobs).then(function (outs) {
      outs.forEach(function (o) {
        if (!o.ok) { result.errors.push(o.error); return; }
        var tracks = (o.stream && o.stream.getTracks) ? o.stream.getTracks() : [];
        tracks.forEach(function (t) { result.stream.addTrack(t); });
        if (o.kind === 'audio') result.audioOk = tracks.length > 0;
        if (o.kind === 'video') result.videoOk = tracks.length > 0;
      });
      return result;
    });
  }

  /** 停止并清空一个流的所有轨道（预检页离开 / 切换设备时用） */
  function stop(stream) {
    if (stream && stream.getTracks) stream.getTracks().forEach(function (t) {
      try { t.stop(); } catch (e) {}
    });
  }

  /** 麦克风电平检测：返回 stop() 函数，把 0~1 电平交给回调（用于预检可视化） */
  function monitorLevel(stream, onLevel) {
    if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) return function () {};
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return function () {};
    var ac = null, raf = 0, closed = false;
    try {
      ac = new AC();
      var src = ac.createMediaStreamSource(stream);
      var analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      var buf = new Uint8Array(analyser.frequencyBinCount);
      (function tick() {
        if (closed) return;
        analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) {
          var v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = window.requestAnimationFrame(tick);
      })();
    } catch (e) {
      return function () {};
    }
    return function () {
      closed = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (ac) { try { ac.close(); } catch (e) {} }
    };
  }

  window.ClassroomMediaDevices = {
    supported: supported,
    isSecure: isSecure,
    describeError: describeError,
    enumerate: enumerate,
    capture: capture,
    resolvePrefs: resolvePrefs,
    readPrefs: readPrefs,
    writePrefs: writePrefs,
    stop: stop,
    monitorLevel: monitorLevel
  };
})();
