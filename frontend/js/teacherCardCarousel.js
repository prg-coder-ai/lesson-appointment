// teacherCardCarousel.js
// 未登录学生落地页 —— 「教师职业信息」横向滚动卡片（原型：mock 数据）
//
// 设计说明（确认项落地）：
//   1) 容器：独立公开落地页 student-landing.html（免登录，不破坏 student.html 登录守卫）。
//   2) 数据：当前为前端原型，用 MOCK_TEACHERS；接真实后端时把 loadTeacherCards() 换成
//        GET /api/v1/teacher/published/public-list?tenantCode=xxx
//        返回裁剪 VO：{ publishedProfileId, teacherId, name, title, summary, coverUrl }
//        注意：免登录接口须按 public-endpoint-tenant-bypass 处理（白名单 + @InterceptorIgnore(tenantLine="true") + 按 tenantCode 过滤）。
//   3) 点击行为（登录态分支）：已登录 → 直接打开免登录公开个人页 teacherPublishedProfile.html?id=<publishedProfileId>；
//        未登录 → 跳登录页再预约（index.html?from=landing&tid=xxx），登录后由 index 跳转逻辑处理回课程预订。
//
(function () {
  'use strict';

  // ===== 原型 mock 数据（接真实接口后整体删除）=====
  // 当前业务聚焦律师咨询行业，示例用律师职业信息；其它行业由真实接口返回覆盖。
  var MOCK_TEACHERS = [
    { teacherId: 'T1001', profileId: 'P1001', name: '张明', title: '资深执业律师 · 民商事争议解决', summary: '十年诉讼经验，专注合同纠纷与公司治理，已服务超 200 家企业客户。', cover: 'linear-gradient(135deg,#4e6ef2,#7a8cff)' },
    { teacherId: 'T1002', profileId: 'P1002', name: '李雯', title: '合伙人律师 · 知识产权', summary: '商标与专利布局专家，代理多起驰名商标维权案件，擅长跨境知识产权策略。', cover: 'linear-gradient(135deg,#36cfc9,#5cdbd3)' },
    { teacherId: 'T1003', profileId: 'P1003', name: '王浩', title: '资深律师 · 刑事辩护', summary: '前检察官，刑事辩护经验丰富，办理多起无罪及罪轻辩护成功案例。', cover: 'linear-gradient(135deg,#ff9c6e,#ffc069)' },
    { teacherId: 'T1004', profileId: 'P1004', name: '陈静', title: '律师 · 婚姻家事', summary: '家事调解与财富传承规划，注重隐私保护与客户情绪疏导。', cover: 'linear-gradient(135deg,#b37feb,#9254de)' },
    { teacherId: 'T1005', profileId: 'P1005', name: '赵磊', title: '顾问 · 企业合规', summary: '为企业提供合规体系搭建与风控培训，熟悉多行业监管框架。', cover: 'linear-gradient(135deg,#73d13d,#95de64)' }
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 点击卡片：已登录 → 跳该教师公开职业信息详情页（teacherPublishedProfile.html?id=）；未登录 → 跳登录页（带 tid）
  function onTeacherCardClick(teacher) {
    if (!teacher) return;
    var pid = teacher.profileId || teacher.teacherId;
    var loggedIn = !!localStorage.getItem('token');
    if (loggedIn) {
      var base = (typeof window.pageUrl === 'function') ? window.pageUrl('teacherPublishedProfile.html') : 'teacherPublishedProfile.html';
      window.location.href = base + '?id=' + encodeURIComponent(pid);
    } else {
      var loginBase = (typeof window.pageUrl === 'function') ? window.pageUrl('index.html') : 'index.html';
      window.location.href = loginBase + (loginBase.indexOf('?') >= 0 ? '&' : '?') + 'from=landing&tid=' + encodeURIComponent(teacher.teacherId);
    }
  }

  // 加载卡片数据：原型返回 mock；真实接入替换为公开列表接口
  async function loadTeacherCards() {
    // ===== 真实接入位（确认项：先做前端原型，暂不接后端）=====
    // var tCode = (typeof getTenantCodeParam === 'function') ? getTenantCodeParam() : '';
    // var list = await request({ url: '/api/v1/teacher/published/public-list', method: 'GET', params: { tenantCode: tCode } });
    // return (list || []).map(function (it) {
    //   return { teacherId: it.teacherId, name: it.name, title: it.title, summary: it.summary, cover: it.coverUrl || '' };
    // });
    return MOCK_TEACHERS;
  }

  async function renderTeacherCardCarousel(containerId) {
    var root = document.getElementById(containerId);
    if (!root) return;

    var teachers = await loadTeacherCards();
    var teacherLabel = (typeof termText === 'function') ? termText('teacher') : '教师';

    if (!teachers || !teachers.length) {
      root.innerHTML = '<div class="tc-empty">暂无可展示的' + escapeHtml(teacherLabel) + '信息</div>';
      return;
    }

    var cardsHtml = teachers.map(function (t, i) {
      var coverStyle = t.cover ? ('background:' + escapeHtml(t.cover) + ';') : 'background:linear-gradient(135deg,#4e6ef2,#7a8cff);';
      var initial = (t.name || '?').charAt(0);
      return ''
        + '<div class="tc-card" data-index="' + i + '" role="button" tabindex="0"'
        + ' onclick="window.__onTeacherCardClick(' + i + ')"'
        + ' onkeydown="if(event.key===\'Enter\'){window.__onTeacherCardClick(' + i + ');}">'
        +   '<div class="tc-cover" style="' + coverStyle + '">'
        +     '<span class="tc-avatar">' + escapeHtml(initial) + '</span>'
        +   '</div>'
        +   '<div class="tc-body">'
        +     '<div class="tc-name">' + escapeHtml(t.name) + '</div>'
        +     '<div class="tc-title">' + escapeHtml(t.title) + '</div>'
        +     '<div class="tc-summary">' + escapeHtml(t.summary) + '</div>'
        +     '<div class="tc-foot"><span class="tc-link">查看' + escapeHtml(teacherLabel) + '详情 ›</span></div>'
        +   '</div>'
        + '</div>';
    }).join('');

    root.innerHTML =
        '<button class="tc-arrow tc-prev" aria-label="上一个" onclick="window.__teacherCarouselPrev()">‹</button>'
      + '<div class="tc-track" id="tcTrack">' + cardsHtml + '</div>'
      + '<button class="tc-arrow tc-next" aria-label="下一个" onclick="window.__teacherCarouselNext()">›</button>';

    window.__onTeacherCardClick = function (i) { onTeacherCardClick(teachers[i]); };
    var track = document.getElementById('tcTrack');
    window.__teacherCarouselPrev = function () { if (track) track.scrollBy({ left: -320, behavior: 'smooth' }); };
    window.__teacherCarouselNext = function () { if (track) track.scrollBy({ left: 320, behavior: 'smooth' }); };

    // 自动缓慢滚动（hover 暂停）
    var timer = null;
    function startAuto() {
      stopAuto();
      timer = setInterval(function () {
        if (!track) return;
        var max = track.scrollWidth - track.clientWidth;
        if (max <= 0) return;
        if (track.scrollLeft >= max - 2) track.scrollTo({ left: 0, behavior: 'smooth' });
        else track.scrollBy({ left: 320, behavior: 'smooth' });
      }, 3500);
    }
    function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
    root.addEventListener('mouseenter', stopAuto);
    root.addEventListener('mouseleave', startAuto);
    startAuto();

    // 动态注入内容后，按当前行业词表替换锚点词（如卡片内 data-term）
    if (typeof applyTerms === 'function') {
      try { applyTerms(root); } catch (e) {}
    }
  }

  window.renderTeacherCardCarousel = renderTeacherCardCarousel;
})();
