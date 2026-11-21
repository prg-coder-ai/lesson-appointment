/**
 * 课程准备页（2026-11-13）
 *
 * 教师端「今日课程」里未开始的课次点「课程准备」进这里：课前把讲稿传好、看一眼名单，
 * 再一键进入课堂。它是 classroom.html 的**课前轻量版**，不复用整套课堂 UI
 * （进课堂要建立成员名单、开摄像头，课前用不上）。
 *
 * URL：classroom-prep.html?scheduleId=<课次标识>（第 1 课次裸 id，第 2 起 sid~N）
 *      &mode=student 时为学生「课前准备」模式（见下），缺省为教师「课程准备」。
 * 依赖：axios / utility_request / shared-domain-bridge / api.js / feature-flags /
 *       my-classroom-core.js（讲稿面板、同步课堂、阶段判定）/ media-devices.js（设备枚举与预检）
 *
 * 双模式（2026-11-14）：
 *  - 教师：教学资料 + 课堂信息（含成员名单）+ 设备检测与选择，另有「同步课堂」。
 *  - 学生 mode=student：**只显示「设备检测与选择」「课堂信息」两个栏目**，隐藏教学资料 /
 *    成员名单 / 同步课堂；标题为「课前准备」。用于课前设备准备与测试，无写操作。
 *
 * 权限：/status 与 /members 走 ClassroomAccessGuard，有有效预约的学生也可读；但课前课堂
 * 常常尚未创建（40401），所以学生模式的「课堂信息」优先用 URL 带来的课次元数据渲染，
 * 不依赖课堂服务，status 只作状态覆盖。成员名单/讲稿对学生无意义且会在未创建时报错，
 * 故学生模式不调用。
 *
 * 设备预检：枚举并选择麦克风/摄像头，实时预览 + 麦克风电平，选择写入 localStorage
 * （media-devices.js 的偏好），进入课堂后由 RTC 引擎读取生效。
 */
(function () {
  'use strict';

  function core() {
    return window.MyClassroomCore || null;
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (e) {
      return '';
    }
  }

  function apiBase() {
    return (typeof window.getClassroomApiBaseUrl === 'function') ? (window.getClassroomApiBaseUrl() || '') : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showHint(msg) {
    var hint = document.getElementById('prep-hint');
    if (!hint) return;
    if (!msg) { hint.style.display = 'none'; hint.textContent = ''; return; }
    hint.style.display = 'block';
    hint.textContent = msg;
  }

  // 课堂状态枚举（classroom-service：SCHEDULED → READY → LIVE → CLOSED / CANCELLED）
  var STATUS_TEXT = {
    SCHEDULED: '待开始',
    READY: '待开课',
    LIVE: '上课中',
    PAUSED: '已暂停',
    CLOSED: '已结束',
    CANCELLED: '已取消'
  };

  function statusLabel(s) {
    if (!s) return '未创建';
    return STATUS_TEXT[String(s).toUpperCase()] || s;
  }

  /** URL 携带的课次时间格式化（口径同 core.fmtTime，不依赖 core 是否加载完成） */
  function fmtMetaTime(v) {
    if (!v) return '';
    var s = String(v).replace('T', ' ');
    return s.length >= 16 ? s.slice(0, 16) : s;
  }

  /** scheduleId 复合键取课次序号（与后端 ClassroomKey / classroom-main.js 同口径，容错回落 1） */
  function classIndexOf(key) {
    var s = (key == null) ? '' : String(key);
    var i = s.indexOf('~');
    if (i < 0 || i === s.length - 1) return 1;
    var v = parseInt(s.slice(i + 1), 10);
    return (v > 0) ? v : 1;
  }

  /**
   * 「课次标识」可读化（2026-11-17）：与在线课堂标题同一口径——
   *   有课程名 → 「课程名 · 第N课次」（第 1 课次只给课程名，与 _renderHeader 一致）；
   *   无课程名 → 至少给「第N课次」，绝不留一长串 UUID。
   * 原始 key 放 title，排障/复制仍取得到。
   */
  function renderClassKey(key, courseName) {
    var el = document.getElementById('kv-key');
    if (!el) return;
    var idx = classIndexOf(key);
    el.textContent = courseName
      ? (String(courseName) + (idx > 1 ? ' · 第' + idx + '课次' : ''))
      : ('第' + idx + '课次');
    el.title = String(key || '');
  }

  function phaseLabel(phase) {
    return phase === 'live' ? '进行中' : (phase === 'past' ? '已结束' : (phase === 'upcoming' ? '未开始' : '—'));
  }

  var Prep = {
    key: '',
    sid: '',
    student: false,          // mode=student：学生课前准备（只留设备检测 + 课堂信息）
    _devStream: null,        // 预检用的采集流（离开页面必须 stop，避免占用设备）
    _stopLevel: null,        // 电平监测停止函数
    _devBusy: false,
    _probeDone: false,       // 是否已用默认设备取过一次权限（label 只有授权后才有）

    /**
     * 入口：先过课堂开关，再启动页面（2026-11-20）。
     *
     * 本页原来完全不看租户是否开通课堂 —— 未开通租户的教师/学生拿到历史链接、书签、
     * 或消息里残留的链接，仍能打开设备检测页，点「进入课堂」才被 classroom-service 的
     * AuthInterceptor 403 拦住（表现是"半路被踢"）。
     *
     * 顺序刻意是「先核对、再判」：localStorage 里的 eclassroomConfig 可能是上一次会话的快照
     * （平台刚禁用 / 刚开通），直接按它判会闪一下再跳或漏拦。核对失败（未登录 / 网络）时
     * guardClassroom 不会踢人，交给页面自身的登录守卫处理。
     */
    run: function () {
      var self = this;
      var gate = function () {
        if (typeof window.guardClassroom === 'function' && !window.guardClassroom()) return;
        self.doRun();
      };
      if (typeof window.ensureClassroomConfig === 'function') {
        window.ensureClassroomConfig(true).then(gate).catch(gate);
        return;
      }
      gate();
    },

    doRun: function () {
      this.key = param('scheduleId');
      this.student = param('mode') === 'student';
      if (!this.key) {
        showHint('缺少课次标识（URL 需要 ?scheduleId=）。请从「'
          + (this.student ? '我的课堂' : '今日课程') + '」列表重新进入。');
        return;
      }
      // 课次标识里 ~ 前面就是裸排期 id（第 1 课次本身不带 ~）
      this.sid = this.key.split('~')[0];

      // 先按课次序号渲染（此刻还没有课程名）；/status 回来后再刷成「课程名 · 第N课次」
      renderClassKey(this.key, '');
      if (this.student) this.applyStudentMode();
      this.bind();
      this.loadStatus();
      // 学生模式不拉讲稿/成员名单：课前课堂未创建时这两个接口只会报错，且与学生无关
      if (!this.student) { this.loadMembers(); this.loadMaterials(); }
      this.initDevices();
      // 离开页面释放采集，否则进课堂时设备还被本页占用（NotReadableError）
      var self = this;
      window.addEventListener('pagehide', function () { self.releaseDevices(); });
      window.addEventListener('beforeunload', function () { self.releaseDevices(); });
    },

    /**
     * 学生课前准备模式：栏目收窄到「设备检测与选择」「课堂信息」两张卡片。
     * 课堂信息用 URL 带来的课次元数据先渲染 —— 课前 classroom 行常不存在，
     * 这时 /status 会 40401，若等接口回显，学生看到的会是一片「—」加报错。
     */
    applyStudentMode: function () {
      document.documentElement.classList.add('prep-student');  // 兜底（head 内联脚本已打标）
      document.title = '课前准备';
      var heading = document.getElementById('prep-heading');
      if (heading) heading.innerHTML = '<i class="fas fa-sliders-h"></i> 课前准备';

      var start = fmtMetaTime(param('start'));
      var end = fmtMetaTime(param('end'));
      if (start) setText('kv-time', start + (end ? ' ~ ' + end.slice(11) : ''));
      var st = param('state');
      if (st) setText('kv-status', { upcoming: '待开始', ongoing: '上课中', finished: '已结束' }[st] || st);

      var idx = param('idx');
      var total = param('total');
      setText('prep-title', idx
        ? ('第 ' + idx + (total ? '/' + total : '') + ' 次课 · 课前设备准备')
        : '课前设备准备');
      showHint('此页用于课前检测麦克风与摄像头、选择要使用的设备；选择会保存在本机，进入课堂时自动生效。');
    },

    // ------------------------------------------------------------------
    // 设备预检
    // ------------------------------------------------------------------

    initDevices: function () {
      var self = this;
      var MD = window.ClassroomMediaDevices;
      if (!MD) {
        this.devMsg('设备模块未加载，请刷新页面重试。', true);
        return;
      }
      if (!MD.supported() || !MD.isSecure()) {
        this.devMsg(MD.isSecure()
          ? '当前浏览器不支持音视频采集，请换用新版 Chrome / Edge / Safari。'
          : '当前页面不是 HTTPS/localhost，浏览器禁用了音视频设备。请改用 HTTPS 访问。', true);
        this.devOverall('不可用', false);
        return;
      }

      var audioSel = document.getElementById('dev-audio');
      var videoSel = document.getElementById('dev-video');
      if (audioSel) audioSel.addEventListener('change', function () { self.onSelect('audio', audioSel.value); });
      if (videoSel) videoSel.addEventListener('change', function () { self.onSelect('video', videoSel.value); });
      var recheck = document.getElementById('dev-recheck');
      if (recheck) recheck.addEventListener('click', function () { self.checkDevices(true); });

      // 设备热插拔：重新枚举并刷新下拉，不打断当前预览
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', function () { self.checkDevices(false); });
      }
      this.checkDevices(true);
    },

    /** 用户选定设备 → 存偏好（同时存 label 便于 deviceId 失效时兜底）→ 重新采集该路 */
    onSelect: function (kind, deviceId) {
      var MD = window.ClassroomMediaDevices;
      if (!MD) return;
      var p = MD.readPrefs();
      var list = this._devList ? (this._devList[kind === 'audio' ? 'audioinput' : 'videoinput'] || []) : [];
      var label = '';
      for (var i = 0; i < list.length; i++) {
        if (list[i].deviceId === deviceId) { label = list[i].label || ''; break; }
      }
      if (kind === 'audio') { p.audioInputId = deviceId; p.audioLabel = label; }
      else { p.videoInputId = deviceId; p.videoLabel = label; }
      MD.writePrefs(p);
      this.checkDevices(true);
    },

    /** 枚举 + 分离采集 + 预览。doCapture=false 时只刷新下拉（devicechange 用，不打断预览） */
    checkDevices: function (doCapture) {
      var self = this;
      var MD = window.ClassroomMediaDevices;
      if (!MD || this._devBusy) return;
      this._devBusy = true;
      this.devOverall('检测中…', null);

      // 首次：用「系统默认设备」采集一次只为取权限 —— device.label 只有授权成功后才非空，
      // 故必须先采集再枚举。这次不能带任何 exact 偏好（否则会把用户已存偏好误判失效）。
      var probe = this._probeDone
        ? Promise.resolve(null)
        : MD.capture({ audioInputId: '', videoInputId: '' }, { audio: true, video: true })
          .then(function (r) { MD.stop(r.stream); self._probeDone = true; return r; });

      probe
        .then(function () { return MD.enumerate(); })
        .then(function (dev) {
          self._devList = dev;
          // 先校正偏好（deviceId 失效 → 按 label 兜底或回退默认并写回），再渲染下拉，
          // 否则失效值会先被选中，用户看到的选择与真正采集的设备不一致。
          var prefs = MD.resolvePrefs(dev);
          self.renderSelects(dev);
          if (dev.error && !doCapture) self.devMsg(dev.error, true);
          if (!doCapture) { self._devBusy = false; return null; }
          return MD.capture(prefs, { audio: true, video: true })
            .then(function (r) { self.applyCapture(r); self._devBusy = false; return null; });
        })
        .catch(function (e) {
          self.devMsg('设备检测异常：' + ((e && e.message) || e), true);
          self.devOverall('检测失败', false);
          self._devBusy = false;
        });
    },

    renderSelects: function (dev) {
      var MD = window.ClassroomMediaDevices;
      var prefs = MD ? MD.readPrefs() : { audioInputId: '', videoInputId: '' };
      this.fillSelect('dev-audio', dev.audioinput || [], prefs.audioInputId, '麦克风');
      this.fillSelect('dev-video', dev.videoinput || [], prefs.videoInputId, '摄像头');
    },

    fillSelect: function (id, list, selected, kindName) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var html = '<option value="">系统默认</option>';
      var seen = {};
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (!d.deviceId || d.deviceId === 'default' || seen[d.deviceId]) continue;
        seen[d.deviceId] = true;
        html += '<option value="' + esc(d.deviceId) + '"' + (d.deviceId === selected ? ' selected' : '') + '>'
          + esc(d.label || (kindName + ' ' + (i + 1))) + '</option>';
      }
      sel.innerHTML = html;
    },

    applyCapture: function (r) {
      var self = this;
      this.releaseDevices();
      this._devStream = r.stream;
      var video = document.getElementById('dev-preview');
      if (video) {
        video.srcObject = r.videoOk ? r.stream : null;
        video.style.opacity = r.videoOk ? '1' : '0.35';
      }
      this.setState('dev-audio-state', r.audioOk, r.audioOk ? '正常' : '不可用');
      this.setState('dev-video-state', r.videoOk, r.videoOk ? '正常' : '不可用');
      if (r.audioOk && window.ClassroomMediaDevices) {
        var bar = document.getElementById('dev-level');
        this._stopLevel = window.ClassroomMediaDevices.monitorLevel(r.stream, function (v) {
          if (bar) bar.style.width = Math.round(v * 100) + '%';
        });
      }
      var msgs = [];
      if (r.audioOk) msgs.push('麦克风正常，对着说话可看到上方绿色电平条。');
      if (r.videoOk) msgs.push('摄像头预览已开启。');
      (r.errors || []).forEach(function (e) { msgs.push('<span class="err">' + esc(e.message) + '</span>'); });
      if (!msgs.length) msgs.push('未检测到可用设备。');
      msgs.push('选择结果已保存，进入课堂时自动生效。');
      this.devMsgHtml(msgs.join('<br>'));
      var overall = (r.audioOk && r.videoOk) ? '全部正常' : ((r.audioOk || r.videoOk) ? '部分可用' : '不可用');
      this.devOverall(overall, r.audioOk || r.videoOk);
    },

    releaseDevices: function () {
      if (this._stopLevel) { try { this._stopLevel(); } catch (e) {} this._stopLevel = null; }
      if (this._devStream && window.ClassroomMediaDevices) window.ClassroomMediaDevices.stop(this._devStream);
      this._devStream = null;
      var bar = document.getElementById('dev-level');
      if (bar) bar.style.width = '0';
    },

    setState: function (id, ok, text) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.className = 'dev-state ' + (ok ? 'ok' : 'bad');
    },
    devOverall: function (text, ok) {
      var el = document.getElementById('dev-overall');
      if (!el) return;
      el.textContent = text;
      el.className = 'dev-state ' + (ok === null ? '' : (ok ? 'ok' : 'bad'));
    },
    devMsg: function (text, isErr) {
      var el = document.getElementById('dev-msg');
      if (!el) return;
      el.innerHTML = isErr ? '<span class="err">' + esc(text) + '</span>' : esc(text);
    },
    devMsgHtml: function (html) {
      var el = document.getElementById('dev-msg');
      if (el) el.innerHTML = html;
    },

    bind: function () {
      var self = this;
      var back = document.getElementById('btn-back');
      if (back) back.addEventListener('click', function () {
        // 有历史就回退（保留列表筛选/页码），否则回角色首页
        if (window.history && window.history.length > 1) window.history.back();
        else window.location.href = self.student ? './student.html' : './teacher.html';
      });

      var enter = document.getElementById('btn-enter');
      if (enter) enter.addEventListener('click', function () {
        // 关键：进课堂前释放预检采集，否则设备仍被本页占用 → 课堂页 NotReadableError
        self.releaseDevices();
        window.location.href = (typeof window.pageUrl === 'function')
          ? window.pageUrl('classroom.html', { scheduleId: self.key })
          : './classroom.html?scheduleId=' + encodeURIComponent(self.key);
      });

      var sync = document.getElementById('btn-sync');
      // 学生模式隐藏「同步课堂」（该操作属教师/管理端），也不绑定事件
      if (sync && !self.student) sync.addEventListener('click', async function () {
        sync.disabled = true;
        var old = sync.innerHTML;
        sync.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中…';
        var r = await core().syncClassrooms(self.sid);
        sync.disabled = false;
        sync.innerHTML = old;
        showHint(r.ok ? (r.msg + '（稍等几秒后点此页刷新查看）') : ('同步失败：' + r.msg));
      });
    },

    /** 课堂状态：时间 + 是否已创建（课堂不存在时提示同步） */
    loadStatus: function () {
      var self = this;
      var statusEl = document.getElementById('kv-status');
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getClassroomStatus !== 'function') {
        // 学生模式已用 URL 元数据渲染课堂信息，接口缺失不影响设备检测
        if (statusEl) statusEl.textContent = self.student ? '待开课' : '课堂接口未加载';
        return;
      }
      window.ClassroomAPI.getClassroomStatus(apiBase(), this.key)
        .then(function (res) {
          if (!res) { if (statusEl) statusEl.textContent = self.student ? '待开课' : '未创建'; return; }
          if (statusEl) statusEl.textContent = statusLabel(res.status);
          if (res.startTime || res.endTime) {
            var s = fmtMetaTime(res.startTime);
            var e = fmtMetaTime(res.endTime);
            setText('kv-time', (s || '') + (e ? ' ~ ' + e : ''));
          }
          if (res.courseName) {
            setText('prep-title', self.student ? (res.courseName + ' · 课前设备准备') : res.courseName);
            // 课次标识与在线课堂标题同口径：课程名 + 课次序号，不再显示 UUID
            renderClassKey(self.key, res.courseName);
          }
        })
        .catch(function (e) {
          // 40401 = 课堂不存在：课前最常见（排期还没推送到课堂服务）。
          // 学生课前准备的目的是测设备，不该因为课堂未创建就显示教师版的「同步课堂/上传讲稿」提示。
          if (self.student) {
            if (statusEl) statusEl.textContent = '待开课（尚未创建）';
            showHint('课堂尚未开课，不影响设备检测：现在可先测试麦克风/摄像头，到上课时间再点「进入课堂」。');
            return;
          }
          if (statusEl) statusEl.textContent = '未创建';
          showHint('该课次的课堂尚未创建（' + core().errText(e) + '）。点右上角「同步课堂」推送到课堂服务后即可上传讲稿。');
        });
    },

    /** 成员名单（进过课堂的人；课前可能为空） */
    loadMembers: function () {
      if (this.student) return;   // 学生模式隐藏成员名单，不发这个请求
      var host = document.getElementById('member-host');
      if (!host) return;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMembers !== 'function') {
        host.textContent = '课堂接口未加载';
        return;
      }
      window.ClassroomAPI.getMembers(apiBase(), this.key)
        .then(function (list) {
          var arr = Array.isArray(list) ? list : (list && list.rows) || [];
          if (!arr.length) {
            host.innerHTML = '<span style="color:#999;">暂无成员（学生进入课堂后才会出现在名单里）</span>';
            return;
          }
          var html = '';
          arr.forEach(function (m) {
            // Membership 实体的名字字段是 displayName（不是 userName/name）
            var name = m.displayName || m.userId || '未知';
            var role = (m.role === 'teacher' || m.role === 'admin') ? '教师' : '学生';
            html += '<div class="member">'
              + '<span class="avatar">' + esc(String(name).charAt(0)) + '</span>'
              + '<span>' + esc(name) + '</span>'
              + '<span class="role">' + esc(role) + (m.kicked ? ' · 已移出' : '') + '</span>'
              + '</div>';
          });
          host.innerHTML = html;
        })
        .catch(function (e) {
          host.innerHTML = '<span style="color:#b42318;">名单读取失败：' + esc(core().errText(e)) + '</span>';
        });
    },

    /** 讲稿面板（复用我的课堂同一套：列表 + 上传） */
    loadMaterials: function () {
      if (this.student) return;   // 学生模式不显示教学资料，不拉讲稿列表
      var host = document.getElementById('material-host');
      if (!host) return;
      if (!core()) { host.textContent = '课堂核心脚本未加载，请刷新页面重试。'; return; }
      core().renderMaterialPanel(host, this.key, 'teacher', { scheduleId: this.sid });
    }
  };

  window.ClassroomPrep = Prep;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Prep.run(); });
  } else {
    Prep.run();
  }
})();
