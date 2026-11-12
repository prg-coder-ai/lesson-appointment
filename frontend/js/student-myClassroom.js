/**
 * 学生端「我的课堂」（2026-11-13）
 *
 * 页面结构：我的预约（按排期）→ 点「课次」展开具体课次 →
 *   ① 查看教师教学资料（只读）
 *   ② 未结束的课次「进入课堂」实时学习
 *   ③ 已结束的课次显示「回放」
 *
 * 数据源：
 *   POST /api/v1/course/booking/page            我的预约（getBookingListPage，userId 限定本人）
 *   GET  /api/v1/schedule/detail/{id}           排期（fetchSchedule：课程名/时间）
 *   GET  /api/v1/schedule/class-instances/{sid} 课次实例
 *   GET  /api/v1/classrooms/{key}/materials     讲稿（课堂服务，只读）
 *   GET  /api/v1/recordings/{key}/playback      回放地址
 *
 * 讲解「为什么学生看资料可能被拒」：课堂服务的 ClassroomAccessGuard 要求调用者在
 * classroom_membership 名单内，而名单是在**首次进入课堂**时建立的。所以课前预习
 * 资料会拿到「你不在本课堂名单内」——这是既有的安全模型（不确定身份者不能读课堂内容），
 * 此处给出「先进课堂再查看」的引导而不是绕过它。
 */
(function () {
  'use strict';

  function core() {
    return window.MyClassroomCore || null;
  }

  function getStudentId() {
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

  function getRole() {
    try {
      if (typeof userRole === 'string' && userRole) return userRole;
      var u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return (u && u.role) || 'student';
    } catch (e) {
      return 'student';
    }
  }

  // 不构成"我的课堂"的预约状态（与后端 BookingStatus.NON_OCCUPYING 同口径）
  var DEAD_STATUS = { cancelled: 1, canceled: 1, 'rej-booking': 1, frozen: 1, waiting: 1, delete: 1 };

  var BOOKING_STATUS_TEXT = {
    booking: '已预约',
    booked: '已确认',
    cancelling: '取消待确认',
    canceling: '取消待确认',
    completed: '已完成',
    overtime: '已过时'
  };

  function skeleton() {
    return '' +
      '<div class="card">' +
      '  <div class="card-title" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">' +
      '    <span><i class="fas fa-video"></i> 我的课堂</span>' +
      '    <button class="btn btn-default" type="button" id="stu-classroom-refresh"><i class="fa fa-refresh"></i> 刷新</button>' +
      '  </div>' +
      '  <div id="stu-classroom-hint" style="display:none;margin:0 0 10px;padding:10px 14px;border-radius:6px;' +
      '       background:#fff8e6;border:1px solid #ffe0a3;color:#8a5a00;font-size:13px;"></div>' +
      '  <div style="max-height:560px;overflow-y:auto;">' +
      '    <table class="data-table" width="100%">' +
      '      <thead><tr>' +
      '        <th width="6%">序号</th>' +
      '        <th width="24%"><span data-term="course">课程</span></th>' +
      '        <th width="32%"><span data-term="lessonTime">上课时间</span></th>' +
      '        <th width="12%">预约状态</th>' +
      '        <th width="20%" align="center">操作</th>' +
      '      </tr></thead>' +
      '      <tbody id="stu-classroom-body">' +
      '        <tr><td colspan="5" style="text-align:center;color:#999;padding:24px 0;">加载中…</td></tr>' +
      '      </tbody>' +
      '    </table>' +
      '  </div>' +
      '</div>';
  }

  function emptyRow(msg) {
    return '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px 0;">'
      + core().esc(msg) + '</td></tr>';
  }

  function setHint(msg) {
    var hint = document.getElementById('stu-classroom-hint');
    if (!hint) return;
    if (!msg) { hint.style.display = 'none'; hint.textContent = ''; return; }
    hint.style.display = 'block';
    hint.textContent = msg;
  }

  /** 我的预约 → 去重后的排期列表 */
  async function loadMySchedules() {
    var studentId = getStudentId();
    var role = getRole();
    if (typeof window.getBookingListPage !== 'function') return null;
    var page = await window.getBookingListPage({
      pageNum: 1,
      pageSize: 200,
      userId: studentId,
      userRole: role
    });
    var rows = (page && (page.rows || page.records)) || [];
    var seen = {};
    var out = [];
    rows.forEach(function (b) {
      if (!b || !b.scheduleId) return;
      if (DEAD_STATUS[String(b.status || '')]) return;
      if (seen[b.scheduleId]) return;
      seen[b.scheduleId] = 1;
      out.push(b);
    });
    return out;
  }

  var instancesCache = {};

  async function toggleInstances(sch, row) {
    var existed = row.nextSibling && row.nextSibling.getAttribute
      && row.nextSibling.getAttribute('data-mc-host') === sch.scheduleId;
    if (existed) {
      row.nextSibling.parentNode.removeChild(row.nextSibling);
      return;
    }
    document.querySelectorAll('tr[data-mc-host]').forEach(function (el) {
      el.parentNode.removeChild(el);
    });

    var hostTr = document.createElement('tr');
    hostTr.setAttribute('data-mc-host', sch.scheduleId);
    var hostTd = document.createElement('td');
    hostTd.colSpan = 5;
    hostTd.style.cssText = 'padding:0 10px 10px;background:#fafbfc;';
    hostTd.innerHTML = '<div style="color:#6b7280;font-size:12.5px;padding:8px 0;">课次加载中…</div>';
    hostTr.appendChild(hostTd);
    row.parentNode.insertBefore(hostTr, row.nextSibling);

    var instances = instancesCache[sch.scheduleId];
    if (instances === undefined) {
      instances = await core().loadInstances(sch.scheduleId);
      instancesCache[sch.scheduleId] = instances;
    }
    core().renderInstanceTable(hostTd, instances, 'student', { scheduleId: sch.scheduleId });
  }

  async function renderRows(bookings) {
    var tbody = document.getElementById('stu-classroom-body');
    if (!tbody) return;
    if (!bookings || !bookings.length) {
      tbody.innerHTML = emptyRow('暂无已预约的课程。请先在「预订课程」中预约，课次会自动出现在这里。');
      return;
    }
    tbody.innerHTML = '';

    var idx = 0;
    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      idx++;
      // 排期详情：拿课程名与时间。失败就显示占位，但仍允许展开课次（课次接口只依赖 scheduleId）
      var sch = null;
      try {
        sch = (typeof window.fetchSchedule === 'function') ? await window.fetchSchedule(b.scheduleId) : null;
      } catch (e) { sch = null; }

      var courseName = '';
      if (sch && sch.courseId && typeof window.getCourseById === 'function') {
        try {
          var c = await window.getCourseById(sch.courseId);
          courseName = (c && (c.courseName || c.name)) || '';
        } catch (e) { /* ignore */ }
      }

      var tr = document.createElement('tr');
      tr.setAttribute('data-schedule-id', b.scheduleId);

      var tdIdx = document.createElement('td');
      tdIdx.textContent = String(idx);
      tr.appendChild(tdIdx);

      var tdCourse = document.createElement('td');
      tdCourse.textContent = courseName || '未命名课程';
      tr.appendChild(tdCourse);

      var tdTime = document.createElement('td');
      tdTime.style.color = '#555';
      tdTime.textContent = sch ? (core().fmtTime(sch.startTime) + (sch.endTime ? ' ~ ' + core().fmtTime(sch.endTime) : '')) : '—';
      tr.appendChild(tdTime);

      var tdStatus = document.createElement('td');
      tdStatus.textContent = BOOKING_STATUS_TEXT[String(b.status || '')] || (b.status || '—');
      tr.appendChild(tdStatus);

      var tdOps = document.createElement('td');
      tdOps.style.textAlign = 'center';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-default';
      btn.style.cssText = 'padding:3px 10px;font-size:12px;';
      btn.textContent = '课次';
      btn.addEventListener('click', function (scheduleId, rowEl) {
        return function () { toggleInstances({ scheduleId: scheduleId }, rowEl); };
      }(b.scheduleId, tr));
      tdOps.appendChild(btn);
      tr.appendChild(tdOps);

      tbody.appendChild(tr);
    }
  }

  async function loadAll() {
    var tbody = document.getElementById('stu-classroom-body');
    if (!tbody) return;
    tbody.innerHTML = emptyRow('加载中…');
    var bookings;
    try {
      bookings = await loadMySchedules();
    } catch (e) {
      tbody.innerHTML = emptyRow('预约加载失败：' + core().errText(e));
      return;
    }
    if (bookings === null) {
      tbody.innerHTML = emptyRow('预约接口未加载（getBookingListPage），请刷新页面重试。');
      return;
    }
    await renderRows(bookings);
  }

  async function renderStudentClassroomPage() {
    var host = document.getElementById('dynamic-content-center');
    if (!host) return;
    if (!core()) {
      host.innerHTML = '<div class="card"><div class="empty-tip">'
        + '课堂核心脚本未加载（js/public/my-classroom-core.js），请刷新页面重试。</div></div>';
      return;
    }
    host.innerHTML = skeleton();

    var refreshBtn = document.getElementById('stu-classroom-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        instancesCache = {};
        loadAll();
      });
    }

    var enabled = await core().ensureEnabled();
    setHint(enabled ? '' : '当前租户未开通课堂功能：课次可查看，但无法进入课堂或回放。如需开通请联系管理员。');
    await loadAll();
  }

  window.renderStudentClassroomPage = renderStudentClassroomPage;
})();
