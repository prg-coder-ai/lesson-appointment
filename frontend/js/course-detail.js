/**
 * 课程详情页（S3 新建页）
 * 端点：GET /course/{courseid}（全小写） + GET /schedule/selectByCourseId/{cid} + 教师公开页深链
 * 红线：R1 名词走 data-term；R2 跳转用 pageUrl()；R3 加载公共 JS 清单 + data-term-title。
 * 注：courseId 作为公开资源标识落在 URL，非 userId，符合 R2 的"不泄露身份"意图。
 */
(function () {
  function getQueryParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function tText(group, v) {
    if (v == null || v === '') return '';
    if (group === 'classForm' && typeof enumTermText === 'function') return enumTermText('classForm', v) || v;
    if (group === 'courseType' && typeof courseTypeText === 'function') return courseTypeText(v) || v;
    return v;
  }
  function wlText(v) {
    if (!v) return '';
    return (typeof workLanguageText === 'function') ? workLanguageText(v) || v : v;
  }
  function teacherLabel() {
    return (typeof termText === 'function') ? termText('teacher') : '教师';
  }

  function mountCourse(course, mount) {
    var tags = [];
    var type = tText('courseType', course.languageType);
    if (type) tags.push(type);
    var wl = wlText(course.workLanguage);
    if (wl) tags.push('授课语言:' + wl);
    if (course.difficultyLevel) tags.push('难度:' + esc(course.difficultyLevel));

    var props = [];
    if (course.classDuration && Number(course.classDuration) > 0)
      props.push('<span>课时：<b>' + Number(course.classDuration) + ' 分钟</b></span>');
    var form = tText('classForm', course.classForm);
    if (form) props.push('<span>形式：<b>' + esc(form) + '</b></span>');
    if (course.classFee != null && course.classFee !== '')
      props.push('<span>费用：<b>¥' + esc(course.classFee) + '</b></span>');

    var chips = '';
    if (course.feature) {
      chips = String(course.feature).split(/[,;，；]/).map(function (s) { return s.trim(); })
        .filter(Boolean).map(function (f) {
          return '<span class="cd-chip">' + esc(f) + '</span>';
        }).join('');
    }

    var cover = '';
    if (course.imageUrl) {
      cover = '<img class="cd-cover" src="' + esc(course.imageUrl) + '" alt="封面" onerror="this.style.display=\'none\'">';
    }

    mount.innerHTML =
      cover +
      '<div class="cd-name">' + esc(course.courseName || '(未命名课程)') + '</div>' +
      (tags.length ? '<div class="cd-tags">' + tags.map(function (x) { return '<span class="cd-tag">' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
      (course.content ? '<div class="cd-content">' + esc(course.content) + '</div>' : '') +
      (chips ? '<div class="cd-chips">' + chips + '</div>' : '') +
      (props.length ? '<div class="cd-props">' + props.join('') + '</div>' : '') +
      '<div style="margin-top:16px;"><a class="cd-btn" id="cd-book" href="javascript:void(0)">去预约</a></div>';

    var bookBtn = document.getElementById('cd-book');
    if (bookBtn) bookBtn.onclick = function () {
      var target = (typeof window.pageUrl === 'function') ? window.pageUrl('student.html') : 'student.html';
      // 课程级深链：student.html 入口识别 ?cid= 自动选中课程
      window.location.href = target + (target.indexOf('?') >= 0 ? '&' : '?') + 'cid=' + encodeURIComponent(course.courseId);
    };
  }

  function mountSchedules(list, mount) {
    if (!list || !list.length) {
      mount.innerHTML = '<div class="cd-empty">暂无已发布的排期</div>';
      return;
    }
    var bookTarget = (typeof window.pageUrl === 'function') ? window.pageUrl('student.html') : 'student.html';
    mount.innerHTML = list.map(function (s) {
      // 后端 ScheduleCreateDTO 字段：startDate / startTime / endDate / endTime / name / status
      var d = esc(s.startDate || '');
      var tm = esc(s.startTime || '');
      if (s.endDate && s.endDate !== s.startDate) d += ' → ' + esc(s.endDate);
      if (s.endTime && s.endTime !== s.startTime) tm += ' - ' + esc(s.endTime);
      if (s.name) d = esc(s.name) + '  ·  ' + d;
      var status = (s.status || '').toLowerCase();
      var actionable = (status === 'active' || status === '');
      // 排期级深链：student.html 入口识别 ?scdid= 自动定位课程+排期
      var bookHref = bookTarget + (bookTarget.indexOf('?') >= 0 ? '&' : '?') + 'scdid=' + encodeURIComponent(s.scheduleId || '');
      return '<div class="cd-sched">' +
        '<div class="when"><span class="d">' + d + '</span>' + (tm ? '<span class="t">' + tm + '</span>' : '') + '</div>' +
        (actionable
          ? '<a class="cd-btn" href="' + bookHref + '">预约</a>'
          : '<span style="color:#bbb;font-size:13px;">' + esc(status) + '</span>') +
        '</div>';
    }).join('');
  }

  async function init() {
    var courseId = getQueryParam('courseId');
    var mount = document.getElementById('cd-mount');
    var back = document.getElementById('cd-back');
    if (back) back.onclick = function () { history.length > 1 ? history.back() : (window.location.href = (typeof pageUrl === 'function' ? pageUrl('student.html') : 'student.html')); };

    if (!courseId) {
      mount.innerHTML = '<div class="cd-error">缺少课程参数（?courseId=）</div>';
      applyTermsSafe();
      return;
    }

    var course = null;
    try { course = await getCourseById(courseId); } catch (e) { course = null; }
    if (!course) {
      mount.innerHTML = '<div class="cd-error">课程不存在或加载失败</div>';
      applyTermsSafe();
      return;
    }

    mountCourse(course, mount);

    fetchScheduleList(courseId, 'active')
      .then(function (list) { mountSchedules(list || [], document.getElementById('cd-schedule')); })
      .catch(function () { var s = document.getElementById('cd-schedule'); if (s) s.innerHTML = '<div class="cd-empty">排期加载失败</div>'; });

    if (course.teacherId) {
      var tCard = document.getElementById('cd-teacher-card');
      var tEl = document.getElementById('cd-teacher');
      if (tCard && tEl) {
        var base = (typeof window.pageUrl === 'function') ? window.pageUrl('teacherPublishedProfile.html') : 'teacherPublishedProfile.html';
        tEl.innerHTML = '<a class="cd-link" href="' + base + (base.indexOf('?') >= 0 ? '&' : '?') +
          'teacherId=' + encodeURIComponent(course.teacherId) + '">查看' + esc(teacherLabel()) + '详情 ›</a>' +
          ' &nbsp;·&nbsp; <a class="cd-link" href="' +
          ((typeof window.pageUrl === 'function') ? window.pageUrl('teacher-list.html') : 'teacher-list.html') +
          '">查看全部' + esc(teacherLabel()) + ' ›</a>';
        tCard.style.display = '';
      }
    }

    applyTermsSafe();
  }

  function applyTermsSafe() {
    if (typeof applyTerms === 'function') { try { applyTerms(); } catch (e) {} }
    if (typeof applyDocumentTitle === 'function') { try { applyDocumentTitle(); } catch (e) {} }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
