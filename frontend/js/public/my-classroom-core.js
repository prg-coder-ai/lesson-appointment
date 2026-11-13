/**
 * 「我的课堂」共享核心（2026-11-13）
 *
 * 教师端 / 学生端两个页面共用同一套「排期 → 课次 → 资料/回放/进课堂」渲染与取数逻辑，
 * 差异只在**数据源**（教师：本人排期；学生：本人预约）与**可做的动作**（教师可上传，
 * 学生只读）。把核心放这里，避免两个页面各自实现一遍后悄悄分叉。
 *
 * 依赖（页面需先行加载）：
 *   window.request                       js/public/utility_request.js
 *   window.ApiPaths.ENDPOINTS            js/shared-domain-bridge.js
 *   window.ClassroomAPI                  js/public/api.js
 *   window.hasClassroom/ensureClassroomConfig/getClassroomApiBaseUrl   js/public/feature-flags.js
 *
 * 课次标识（classroomKey）由服务端给出：第 1 课次为裸 scheduleId，第 2 课次起 `sid~N`
 * （见 api 侧 common/ClassroomKey 与课堂侧 ClassroomKey）。**前端不要自己拼这个串**——
 * 拼错（如把第 1 课次写成 sid~1）会被课堂服务当成另一堂课，表现为「课堂不存在」。
 */
(function () {
  'use strict';

  // 见 api.js#window.classroomUrl：避免 apiBaseUrl(/api/v1) + EP(/api/v1/...) 双前缀 404
  var urlOf = function (base, path) {
    return typeof window.classroomUrl === 'function'
      ? window.classroomUrl(base, path) : (base || '') + path;
  };

  // ---------- 小工具 ----------

  // 端点别名（守卫 check:endpoints 按此形态识别「本文件的端点来源」，勿改成函数返回）
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function apiBase() {
    return (typeof window.getClassroomApiBaseUrl === 'function') ? (window.getClassroomApiBaseUrl() || '') : '';
  }

  function pageUrl(name, params) {
    if (typeof window.pageUrl === 'function') return window.pageUrl(name, params);
    var qs = '';
    if (params) {
      qs = '?' + Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
    }
    return './' + name + qs;
  }

  /** "2026-11-13 20:00:00" → "2026-11-13 20:00" */
  function fmtTime(v) {
    if (!v) return '—';
    var s = String(v).replace('T', ' ');
    return s.length >= 16 ? s.slice(0, 16) : s;
  }

  var STATE_TEXT = { upcoming: '未开始', ongoing: '进行中', finished: '已结束' };

  function stateText(st) {
    return STATE_TEXT[st] || '未开始';
  }

  function stateTagHtml(st) {
    var color = st === 'ongoing' ? '#1a7f37' : (st === 'finished' ? '#6b7280' : '#1f6feb');
    var bg = st === 'ongoing' ? '#e7f6ec' : (st === 'finished' ? '#f2f4f7' : '#eaf2ff');
    return '<span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;color:'
      + color + ';background:' + bg + ';">' + esc(stateText(st)) + '</span>';
  }

  function toast(msg) {
    if (typeof window.clToast === 'function') { window.clToast(msg); return; }
    if (typeof window.showApiError === 'function') { window.showApiError(msg); return; }
    // 兜底：不打断页面
    try { window.alert(msg); } catch (e) { /* ignore */ }
  }

  function errText(e) {
    if (!e) return '未知错误';
    return e.bodyMsg || e.message || e.msg || '请求失败';
  }

  // ---------- 课堂开关 / 课次取数 ----------

  /** 课堂是否开通（本地缺失时主动补拉一次权威配置） */
  async function ensureEnabled() {
    if (typeof window.hasClassroom === 'function' && window.hasClassroom()) return true;
    if (typeof window.ensureClassroomConfig === 'function') {
      var cfg = await window.ensureClassroomConfig();
      return !!(cfg && cfg.enabled === true);
    }
    return false;
  }

  /** 拉取某排期的课次实例（服务端 ScheduleInstances 展开）；失败返回 null */
  async function loadInstances(scheduleId) {
    var url = EP.SCHEDULE_CLASS_INSTANCES
      ? EP.SCHEDULE_CLASS_INSTANCES(scheduleId)
      : '/schedule/class-instances/' + encodeURIComponent(scheduleId);
    try {
      var res = await window.request({ url: url, method: 'GET', customLoading: false });
      return Array.isArray(res) ? res : [];
    } catch (e) {
      return null;
    }
  }

  /** 补推课堂事件（课堂服务里还没有这些课次时用）；返回 {ok, msg} */
  async function syncClassrooms(scheduleId) {
    var url = EP.SCHEDULE_CLASS_SYNC
      ? EP.SCHEDULE_CLASS_SYNC(scheduleId)
      : '/schedule/class-instances/' + encodeURIComponent(scheduleId) + '/sync';
    try {
      var res = await window.request({ url: url, method: 'POST', customLoading: false });
      return { ok: true, msg: '已发起同步，课程服务会为每个课次创建课堂' };
    } catch (e) {
      return { ok: false, msg: errText(e) };
    }
  }

  // ---------- 讲稿 / 回放 / 进课堂 ----------

  /** 讲稿列表；失败（多为课堂尚未创建）返回 {ok:false,msg} */
  async function listMaterials(key) {
    if (!window.ClassroomAPI || typeof window.ClassroomAPI.getMaterials !== 'function') {
      return { ok: false, msg: '课堂接口未加载' };
    }
    try {
      var list = await window.ClassroomAPI.getMaterials(apiBase(), key);
      return { ok: true, list: Array.isArray(list) ? list : [] };
    } catch (e) {
      return { ok: false, msg: errText(e) };
    }
  }

  /** 上传讲稿（multipart 直传，≤100MB）；用已登记的端点常量，不硬编码路径 */
  async function uploadMaterial(key, file) {
    var max = 100 * 1024 * 1024;
    if (file.size > max) return { ok: false, msg: '文件超过 100MB，请拆分或压缩后再传' };
    var path = EP.CLASSROOM_MATERIAL_FILE
      ? EP.CLASSROOM_MATERIAL_FILE(key)
      : '/classrooms/' + encodeURIComponent(key) + '/materials/file';
    var form = new FormData();
    form.append('file', file);
    try {
      var res = await window.request({ url: urlOf(apiBase(), path), method: 'POST', data: form });
      return { ok: true, data: res };
    } catch (e) {
      return { ok: false, msg: errText(e) };
    }
  }

  /** 回放地址（往期课次）；无录制/失败返回 {ok:false} */
  async function getPlayback(key) {
    if (!window.ClassroomAPI || typeof window.ClassroomAPI.getPlaybackUrl !== 'function') {
      return { ok: false, msg: '课堂接口未加载' };
    }
    try {
      var res = await window.ClassroomAPI.getPlaybackUrl(apiBase(), key);
      var url = (res && (res.url || res.playbackUrl || res.signedUrl)) || (typeof res === 'string' ? res : '');
      if (!url) return { ok: false, msg: '该课次暂无可回放的录制' };
      return { ok: true, url: url };
    } catch (e) {
      return { ok: false, msg: errText(e) };
    }
  }

  /** 进入课堂页（key 为课次标识） */
  function enterClassroom(key) {
    if (!key) { toast('缺少课次标识'); return; }
    window.location.href = pageUrl('classroom.html', { scheduleId: key });
  }

  /** 课程回看（课堂回放页；无录制时该页自己会提示，不必先探一次） */
  function openReplay(key) {
    if (!key) { toast('缺少课次标识'); return; }
    window.location.href = pageUrl('replay.html', { scheduleId: key });
  }

  /** 教师课前准备页（讲稿 + 名单 + 开课入口） */
  function openPrep(key) {
    if (!key) { toast('缺少课次标识'); return; }
    window.location.href = pageUrl('classroom-prep.html', { scheduleId: key });
  }

  // ---------- 课次键 / 阶段判定 ----------

  /**
   * 由排期 id + 课次序号生成课次标识（**与后端 ClassroomKey.of 逐字同规则**）。
   *
   * 只在「手里只有 appointment 行（scheduleId + classIndex）」的场景使用；
   * 凡是服务端已经下发 classroomKey 的地方，一律直接用服务端的值。
   * 规则：classIndex 为 null / ≤1 → 裸 id（历史数据与第 1 课次都存裸 id）。
   */
  function classroomKeyOf(scheduleId, classIndex) {
    if (!scheduleId) return '';
    var idx = Number(classIndex);
    if (!idx || idx <= 1) return String(scheduleId);
    return scheduleId + '~' + idx;
  }

  /**
   * 宽松解析后端返回的上课时间，得到 UTC 毫秒时间戳。
   *
   * 关键口径：`appointment.appointmentDatetime` 是**UTC 裸串**（不带时区后缀），
   * 前端渲染时才用 DatetimeDomain.utcToZoned 转成用户时区（见 appointmentNotes.js 的
   * renderLessonTime，它兜底文案还会拼 "(-UTC)"）。所以这里必须按 UTC 解析，
   * 不能按本地时间解析 —— 否则东八区会整体偏 8 小时，出现「课已结束却显示进入课程」。
   */
  function parseUtcLoose(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    var s = String(v).trim();
    // 显式时区（Z / +08:00）→ 交给引擎
    if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      var t1 = Date.parse(s);
      if (!isNaN(t1)) return t1;
    }
    // 裸串（后端 UTC 墙钟）：按 UTC 解析
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    }
    var t2 = Date.parse(s);
    return isNaN(t2) ? NaN : t2;
  }

  /**
   * 课次阶段：'past' 已结束 / 'live' 进行中 / 'upcoming' 未开始 / 'unknown' 时间缺失。
   *
   * @param {*} rawDatetime      appointment.appointmentDatetime（UTC 裸串）
   * @param {*} durationMinutes  课时分钟数（取排期 classDuration，缺失按 60）
   */
  function classroomPhase(rawDatetime, durationMinutes) {
    var start = parseUtcLoose(rawDatetime);
    if (isNaN(start)) return 'unknown';
    var dur = Number(durationMinutes);
    if (!(dur > 0)) dur = 60;
    var now = Date.now();
    if (now >= start + dur * 60000) return 'past';
    if (now >= start) return 'live';
    return 'upcoming';
  }

  /** 该预约状态是否还该给课堂入口（已取消/拒绝/删除的不给） */
  var NON_CLASSROOM_STATUS = {
    cancelled: 1, canceled: 1, cancelling: 1, canceling: 1,
    reject: 1, 'rej-booking': 1, delete: 1, deleted: 1, frozen: 1, waiting: 1,
    't-cancelled': 1, 't-reject': 1, 't-cancelling': 1
  };

  function isClassroomEligible(status) {
    if (!status) return true;
    return !NON_CLASSROOM_STATUS[String(status)];
  }

  /**
   * 今日课程行内课堂按钮组（学生 / 教师共用一套规则，只是教师多一个「课程准备」）。
   *
   * | 阶段 | 学生 | 教师 |
   * |---|---|---|
   * | 未开始 upcoming | 进入课程 | 课程准备 + 进入课程 |
   * | 进行中 live     | 进入课程 | 进入课程 |
   * | 已结束 past     | 课程回看 | 课程回看 |
   *
   * 按钮用 onclick 调 window.ClassroomEntry.*（不在本文件声明同名全局函数，
   * 避免与页面内联脚本的同名函数互相覆盖）。
   */
  function buildEntryButtons(opts) {
    var o = opts || {};
    var key = o.classroomKey;
    var role = o.role;
    var phase = o.phase;
    var status = o.status;
    if (!key) return '';
    if (!isClassroomEligible(status)) return '';

    // 教室未开通时不误导用户点进去（页面里 hasClassroom 未定义时按开通处理，交给课堂服务判定）
    var enabled = (typeof window.hasClassroom === 'function') ? window.hasClassroom() : true;
    if (!enabled && !o.ignoreSwitch) return '';

    var btn = function (label, icon, action, extraStyle) {
      return '<button type="button" class="btn btn-success" style="margin-left:6px;' + (extraStyle || '')
        + '" onclick="window.ClassroomEntry.' + action + "('" + String(key).replace(/'/g, "\\'") + "')\">"
        + (icon ? '<i class="' + icon + '"></i> ' : '') + label + '</button>';
    };

    var out = '';
    if (phase === 'past') {
      out += btn('课程回看', 'fa fa-history', 'replay', 'background:#6b7280;border-color:#6b7280;color:#fff;');
    } else if (phase === 'live') {
      out += btn('进入课程', 'fa fa-video-camera', 'enter');
    } else if (phase === 'upcoming') {
      if (role === 'teacher') {
        out += btn('课程准备', 'fa fa-clipboard-list', 'prep', 'background:#1f6feb;border-color:#1f6feb;color:#fff;');
      }
      out += btn('进入课程', 'fa fa-video-camera', 'enter');
    }
    return out;
  }

  // ---------- 渲染：课次表 ----------

  /**
   * 渲染课次表格到 host 容器。
   *
   * @param {HTMLElement} host   容器
   * @param {Array} instances    服务端课次数组
   * @param {string} role        'teacher' | 'student'
   * @param {Object} scheduleRef 排期信息（用于「整期资料」入口与同步按钮）
   */
  function renderInstanceTable(host, instances, role, scheduleRef) {
    if (!host) return;
    var isTeacher = role === 'teacher';

    if (!instances) {
      host.innerHTML = '<div class="mc-empty" style="padding:16px;color:#b42318;">课次加载失败，请稍后重试。</div>';
      return;
    }
    if (!instances.length) {
      host.innerHTML = '<div class="mc-empty" style="padding:16px;color:#999;">该排期没有可展开的课次（检查排期的重复规则与结束日期）。</div>';
      return;
    }

    var html = '';
    html += '<div style="border:1px solid #e3e6ea;border-radius:6px;overflow:hidden;margin:8px 0 4px;">';
    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fafbfc;border-bottom:1px solid #eef0f3;font-size:12.5px;">';
    html += '<strong>课次列表</strong><span style="color:#6b7280;">共 ' + instances.length + ' 次</span>';
    html += '<span style="flex:1;"></span>';
    html += '<button type="button" class="btn btn-default btn-sm" data-mc="whole-materials" style="padding:3px 9px;font-size:12px;">整期资料</button>';
    if (isTeacher) {
      html += '<button type="button" class="btn btn-default btn-sm" data-mc="sync" style="padding:3px 9px;font-size:12px;margin-left:6px;">同步课堂</button>';
    }
    html += '</div>';
    html += '<table width="100%" style="font-size:12.5px;border-collapse:collapse;">';
    html += '<thead><tr style="color:#6b7280;background:#fff;">'
      + '<th style="text-align:left;padding:7px 10px;width:12%;">课次</th>'
      + '<th style="text-align:left;padding:7px 10px;width:34%;">上课时间</th>'
      + '<th style="text-align:left;padding:7px 10px;width:12%;">状态</th>'
      + '<th style="text-align:left;padding:7px 10px;width:14%;">教学资料</th>'
      + '<th style="text-align:center;padding:7px 10px;width:28%;">操作</th>'
      + '</tr></thead><tbody data-mc="rows"></tbody></table>';
    html += '</div>';
    host.innerHTML = html;

    var tbody = host.querySelector('[data-mc="rows"]');
    instances.forEach(function (ins) {
      var tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #f2f4f7';

      var tdIdx = document.createElement('td');
      tdIdx.style.padding = '7px 10px';
      tdIdx.textContent = '第 ' + ins.classIndex + '/' + (ins.classCount || instances.length) + ' 次';
      tr.appendChild(tdIdx);

      var tdTime = document.createElement('td');
      tdTime.style.padding = '7px 10px';
      tdTime.textContent = fmtTime(ins.startTime) + ' ~ ' + (fmtTime(ins.endTime).slice(11) || '');
      tr.appendChild(tdTime);

      var tdState = document.createElement('td');
      tdState.style.padding = '7px 10px';
      tdState.innerHTML = stateTagHtml(ins.state);
      tr.appendChild(tdState);

      var tdMat = document.createElement('td');
      tdMat.style.padding = '7px 10px';
      var matBtn = document.createElement('button');
      matBtn.type = 'button';
      matBtn.className = 'btn btn-default';
      matBtn.style.cssText = 'padding:3px 9px;font-size:12px;';
      matBtn.textContent = isTeacher ? '资料 / 上传' : '查看资料';
      tdMat.appendChild(matBtn);
      tr.appendChild(tdMat);

      var tdOps = document.createElement('td');
      tdOps.style.padding = '7px 10px';
      tdOps.style.textAlign = 'center';

      var isPast = ins.state === 'finished';
      if (!isPast || isTeacher) {
        var enterBtn = document.createElement('button');
        enterBtn.type = 'button';
        enterBtn.className = 'btn btn-success';
        enterBtn.style.cssText = 'padding:3px 11px;font-size:12px;background:#28a745;border-color:#28a745;color:#fff;';
        enterBtn.textContent = '进入课堂';
        enterBtn.addEventListener('click', function () { enterClassroom(ins.classroomKey); });
        tdOps.appendChild(enterBtn);
      }
      if (isPast && !isTeacher) {
        var replayBtn = document.createElement('button');
        replayBtn.type = 'button';
        replayBtn.className = 'btn btn-default';
        replayBtn.style.cssText = 'padding:3px 11px;font-size:12px;';
        replayBtn.textContent = '回放';
        replayBtn.addEventListener('click', async function () {
          replayBtn.disabled = true;
          var old = replayBtn.textContent;
          replayBtn.textContent = '查询中…';
          var r = await getPlayback(ins.classroomKey);
          replayBtn.disabled = false;
          replayBtn.textContent = old;
          if (!r.ok) { toast(r.msg); return; }
          window.open(r.url, '_blank');
        });
        tdOps.appendChild(replayBtn);
      }
      if (isPast && isTeacher) {
        var span = document.createElement('span');
        span.style.cssText = 'margin-left:8px;color:#999;font-size:12px;';
        span.textContent = '已结束';
        tdOps.appendChild(span);
      }
      tr.appendChild(tdOps);

      tbody.appendChild(tr);

      // 资料面板行（初始隐藏，点「资料」时才创建内容）
      var panelTr = document.createElement('tr');
      panelTr.style.display = 'none';
      var panelTd = document.createElement('td');
      panelTd.colSpan = 5;
      panelTd.style.cssText = 'padding:0;background:#fcfcfd;';
      panelTr.appendChild(panelTd);
      tbody.appendChild(panelTr);

      matBtn.addEventListener('click', function () {
        var shown = panelTr.style.display !== 'none';
        if (shown) { panelTr.style.display = 'none'; return; }
        panelTr.style.display = '';
        renderMaterialPanel(panelTd, ins.classroomKey, role, scheduleRef);
      });
    });

    // 整期资料（排期级 key = 裸 scheduleId）
    var wholeBtn = host.querySelector('[data-mc="whole-materials"]');
    if (wholeBtn) {
      wholeBtn.addEventListener('click', function () {
        var box = host.querySelector('[data-mc="whole-panel"]');
        if (box) { box.parentNode.removeChild(box); return; }
        var wrap = document.createElement('div');
        wrap.setAttribute('data-mc', 'whole-panel');
        wrap.style.cssText = 'border:1px solid #eef0f3;border-top:none;background:#fcfcfd;padding:0 12px 10px;';
        host.querySelector('div').appendChild(wrap);
        renderMaterialPanel(wrap, scheduleRef.scheduleId, role, scheduleRef);
      });
    }

    // 同步课堂（教师）
    var syncBtn = host.querySelector('[data-mc="sync"]');
    if (syncBtn) {
      syncBtn.addEventListener('click', async function () {
        if (!window.confirm('将把该排期的每个课次重新推送到课堂服务（已存在的不会重复创建）。继续？')) return;
        syncBtn.disabled = true;
        var old = syncBtn.textContent;
        syncBtn.textContent = '同步中…';
        var r = await syncClassrooms(scheduleRef.scheduleId);
        syncBtn.disabled = false;
        syncBtn.textContent = old;
        toast(r.ok ? r.msg : ('同步失败：' + r.msg));
      });
    }
  }

  // ---------- 渲染：资料面板 ----------

  /**
   * 资料面板：教师可上传 + 查看；学生只读。
   * 面板自带「课堂未同步」引导——资料接口失败多见于课堂尚未创建（40401）。
   */
  function renderMaterialPanel(host, key, role, scheduleRef) {
    var isTeacher = role === 'teacher';
    host.innerHTML = '<div style="padding:10px 0 4px;font-size:12.5px;color:#6b7280;">资料加载中…</div>';

    listMaterials(key).then(function (r) {
      var html = '';
      html += '<div style="padding:10px 0 6px;display:flex;align-items:center;gap:10px;font-size:12.5px;">';
      html += '<strong>教学资料</strong>';
      html += '<span style="color:#6b7280;">' + (r.ok ? r.list.length + ' 份' : '读取失败') + '</span>';
      html += '<span style="flex:1;"></span>';
      if (isTeacher) {
        html += '<input type="file" data-mc="file" style="display:none;">';
        html += '<button type="button" class="btn btn-default" data-mc="pick" style="padding:3px 10px;font-size:12px;">上传资料</button>';
      }
      html += '</div>';
      html += '<div data-mc="hint" style="display:none;font-size:12px;margin-bottom:6px;"></div>';

      if (!r.ok) {
        html += '<div style="padding:8px 10px;border-radius:6px;background:#fff8e6;border:1px solid #ffe0a3;'
          + 'color:#8a5a00;font-size:12px;">' + esc(r.msg)
          + '（若提示课堂不存在，请点上方「同步课堂」把课次推送到课堂服务后重试）</div>';
      } else if (!r.list.length) {
        html += '<div style="color:#999;font-size:12px;padding:4px 0;">暂无资料。</div>';
      } else {
        html += '<table width="100%" style="font-size:12px;border-collapse:collapse;"><tbody>';
        r.list.forEach(function (m) {
          var name = esc(m.fileName || '未命名');
          var size = m.fileSize ? (Math.round(m.fileSize / 1024) + ' KB') : '';
          var url = m.url || m.fileUrl || '';
          html += '<tr style="border-top:1px solid #f2f4f7;">';
          html += '<td style="padding:5px 8px;">' + name + '</td>';
          html += '<td style="padding:5px 8px;color:#6b7280;width:90px;">' + esc(size) + '</td>';
          html += '<td style="padding:5px 8px;width:70px;text-align:right;">'
            + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">查看</a>' : '<span style="color:#bbb;">无链接</span>')
            + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      }
      host.innerHTML = html;

      var hint = host.querySelector('[data-mc="hint"]');
      var pick = host.querySelector('[data-mc="pick"]');
      var fileInput = host.querySelector('[data-mc="file"]');
      if (pick && fileInput) {
        pick.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', async function () {
          var f = fileInput.files && fileInput.files[0];
          fileInput.value = '';
          if (!f) return;
          hint.style.display = 'block';
          hint.style.color = '#6b7280';
          hint.textContent = '上传中：' + f.name;
          var up = await uploadMaterial(key, f);
          if (up.ok) {
            hint.style.color = '#1a7f37';
            hint.textContent = '上传成功：' + f.name;
            renderMaterialPanel(host, key, role, scheduleRef);
          } else {
            hint.style.color = '#b42318';
            hint.textContent = '上传失败：' + up.msg;
          }
        });
      }
    });
  }

  // ---------- 对外 ----------

  window.MyClassroomCore = {
    esc: esc,
    fmtTime: fmtTime,
    stateText: stateText,
    stateTagHtml: stateTagHtml,
    toast: toast,
    errText: errText,
    ensureEnabled: ensureEnabled,
    loadInstances: loadInstances,
    syncClassrooms: syncClassrooms,
    listMaterials: listMaterials,
    uploadMaterial: uploadMaterial,
    getPlayback: getPlayback,
    enterClassroom: enterClassroom,
    openReplay: openReplay,
    openPrep: openPrep,
    classroomKeyOf: classroomKeyOf,
    parseUtcLoose: parseUtcLoose,
    classroomPhase: classroomPhase,
    isClassroomEligible: isClassroomEligible,
    buildEntryButtons: buildEntryButtons,
    renderInstanceTable: renderInstanceTable,
    renderMaterialPanel: renderMaterialPanel
  };

  // 行内 onclick 入口：页面按钮用 window.ClassroomEntry.xxx('key') 调用，
  // 不另外声明全局同名函数（避免与页面内联脚本的函数名互相覆盖）。
  window.ClassroomEntry = {
    enter: function (key) { enterClassroom(key); },
    replay: function (key) { openReplay(key); },
    prep: function (key) { openPrep(key); }
  };
})();
