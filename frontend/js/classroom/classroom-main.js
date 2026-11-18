/**
 * classroom-main.js —— 课堂主逻辑（初始化 / 角色适配 / 模块串联）
 *
 * 流程：
 *   1) 读取登录态（localStorage.currentUser）
 *   2) 确保课堂开关配置存在（无则补拉 /api/v1/eclassroom/config）
 *   3) guardClassroom() 课堂守卫
 *   4) POST /classrooms/{scheduleId}/enter 进入课堂
 *   5) GET  /classrooms/{scheduleId}/status 补课堂信息（后端 enter 不返回配置）
 *   6) 初始化 RTC / 白板 / 聊天 / 控制栏 / 角色模块
 *   7) 建立 WS 三通道并集中分发消息
 */
(function () {
  // 端点常量统一取自 shared/apiPaths.js（经 js/shared-domain-bridge.js 挂到 window.ApiPaths）。
  // classroom.html 必须先加载 shared-domain-bridge.js，否则 EP 为空 → URL 拼出 undefined。
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  // 课堂 URL 统一经 api.js 的 window.classroomUrl 归一化：apiBaseUrl 已含 /api/v1，
  // 而 EP 常量也自带 /api/v1，直接相加会拼出 /api/v1/api/v1/... → 404。
  var urlOf = function (base, path) {
    return typeof window.classroomUrl === 'function'
      ? window.classroomUrl(base, path) : (base || '') + path;
  };
  var ROLE_HOME = {
    admin: 'admin.html',
    teacher: 'teacher.html',
    student: 'student.html',
    platform_admin: 'platform_admin.html'
  };

  var ClassroomMain = {
    ctx: null,
    participants: {},
    hands: {},          // userId -> 是否举手（F4-14 教师批准开麦 UI 用）
    micGrants: {},      // userId -> 教师是否已批准开麦（F4-14，放下手自动撤销）
    wbGrants: {},       // userId -> 是否被授权编辑白板（F4-08）
    serverMuted: false, // 服务端全员禁言态（F4-17）
    classStatus: 'SCHEDULED', // 课堂真实状态（来自 /status 与服务端 class:state 广播），发布门禁的唯一前端依据
    leaving: false,

    run: function () {
      var self = this;
      var user = this._currentUser();
      if (!user || !user.role) { this._gotoLogin(); return; }

      var scheduleId = this._getParam('scheduleId');

      // 先确保课堂配置，再进入守卫（否则刷新页面时可能因配置缺失被误踢）
      this._ensureConfig(function () {
        if (typeof window.guardClassroom === 'function' && !window.guardClassroom()) return;
        if (!scheduleId) { self._gotoHome(user.role); return; }
        self._boot(user, scheduleId);
      });
    },

    _currentUser: function () {
      try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); }
      catch (e) { return null; }
    },

    _getParam: function (name) {
      try {
        var v = new URLSearchParams(window.location.search).get(name);
        return v && v.trim() ? v.trim() : '';
      } catch (e) { return ''; }
    },

    _ensureConfig: function (cb) {
      if (typeof window.hasClassroom === 'function' && window.hasClassroom()) { cb(); return; }
      var token = localStorage.getItem('token');
      if (!token || typeof window.request !== 'function') { cb(); return; }
      if (!EP.ECLASSROOM_CONFIG) { cb(); return; }
      window.request({ url: EP.ECLASSROOM_CONFIG, method: 'get' })
        .then(function (data) {
          if (data && typeof window.setEclassroomConfig === 'function') window.setEclassroomConfig(data);
        })
        .catch(function () { /* ignore，交由守卫判定 */ })
        .then(function () { cb(); });
    },

    _boot: function (user, scheduleId) {
      var self = this;
      var apiBaseUrl = (typeof window.getClassroomApiBaseUrl === 'function') ? window.getClassroomApiBaseUrl() : '';
      var ctx = {
        scheduleId: scheduleId,
        userId: user.userId,
        userName: user.name || user.account || user.userId,
        role: this._getParam('role') || user.role,
        tenantCode: user.tenantCode,
        apiBaseUrl: apiBaseUrl,
        token: user.token || localStorage.getItem('token') || ''
      };
      this.ctx = ctx;
      this._setStatus('connecting', '进入中...');

      var enterP = (window.ClassroomAPI && typeof window.ClassroomAPI.enterClassroom === 'function')
        ? window.ClassroomAPI.enterClassroom(apiBaseUrl, scheduleId, ctx.userName)
        : Promise.reject(new Error('ClassroomAPI 未加载'));

      enterP
        .then(function () { return self._loadStatus(apiBaseUrl, scheduleId); })
        .then(function (classroom) {
          // 课堂真实状态（此前写死 '进行中'，导致课前/暂停时前端仍以为能发布）
          self.classStatus = (classroom && classroom.status)
            ? String(classroom.status).toUpperCase() : 'SCHEDULED';
          self._renderHeader(classroom, ctx);
          // 先连 WS 再初始化模块（2026-11-16 C）：RTC 采集完成后要广播 rtc-peer-join，
          // 若 WS 尚未握手完成，sendSignal 会静默丢弃 → 对方不知道我存在 → 没人发 offer。
          // 提前建连 + onOpen 补发（见 _connectWS），两头兜住这条 join。
          self._connectWS(ctx);
          self._initModules(ctx);
          self._refreshMembers(apiBaseUrl, scheduleId);
          if (ctx.role === 'student') self._initMyAttendance(ctx);
          self._initUploadModal(ctx);
          self._initReplayEntry(ctx);
          self._bindBackButton();
          self._hidePlaceholder();
          self._applyGate();          // 按真实状态渲染徽标 + 下发各模块发布门禁
          self._hintManualStart(ctx);
        })
        .catch(function (e) {
          console.error('[ClassroomMain] 进入课堂失败', e);
          window.clToast((e && e.message) || '进入课堂失败，请稍后重试');
          self._setStatus('ended', '进入失败');
        });
    },

    _loadStatus: function (apiBaseUrl, scheduleId) {
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getClassroomStatus !== 'function') {
        return Promise.resolve(null);
      }
      return window.ClassroomAPI.getClassroomStatus(apiBaseUrl, scheduleId)
        .catch(function (e) { console.warn('[ClassroomMain] getStatus failed', e); return null; });
    },

    /**
     * 课堂状态改为显式修改后（2026-11-16）：服务端不再自动开课、也不自动下课，
     * 教师/管理员进页面时课堂通常还是 SCHEDULED，必须由人点底部「进行中」才会开课。
     * 没有这句提示，最容易的误判是「课堂坏了 / 学生进不来」，所以进入即给一句明确指引。
     */
    _hintManualStart: function (ctx) {
      if (!ctx || (ctx.role !== 'teacher' && ctx.role !== 'admin')) return;
      var st = String(this.classStatus || '').toUpperCase();
      if (st === 'LIVE' || st === 'CLOSED' || st === 'CANCELLED') return;
      window.clToast(st === 'PAUSED'
        ? '课堂已暂停，点底部「进行中」可继续'
        : '课堂未开始，点底部「进行中」即可开课（下课也需手动点「下课」）');
    },

    // ------------------------------------------------------------------
    // 课堂状态 / 发布门禁（口径与服务端 ClassroomPublishGuard 一致）
    // 前端只负责体验与本地拦截；真正的权威拦截在 signal / whiteboard 两个 WS 入口。
    // ------------------------------------------------------------------
    getStatus: function () { return this.classStatus; },

    isStaff: function () {
      var r = this.ctx && this.ctx.role;
      return r === 'teacher' || r === 'admin' || r === 'platform_admin';
    },

    /** 是否允许本端对外发布内容（音视频 / 白板 / 聊天）。状态控制类按钮不受此限 */
    canPublish: function () {
      if (this.classStatus === 'PAUSED') return false;   // 暂停：教师和学生都不发
      if (this.classStatus === 'LIVE') return true;      // 进行中：全员可发
      return this.isStaff();                             // 其余状态：仅教师/管理员可发
    },

    setClassStatus: function (status) {
      if (!status) return;
      var s = String(status).toUpperCase();
      if (s === this.classStatus) return;
      var prev = this.classStatus;
      var wasAllowed = this.canPublish();
      this.classStatus = s;
      this._applyGate();

      // 进入 LIVE 时【双方】都要重发 rtc-peer-join（2026-11-16 A）。
      // 为什么必须按「状态变化」而不是「能否发布」判断：教师是 staff，课前 canPublish()
      // 就已经是 true，旧的 `!wasAllowed` 条件对教师永远不成立 → 教师从课到课从不重发 join。
      // 而 offer 只由「收到对方 join 且 userId 字典序更大」的一方发起，教师恰好字典序较小时
      // 双方都不发 offer，P2P 永远建不起来 —— 学生端就看不到教师画面。
      var nowLive = (s === 'LIVE' && prev !== 'LIVE');
      if (nowLive) {
        if (this.ctx && this.ctx.role === 'student') {
          // 学生：课前的 join/offer 被服务端门禁丢弃、轨道也被门禁关过，重建媒体会话最干净
          if (window.ClassroomRTC && typeof window.ClassroomRTC.rejoin === 'function') {
            window.ClassroomRTC.rejoin();
          }
        } else if (window.ClassroomRTC) {
          // 教师/管理员：只补发 join，不重建引擎——重建会重新采集、打断正在播的本地画面。
          // 引擎还没进房（返回 false）时退回 rejoin 兜底。
          var sent = (typeof window.ClassroomRTC.broadcastJoin === 'function')
            ? window.ClassroomRTC.broadcastJoin() : false;
          if (sent === false && typeof window.ClassroomRTC.rejoin === 'function') {
            window.ClassroomRTC.rejoin();
          }
        }
        return;
      }

      // 其它「从不可发布恢复为可发布」的路径（如 PAUSED 恢复）仍按学生重建处理
      if (!wasAllowed && this.canPublish() && this.ctx && this.ctx.role === 'student'
          && window.ClassroomRTC && typeof window.ClassroomRTC.rejoin === 'function') {
        window.ClassroomRTC.rejoin();
      }
    },

    /** 状态变化后重渲染徽标，并把门禁下发给各模块（模块各自实现 applyGate） */
    _applyGate: function () {
      var allowed = this.canPublish();
      var status = this.classStatus;
      ['ClassroomControls', 'ClassroomChat', 'ClassroomWhiteboard', 'ClassroomRTC'].forEach(function (mod) {
        if (window[mod] && typeof window[mod].applyGate === 'function') {
          try { window[mod].applyGate(allowed, status); }
          catch (e) { console.warn('[ClassroomMain] applyGate ' + mod, e); }
        }
      });
      this._renderStatusBadge();
    },

    _renderStatusBadge: function () {
      var map = {
        LIVE: ['live', '进行中'], PAUSED: ['idle', '已暂停'],
        READY: ['idle', '待开课'], SCHEDULED: ['idle', '待开课'],
        CLOSED: ['ended', '已结束'], CANCELLED: ['ended', '已取消']
      };
      var v = map[this.classStatus] || ['idle', this.classStatus];
      this._setStatus(v[0], v[1]);
    },

    _renderHeader: function (classroom, ctx) {
      var title = document.getElementById('classroom-title');
      if (!title) return;
      if (!classroom) { title.textContent = '在线课堂'; return; }

      // 课次：scheduleId 是「排期~课次」复合键（第 1 课次为裸排期 id，第 2 课次起 "<id>~N"），
      // 与后端 ClassroomKey 同口径。不翻译的话标题里只剩一串 UUID。
      var sid = classroom.scheduleId || (ctx && ctx.scheduleId) || '';
      var idx = this._classIndexOf(sid);
      var base = (classroom.courseName || '在线课堂') + (idx > 1 ? ' · 第' + idx + '课次' : '');
      title.textContent = base;
      // classroom.teacherName 是主库密文（预约侧推事件时 user.name 未解密就落库了），
      // 直接拼进标题就是用户看到的那串乱码。先只渲染课程名，反查到明文再补" - 姓名"。
      if (classroom.teacherId) {
        this._briefs([classroom.teacherId]).then(function (map) {
          var b = map[classroom.teacherId];
          var who = (b && (b.account || b.name)) || '';
          if (who) title.textContent = base + ' - ' + who;
        });
      }
    },

    /** userId → {name, account} 缓存（库里的 display_name 可能是密文或被写成裸 userId） */
    _briefCache: {},

    /**
     * 批量反查用户明文（account 唯一可辨识优先，其次 name）。
     * 权威解在主服务 /api/v1/user/briefs（服务端解密后回明 name，account 仅管理员下发），
     * 与运营台 userBriefs 同源同口径；失败一律吞掉返回已有缓存，不影响主流程。
     */
    _briefs: function (ids) {
      var self = this;
      var uniq = [];
      (ids || []).forEach(function (id) {
        if (id && !self._briefCache[id] && uniq.indexOf(id) < 0) uniq.push(id);
      });
      if (!uniq.length || !EP.USER_BRIEFS || !window.request) return Promise.resolve(this._briefCache);
      return window.request({ url: EP.USER_BRIEFS(uniq), method: 'get', customErrorMsg: false })
        .then(function (list) {
          (list || []).forEach(function (b) { if (b && b.userId) self._briefCache[b.userId] = b; });
          return self._briefCache;
        })
        .catch(function () { return self._briefCache; });
    },

    /** 参与者面板名字统一换成反查到的明文（历史 display_name 已被污染） */
    _resolveNames: function () {
      var self = this;
      // 只对还没有缓存的 userId 发请求；全部命中缓存时直接返回，避免每次 join 都白重渲染一次
      var todo = Object.keys(this.participants).filter(function (id) {
        return id && !self._briefCache[id];
      });
      if (!todo.length) return;
      this._briefs(todo).then(function () { self._renderParticipants(); });
    },

    /** scheduleId 复合键取课次序号（与后端 ClassroomKey.classIndexOf 同口径，容错回落 1） */
    _classIndexOf: function (key) {
      var s = (key == null) ? '' : String(key);
      var i = s.indexOf('~');
      if (i < 0 || i === s.length - 1) return 1;
      var v = parseInt(s.slice(i + 1), 10);
      return (v > 0) ? v : 1;
    },

    _initModules: function (ctx) {
      if (window.ClassroomRTC) window.ClassroomRTC.init(ctx);
      if (window.ClassroomRecord) window.ClassroomRecord.init(ctx);
      if (window.ClassroomWhiteboard) window.ClassroomWhiteboard.init(ctx);
      if (window.ClassroomMaterial) window.ClassroomMaterial.init(ctx);
      // 面板布局放在白板/讲稿之后：它会读取已存布局并直接写内联定位，
      // 白板 init 里的首次 _resize 已按默认尺寸算过，随后 notifyResize 会再校正一次。
      if (window.ClassroomPanels) window.ClassroomPanels.init();
      // 视频焦点放大（点画面放大、其余缩到一列）：只作用于 #video-grid 内部，
      // 与上面的面板拖动/缩放各管一层，互不干扰。
      if (window.ClassroomVideoFocus) window.ClassroomVideoFocus.init();
      if (window.ClassroomChat) window.ClassroomChat.init(ctx);
      if (window.ClassroomTeacher) window.ClassroomTeacher.init(ctx);
      if (window.ClassroomStudent) window.ClassroomStudent.init(ctx);
      if (window.ClassroomAdmin) window.ClassroomAdmin.init(ctx);
      if (window.ClassroomControls) window.ClassroomControls.init(ctx);
    },

    _connectWS: function (ctx) {
      if (!window.ClassroomWS) { this._setStatus('idle', '信令未就绪'); return; }
      var self = this;
      try {
        window.ClassroomWS.connect(ctx.scheduleId, ctx.token, {
          userId: ctx.userId,
          onOpen: function () {
            window.clToast('已连接课堂');
            // 三通道都 OPEN 了，补发 rtc-peer-join（2026-11-16 C）：
            // 采集若早于握手完成，先前那条 join 已被 sendSignal 丢弃，这里补一次保证必达。
            if (window.ClassroomRTC && typeof window.ClassroomRTC.broadcastJoin === 'function') {
              window.ClassroomRTC.broadcastJoin();
            }
          },
          onClose: function (ch) { console.warn('[ClassroomMain] WS 关闭', ch); },
          onError: function (ch) { console.warn('[ClassroomMain] WS 错误', ch); },
          onHeartbeat: function () { /* 心跳保活 */ },
          onSignal: function (msg) { self._dispatchSignal(msg); },
          onWhiteboard: function (msg) {
            if (window.ClassroomWhiteboard) window.ClassroomWhiteboard.onMessage(msg);
          }
        });
      } catch (e) {
        console.warn('[ClassroomMain] WS connect failed', e);
        this._setStatus('idle', '信令连接失败');
      }
    },

    _dispatchSignal: function (msg) {
      if (!msg || !msg.type) return;
      // 转发给各角色模块（它们各自处理自身的权威消息）
      var MODULES = ['ClassroomRTC', 'ClassroomChat', 'ClassroomStudent', 'ClassroomTeacher', 'ClassroomWhiteboard', 'ClassroomMaterial'];
      var self = this;
      MODULES.forEach(function (mod) {
        if (window[mod] && typeof window[mod].onSignal === 'function') window[mod].onSignal(msg);
      });

      switch (msg.type) {
        case 'hand:state':
          // 举手被撤销（学生放下手 / 教师撤回）时同步清掉授权，防丢包导致下次"自动批准"
          if (!msg.raised) delete this.micGrants[msg.userId];
          this._markHand(msg.userId, msg.raised);
          break;
        case 'cam:state':
          this._markCamera(msg.userId, msg.on, msg.silent);
          break;
        case 'mute:state':
          this._setServerMute(msg.muted);
          break;
        case 'mic:grant':
          // 服务端权威开麦授权：举手期间有效，放下手/教师撤回/全员静音都会广播 granted=false
          var granted = msg.granted !== false;
          if (granted) this.micGrants[msg.userId] = true;
          else delete this.micGrants[msg.userId];
          // 教师撤回：举手一并清零，教师端该行按钮整体隐藏，需学生重新举手
          if (!granted && msg.reason === 'teacher_revoke') delete this.hands[msg.userId];
          this._renderParticipants();
          if (msg.userId === this.ctx.userId && window.ClassroomRTC) {
            if (granted) {
              window.ClassroomRTC.grantMic();
              if (!msg.silent) window.clToast('教师已允许你发言，麦克风已开启');
            } else {
              window.ClassroomRTC.revokeMic();
              if (msg.reason === 'teacher_revoke' && window.ClassroomStudent) {
                // 教师撤回 = 回到完全未举手的默认态（不是"待批准"）
                window.ClassroomStudent.setHandRaised(false);
                if (!msg.silent) window.clToast('老师已收回你的发言权，麦克风已关闭');
              } else if (msg.reason === 'mute_all') {
                if (!msg.silent) window.clToast('老师已开启全员静音，麦克风已关闭');
              }
              // hand_down：学生自己放下手，student 模块已给过提示，这里不再重复弹
            }
            // RTC 授权态已更新，重绘学生按钮三态（举手/等待批准/发言中）
            if (window.ClassroomStudent && typeof window.ClassroomStudent.refreshUI === 'function') {
              window.ClassroomStudent.refreshUI();
            }
          }
          break;
        case 'wb:grant:state':
          this._markWbGrant(msg.userId, msg.grant);
          break;
        case 'record:state':
          this._setRecording(!!msg.on);
          break;
        case 'rtc-peer-join':
          this._addParticipant(msg.from, msg.displayName || msg.name, msg.role);
          break;
        case 'rtc-peer-leave':
        case 'member-kicked':
          this._removeParticipant(msg.to || msg.from);
          break;
        case 'class-start':
        case 'class-resume':
          this.setClassStatus('LIVE');
          window.clToast(msg.type === 'class-resume' ? '课堂已恢复，可以开始互动' : '课堂已开始');
          break;
        case 'class-pause':
          this.setClassStatus('PAUSED');
          window.clToast('课堂已暂停：暂停期间全员都不能发送音视频、白板与聊天');
          break;
        case 'class:state':
          // 服务端权威状态广播（/start | /pause | /resume | /end 成功后推送）
          this.setClassStatus(msg.status);
          break;
        case 'publish:rejected':
          window.clToast(msg.status === 'PAUSED'
            ? '课堂已暂停，暂不能发布音视频、白板与聊天'
            : '课堂未开始/已结束，暂不能发布音视频、白板与聊天');
          break;
        case 'class-end':
          this.setClassStatus('CLOSED');
          window.clToast('课堂已结束');
          setTimeout(function () { self.leave(); }, 1200);
          break;
        default:
          break;
      }
    },

    // F4-14：服务端权威举手态 + 教师「批准开麦」入口
    _markHand: function (userId, raised) {
      this.hands[userId] = !!raised;
      var li = document.querySelector('#participant-list li[data-uid="' + this._cssEscape(userId) + '"]');
      if (li) li.classList.toggle('pt-hand', !!raised);
      this._renderParticipants();
    },

    // F4-03：服务端权威摄像头态（重连/迟到者也能收到）
    _markCamera: function (userId, on, silent) {
      var li = document.querySelector('#participant-list li[data-uid="' + this._cssEscape(userId) + '"]');
      if (li) li.classList.toggle('pt-cam-off', !on);
      // silent：进房默认关闭摄像头这种批量场景，只更新标记不弹提示（否则每进一个人全班都弹一条）
      if (silent) return;
      var b = this._briefCache[userId];
      var name = (b && (b.account || b.name))
        || (this.participants[userId] && this.participants[userId].name) || userId;
      this.toast(name + ' 摄像头已' + (on ? '开启' : '关闭'));
    },

    // F4-17：服务端权威全员禁言态（刷新/重连均生效，学生不可自解）
    _setServerMute: function (muted) {
      this.serverMuted = !!muted;
      var banner = document.getElementById('server-banner');
      if (banner) {
        if (muted) {
          banner.textContent = '全员禁言中';
          banner.classList.remove('hidden');
        } else {
          banner.classList.add('hidden');
        }
      }
      if (window.ClassroomRTC) window.ClassroomRTC.setServerMuted(!!muted);
      this.toast(muted ? '教师已开启全员静言' : '已解除全员静言');
    },

    // F4-08：白板协作授权态（教师授予学生编辑权）
    _markWbGrant: function (userId, grant) {
      this.wbGrants[userId] = !!grant;
      this._renderParticipants();
    },

    /**
     * F6 合规：录制中提示。
     * 学员端必须能明确看到「本节课正在录制」——这是合规底线，不能悄悄录。
     */
    _setRecording: function (on) {
      var banner = document.getElementById('record-banner');
      var text = document.getElementById('record-text');
      if (!banner) return;
      if (on) {
        banner.classList.remove('hidden');
        if (text) {
          text.textContent = this.ctx && this.ctx.role === 'student'
            ? '老师正在录制本堂课'
            : '录制中';
        }
      } else {
        banner.classList.add('hidden');
        var timer = document.getElementById('record-timer');
        if (timer) timer.textContent = '';
      }
    },

    toast: function (msg) {
      if (typeof window.clToast === 'function') window.clToast(msg);
      else console.log('[Main]', msg);
    },

    _bindBackButton: function () {
      var self = this;
      var btn = document.getElementById('btn-back');
      if (btn) {
        btn.addEventListener('click', function () {
          if (window.confirm('确定要离开课堂吗？')) self.leave();
        });
      }
      window.addEventListener('pagehide', function () { self._bestEffortLeave(); });
    },

    leave: function () {
      if (this.leaving) return;
      this.leaving = true;
      var self = this;
      var ctx = this.ctx || {};
      this._bestEffortLeave();
      setTimeout(function () { self._gotoHome(ctx.role); }, 150);
    },

    _bestEffortLeave: function () {
      var ctx = this.ctx || {};
      try {
        if (window.ClassroomRTC && typeof window.ClassroomRTC.leave === 'function') window.ClassroomRTC.leave();
      } catch (e) {}
      try {
        if (window.ClassroomWS && typeof window.ClassroomWS.disconnectAll === 'function') window.ClassroomWS.disconnectAll();
      } catch (e) {}
      try {
        if (window.ClassroomAPI && typeof window.ClassroomAPI.leaveClassroom === 'function' && ctx.scheduleId) {
          window.ClassroomAPI.leaveClassroom(ctx.apiBaseUrl, ctx.scheduleId);
        }
      } catch (e) {}
    },

    // ---- 参与者列表 ----
    _addParticipant: function (userId, name, role) {
      if (!userId) return;
      this.participants[userId] = { userId: userId, name: name || userId, role: role || '' };
      this._renderParticipants();
      this._renderCount();
      // 信令里带的名字也可能是密文/裸 userId（display_name 沿用了被污染的 currentUser.name），
      // 按 userId 反查权威明文后重渲染
      this._resolveNames();
    },

    _removeParticipant: function (userId) {
      if (!userId || !this.participants[userId]) return;
      delete this.participants[userId];
      this._renderParticipants();
      this._renderCount();
    },

    _renderParticipants: function () {
      var list = document.getElementById('participant-list');
      if (!list) return;
      var self = this;
      var ids = Object.keys(this.participants);
      var isTeacher = self.ctx && (self.ctx.role === 'teacher' || self.ctx.role === 'admin');
      list.innerHTML = ids.map(function (id) {
        var p = self.participants[id];
        // 名字以反查到的明文为准（display_name 可能是密文或裸 userId）
        var b = self._briefCache[id];
        var pname = (b && (b.account || b.name)) || p.name;
        var roleLabel = p.role === 'teacher' ? '教师' : (p.role === 'admin' ? '管理员' : '学生');
        var roleCls = p.role === 'teacher' ? 'pt-role-teacher' : (p.role === 'admin' ? 'pt-role-admin' : '');
        // F2-04：教师/管理员对学生可补签
        var adjustBtn = (isTeacher && p.role === 'student')
          ? '<button class="pt-adjust" data-uid="' + self._cssEscape(id) + '">补签</button>' : '';
        // F4-14：学生举手后，教师端「批准开麦」高亮；已批准显示绿色「已批准」，再点即收回
        var approved = !!self.micGrants[id];
        var approveBtn = (isTeacher && p.role === 'student' && self.hands[id])
          ? '<button class="pt-approve ' + (approved ? 'granted' : 'active') + '" data-uid="' + self._cssEscape(id)
            + '" title="' + (approved ? '点击收回该生发言权并取消其举手' : '批准该生发言') + '">'
            + (approved ? '已批准' : '批准开麦') + '</button>' : '';
        // F4-08：教师可授予/收回学生白板编辑权
        var grantBtn = (isTeacher && p.role === 'student')
          ? '<button class="pt-wbgrant' + (self.wbGrants[id] ? ' active' : '') + '" data-uid="' + self._cssEscape(id) + '">'
            + (self.wbGrants[id] ? '收回白板' : '授权白板') + '</button>' : '';
        return '<li data-uid="' + self._cssEscape(id) + '">' +
          '<span class="pt-avatar">' + self._initial(pname) + '</span>' +
          '<span>' + self._escape(pname) + '</span>' +
          '<span class="pt-role-tag ' + roleCls + '">' + roleLabel + '</span>' +
          adjustBtn + approveBtn + grantBtn +
          '</li>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('.pt-adjust'), function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-uid');
          var reason = window.prompt('请输入补签原因：');
          if (reason === null) return;
          self._doManualAdjust(self.ctx.apiBaseUrl, self.ctx.scheduleId, uid, reason);
        });
      });
      // F4-14：教师点「批准开麦」→ 广播 granted:true；已批准态再点 → granted:false 收回发言权
      Array.prototype.forEach.call(list.querySelectorAll('.pt-approve'), function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-uid');
          var approved = !!self.micGrants[uid];
          if (window.ClassroomWS) {
            window.ClassroomWS.sendSignal(self.ctx.scheduleId, {
              type: 'hand:approve', userId: uid, granted: !approved
            });
          }
          var who = (self.participants[uid] && self.participants[uid].name) || uid;
          self.toast(approved ? ('已收回 ' + who + ' 的发言权') : ('已批准 ' + who + ' 发言'));
        });
      });
      // F4-08：教师授予/收回白板编辑权 → 广播 wb:grant:state
      Array.prototype.forEach.call(list.querySelectorAll('.pt-wbgrant'), function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-uid');
          var grant = !self.wbGrants[uid];
          if (window.ClassroomWS) {
            window.ClassroomWS.sendSignal(self.ctx.scheduleId, { type: 'wb:grant', userId: uid, grant: grant });
          }
        });
      });
    },

    _renderCount: function () {
      var n = document.getElementById('participant-count');
      if (n) n.textContent = Object.keys(this.participants).length;
    },

    // F1-06：进入课堂后加载全名单渲染参与者面板（修复此前只显示自己、看不到同学的问题）
    _refreshMembers: function (apiBaseUrl, scheduleId) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMembers !== 'function') {
        self._addParticipant(self.ctx.userId, self.ctx.userName, self.ctx.role);
        return;
      }
      window.ClassroomAPI.getMembers(apiBaseUrl, scheduleId)
        .then(function (list) {
          self.participants = {};
          (list || []).forEach(function (m) {
            self.participants[m.userId] = {
              userId: m.userId,
              name: m.displayName || m.userId,
              role: m.role
            };
          });
          self._renderParticipants();
          self._renderCount();
          // 名单里的 displayName 可能是密文/裸 userId，反查权威明文后重渲染
          self._resolveNames();
        })
        .catch(function () {
          self._addParticipant(self.ctx.userId, self.ctx.userName, self.ctx.role);
        });
    },

    // F2-04：教师补签（原因由 prompt 录入，操作人由后端从 token 取）
    _doManualAdjust: function (apiBaseUrl, scheduleId, userId, reason) {
      var self = this;
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.manualAdjust !== 'function') return;
      window.ClassroomAPI.manualAdjust(apiBaseUrl, scheduleId, userId, reason)
        .then(function () {
          window.clToast('已补签：' + (self.participants[userId] ? self.participants[userId].name : userId));
        })
        .catch(function (e) { window.clToast((e && e.message) || '补签失败'); });
    },

    // F4-15 / F5-01：学生上传作业（文字走 JSON，语音/图片/文件走真上传 ≤100MB）
    _initUploadModal: function (ctx) {
      var self = this;
      var modal = document.getElementById('upload-modal');
      var closeBtn = document.getElementById('upload-close');
      var submitBtn = document.getElementById('upload-submit');
      var typeEl = document.getElementById('upload-type');
      var fileEl = document.getElementById('upload-file');
      var progressEl = document.getElementById('upload-progress');

      // 文字类型不需要文件，切换时收放文件选择器减少误解
      if (typeEl && fileEl) typeEl.addEventListener('change', function () {
        var isText = String(typeEl.value).toUpperCase() === 'TEXT';
        fileEl.style.display = isText ? 'none' : '';
      });

      if (closeBtn) closeBtn.addEventListener('click', function () {
        if (modal) modal.classList.add('hidden');
      });

      if (submitBtn) submitBtn.addEventListener('click', function () {
        var type = typeEl ? String(typeEl.value).toUpperCase() : 'TEXT';
        var contentEl = document.getElementById('upload-content');
        var durationEl = document.getElementById('upload-duration');
        var content = contentEl ? contentEl.value : '';
        var durationSec = durationEl && durationEl.value ? Number(durationEl.value) : null;
        var file = fileEl && fileEl.files ? fileEl.files[0] : null;

        if (type === 'TEXT') {
          if (!content || !content.trim()) { self.toast('请填写文字内容'); return; }
          if (!window.ClassroomAPI || typeof window.ClassroomAPI.submitWork !== 'function') {
            self.toast('提交接口未就绪'); return;
          }
          window.ClassroomAPI.submitWork(ctx.apiBaseUrl, ctx.scheduleId, {
            submissionType: 'TEXT', content: content, durationSec: durationSec
          })
            .then(function () {
              self.toast('作业已提交');
              if (modal) modal.classList.add('hidden');
            })
            .catch(function (e) { self.toast((e && e.message) || '提交失败'); });
          return;
        }

        if (!file) { self.toast('请选择要上传的文件'); return; }
        if (file.size > 100 * 1024 * 1024) { self.toast('文件超过 100MB 上限'); return; }
        self._uploadSubmission(ctx, file, type, content, durationSec, progressEl, modal);
      });
    },

    /** 真上传：XHR（要进度）+ multipart；上传成功后服务端落对象存储并返回签名 URL */
    _uploadSubmission: function (ctx, file, type, content, durationSec, progressEl, modal) {
      var self = this;
      var url = urlOf(ctx.apiBaseUrl, EP.CLASSROOM_SUBMISSION_FILE(ctx.scheduleId));
      var form = new FormData();
      form.append('file', file);
      form.append('submissionType', type);
      if (content) form.append('content', content);
      if (durationSec) form.append('durationSec', String(durationSec));

      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      if (ctx.token) xhr.setRequestHeader('Authorization', 'Bearer ' + ctx.token);
      xhr.upload.onprogress = function (e) {
        if (!progressEl) return;
        progressEl.classList.remove('hidden');
        progressEl.textContent = e.lengthComputable
          ? '上传中 ' + Math.round(e.loaded * 100 / e.total) + '%'
          : '上传中…';
      };
      xhr.onload = function () {
        if (progressEl) progressEl.classList.add('hidden');
        if (xhr.status >= 200 && xhr.status < 300) {
          self.toast('作业已提交');
          if (modal) modal.classList.add('hidden');
        } else {
          self.toast('提交失败（' + xhr.status + '）');
        }
      };
      xhr.onerror = function () {
        if (progressEl) progressEl.classList.add('hidden');
        self.toast('上传失败，请检查网络');
      };
      xhr.send(form);
    },

    // F6-03：课堂回放入口（新窗口打开，避免回放打断正在进行的课堂）
    _initReplayEntry: function (ctx) {
      var btn = document.getElementById('btn-replay');
      if (!btn) return;
      btn.addEventListener('click', function () {
        window.open('replay.html?scheduleId=' + encodeURIComponent(ctx.scheduleId), '_blank');
      });
    },

    // F2-07：学生端「我的出勤」入口初始化
    _initMyAttendance: function (ctx) {
      var self = this;
      var btn = document.getElementById('btn-my-attendance');
      var modal = document.getElementById('my-attendance-modal');
      var closeBtn = document.getElementById('mam-close');
      if (btn) btn.classList.remove('hidden');
      if (closeBtn) closeBtn.addEventListener('click', function () {
        if (modal) modal.classList.add('hidden');
      });
      if (btn) btn.addEventListener('click', function () { self._showMyAttendance(ctx); });
    },

    _showMyAttendance: function (ctx) {
      var self = this;
      var modal = document.getElementById('my-attendance-modal');
      var listEl = document.getElementById('mam-list');
      if (!modal || !listEl) return;
      modal.classList.remove('hidden');
      listEl.innerHTML = '<li class="mam-loading">加载中...</li>';
      if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMyAttendanceHistory !== 'function') {
        listEl.innerHTML = '<li>出勤接口未就绪</li>'; return;
      }
      window.ClassroomAPI.getMyAttendanceHistory(ctx.apiBaseUrl)
        .then(function (rows) {
          if (!rows || !rows.length) { listEl.innerHTML = '<li class="mam-empty">暂无出勤记录</li>'; return; }
          var statusMap = { ABSENT: '缺席', PRESENT: '出勤', LATE: '迟到', LEFT: '离开', REJOINED: '重连' };
          listEl.innerHTML = rows.map(function (r) {
            var status = statusMap[r.attendanceStatus] || r.attendanceStatus || '-';
            var time = r.checkInAt ? String(r.checkInAt).replace('T', ' ') : '-';
            var mins = (r.effectiveMinutes != null) ? (r.effectiveMinutes + ' 分钟') : '-';
            return '<li><span>' + self._escape(r.courseName || r.scheduleId) + '</span>' +
              '<span>' + self._escape(time) + '</span>' +
              '<span>' + self._escape(status) + '</span>' +
              '<span>' + self._escape(mins) + '</span></li>';
          }).join('');
        })
        .catch(function (e) {
          listEl.innerHTML = '<li class="mam-empty">加载失败：' + self._escape((e && e.message) || '') + '</li>';
        });
    },

    _setStatus: function (kind, text) {
      var badge = document.getElementById('classroom-status');
      var label = document.getElementById('classroom-status-text');
      if (badge) badge.className = 'cl-status cl-status-' + kind;
      if (label) label.textContent = text;
    },

    _hidePlaceholder: function () {
      var ph = document.getElementById('main-placeholder');
      if (ph) ph.classList.add('hidden');
    },

    _gotoHome: function (role) {
      var file = ROLE_HOME[role] || 'login.html';
      window.location.href = (typeof window.pageUrl === 'function') ? window.pageUrl(file) : './' + file;
    },

    _gotoLogin: function () {
      window.location.href = (typeof window.pageUrl === 'function') ? window.pageUrl('login.html') : './login.html';
    },

    _initial: function (name) {
      if (!name) return '?';
      return String(name).charAt(0).toUpperCase();
    },

    _escape: function (s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    _cssEscape: function (s) {
      if (s == null) return '';
      return String(s).replace(/["\\]/g, '\\$&');
    }
  };

  // 全局 toast
  window.clToast = function (msg) {
    var el = document.getElementById('cl-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cl-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.style.display = 'none'; }, 2600);
  };

  window.ClassroomMain = ClassroomMain;

  window.onload = function () { ClassroomMain.run(); };
})();