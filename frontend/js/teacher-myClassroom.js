/**
 * 教师端「我的课堂」（2026-11-13 初版；同日扩展课次级）
 *
 * 页面结构：排期列表 → 点「课次」展开该排期的具体课次 → 每课次可
 *   ① 上传/查看教学资料（讲稿）  ② 进入课堂（教学页面）
 * 排期级也提供「整期资料」（key = 裸 scheduleId，作用于整条排期的资料池）。
 *
 * 数据源：
 *   GET  /api/v1/schedule/listByTeacher?teacherId=   本人 active 排期
 *   GET  /api/v1/course/list?teacherId=              courseId → 课程名
 *   GET  /api/v1/schedule/class-instances/{sid}      课次实例（服务端 ScheduleInstances 展开）
 *   POST /api/v1/schedule/class-instances/{sid}/sync 补推课堂事件（课堂缺失时）
 *   GET/POST /api/v1/classrooms/{key}/materials[/file]  讲稿（课堂服务）
 *
 * 课次标识 classroomKey 一律取服务端返回值，前端不拼（见 js/public/my-classroom-core.js 注释）。
 */
(function () {
  'use strict';

  function core() {
    return window.MyClassroomCore || null;
  }

  // 端点别名（守卫 check:endpoints 按此形态识别端点来源，勿改成函数返回）
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

  var STATUS_TEXT = {
    pending: '待发布',
    active: '已发布',
    inactive: '已收回',
    frozen: '已删除'
  };

  function getTeacherId() {
    try {
      if (typeof userId === 'string' && userId) return userId;
      if (userInfo && userInfo.userId) return userInfo.userId;
    } catch (e) { /* 未定义时走兜底 */ }
    try {
      var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return (u && u.userId) || '';
    } catch (e) {
      return '';
    }
  }

  function repeatText(sch) {
    var t = Number(sch && sch.repeatType) || 0;
    if (!t) return '单次';
    var unit = t === 1 ? '天' : (t === 2 ? '周' : (t === 3 ? '月' : ''));
    if (!unit) return '';
    var iv = Number(sch.repeatInterval) || 0;
    var txt = '每' + (iv > 1 ? iv : '') + unit + '一次';
    if (sch.repeatDays) {
      txt += '（' + (t === 2 ? '周 ' : '每月 ') + String(sch.repeatDays) + (t === 2 ? '' : ' 日') + '）';
    }
    return txt;
  }

  function skeleton() {
    return '' +
      '<div class="card">' +
      '  <div class="card-title" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">' +
      '    <span><i class="fas fa-video"></i> 我的课堂</span>' +
      '    <button class="btn btn-default" type="button" id="my-classroom-refresh"><i class="fa fa-refresh"></i> 刷新</button>' +
      '  </div>' +
      '  <div id="my-classroom-hint" style="display:none;margin:0 0 10px;padding:10px 14px;border-radius:6px;' +
      '       background:#fff8e6;border:1px solid #ffe0a3;color:#8a5a00;font-size:13px;"></div>' +
      '  <div style="max-height:560px;overflow-y:auto;">' +
      '    <table class="data-table" width="100%">' +
      '      <thead><tr>' +
      '        <th width="6%">序号</th>' +
      '        <th width="22%"><span data-term="course">课程</span></th>' +
      '        <th width="32%">排期</th>' +
      '        <th width="10%">课时</th>' +
      '        <th width="10%">发布状态</th>' +
      '        <th width="20%" align="center">操作</th>' +
      '      </tr></thead>' +
      '      <tbody id="my-classroom-body">' +
      '        <tr><td colspan="6" style="text-align:center;color:#999;padding:24px 0;">加载中…</td></tr>' +
      '      </tbody>' +
      '    </table>' +
      '  </div>' +
      '</div>';
  }

  function emptyRow(msg) {
    return '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px 0;">'
      + core().esc(msg) + '</td></tr>';
  }

  function setHint(msg) {
    var hint = document.getElementById('my-classroom-hint');
    if (!hint) return;
    if (!msg) { hint.style.display = 'none'; hint.textContent = ''; return; }
    hint.style.display = 'block';
    hint.textContent = msg;
  }

  async function loadCourseNames(teacherId) {
    var map = {};
    try {
      var list = await window.request({
        url: '/course/list',
        method: 'GET',
        params: { teacherId: teacherId },
        customLoading: false,
        customErrorMsg: false
      });
      (Array.isArray(list) ? list : []).forEach(function (c) {
        if (c && c.courseId) map[c.courseId] = c.courseName || c.name || '';
      });
    } catch (e) { /* 映射失败降级用排期 name */ }
    return map;
  }

  /** 课次展开/收起（服务端课次只拉一次，之后复用） */
  var instancesCache = {};

  async function toggleInstances(sch, row, canEnter) {
    var existed = row.nextSibling && row.nextSibling.getAttribute
      && row.nextSibling.getAttribute('data-mc-host') === sch.scheduleId;
    if (existed) {
      row.nextSibling.parentNode.removeChild(row.nextSibling);
      row.setAttribute('data-expanded', '0');
      return;
    }
    // 先移除其它已展开行，保证同时只展开一个（避免长页面来回滚动）
    var opened = document.querySelectorAll('tr[data-mc-host]');
    opened.forEach(function (el) { el.parentNode.removeChild(el); });

    var hostTr = document.createElement('tr');
    hostTr.setAttribute('data-mc-host', sch.scheduleId);
    var hostTd = document.createElement('td');
    hostTd.colSpan = 6;
    hostTd.style.cssText = 'padding:0 10px 10px;background:#fafbfc;';
    hostTd.innerHTML = '<div style="color:#6b7280;font-size:12.5px;padding:8px 0;">课次加载中…</div>';
    hostTr.appendChild(hostTd);
    row.parentNode.insertBefore(hostTr, row.nextSibling);
    row.setAttribute('data-expanded', '1');

    var instances = instancesCache[sch.scheduleId];
    if (instances === undefined) {
      instances = await core().loadInstances(sch.scheduleId);
      instancesCache[sch.scheduleId] = instances;
    }
    core().renderInstanceTable(hostTd, instances, 'teacher', {
      scheduleId: sch.scheduleId
    });
  }

  function renderRows(list, courseMap, canEnter) {
    var tbody = document.getElementById('my-classroom-body');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = emptyRow('暂无可用排期。请先在「我的课程」中为课程添加并发布排期。');
      return;
    }
    tbody.innerHTML = '';

    list.forEach(function (sch, i) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-schedule-id', sch.scheduleId);

      var courseName = courseMap[sch.courseId] || sch.name || '未命名课程';
      var statusText = STATUS_TEXT[sch.status] || (sch.status || '未知');
      var duration = sch.classDuration ? (sch.classDuration + ' 分钟') : '—';

      var tdIdx = document.createElement('td');
      tdIdx.textContent = String(i + 1);
      tr.appendChild(tdIdx);

      var tdCourse = document.createElement('td');
      tdCourse.textContent = courseName;
      tr.appendChild(tdCourse);

      var tdSch = document.createElement('td');
      tdSch.style.color = '#555';
      tdSch.textContent = core().fmtTime(sch.startTime) + ' · ' + repeatText(sch);
      tr.appendChild(tdSch);

      var tdDur = document.createElement('td');
      tdDur.textContent = duration;
      tr.appendChild(tdDur);

      var tdStatus = document.createElement('td');
      tdStatus.textContent = statusText;
      tr.appendChild(tdStatus);

      var tdOps = document.createElement('td');
      tdOps.style.textAlign = 'center';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-default';
      btn.style.cssText = 'padding:3px 10px;font-size:12px;';
      btn.textContent = '课次';
      btn.addEventListener('click', function () {
        toggleInstances(sch, tr, canEnter);
      });
      tdOps.appendChild(btn);

      var matBtn = document.createElement('button');
      matBtn.type = 'button';
      matBtn.className = 'btn btn-default';
      matBtn.style.cssText = 'padding:3px 10px;font-size:12px;margin-left:6px;';
      matBtn.textContent = '整期资料';
      matBtn.addEventListener('click', function () {
        var key = 'panel-' + sch.scheduleId;
        var opened = tr.querySelector('[data-inline="' + key + '"]');
        if (opened) { opened.parentNode.removeChild(opened); return; }
        // 资料面板放在排期行正下方，避免与课次展开行打架
        var panelTr = document.createElement('tr');
        panelTr.setAttribute('data-inline', key);
        var td = document.createElement('td');
        td.colSpan = 6;
        td.style.cssText = 'padding:0 10px 10px;background:#fcfcfd;';
        panelTr.appendChild(td);
        tr.parentNode.insertBefore(panelTr, tr.nextSibling);
        core().renderMaterialPanel(td, sch.scheduleId, 'teacher', { scheduleId: sch.scheduleId });
      });
      tdOps.appendChild(matBtn);

      tr.appendChild(tdOps);
      tbody.appendChild(tr);
    });
  }

  async function loadSchedules(canEnter) {
    var tbody = document.getElementById('my-classroom-body');
    if (!tbody) return;
    var teacherId = getTeacherId();
    if (!teacherId) {
      tbody.innerHTML = emptyRow('未取到登录信息，请重新登录后再试。');
      return;
    }
    tbody.innerHTML = emptyRow('加载中…');

    var list = [];
    try {
      var url = EP.SCHEDULE_LIST_BY_TEACHER
        ? EP.SCHEDULE_LIST_BY_TEACHER(teacherId)
        : '/schedule/listByTeacher?teacherId=' + encodeURIComponent(teacherId);
      var res = await window.request({ url: url, method: 'GET', customLoading: false });
      list = Array.isArray(res) ? res : (res && Array.isArray(res.rows) ? res.rows : []);
    } catch (e) {
      tbody.innerHTML = emptyRow('排期加载失败：' + core().errText(e));
      return;
    }

    list = list.filter(function (s) { return s && s.status !== 'frozen' && s.status !== 'inactive'; });

    var courseMap = await loadCourseNames(teacherId);
    renderRows(list, courseMap, canEnter);
  }

  async function renderMyClassroomPage() {
    var host = document.getElementById('dynamic-content-center');
    if (!host) return;
    if (!core()) {
      host.innerHTML = '<div class="card"><div class="empty-tip">'
        + '课堂核心脚本未加载（js/public/my-classroom-core.js），请刷新页面重试。</div></div>';
      return;
    }
    host.innerHTML = skeleton();

    var state = { enabled: false };
    var refreshBtn = document.getElementById('my-classroom-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        instancesCache = {};
        loadSchedules(state.enabled);
      });
    }

    var enabled = await core().ensureEnabled();
    state.enabled = enabled;
    setHint(enabled ? '' : '当前租户未开通课堂功能：排期与课次可查看，但无法上传资料或进入课堂。如需开通请联系管理员。');
    await loadSchedules(enabled);
  }

  window.renderMyClassroomPage = renderMyClassroomPage;
})();
