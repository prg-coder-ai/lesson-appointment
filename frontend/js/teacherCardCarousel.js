// teacherCardCarousel.js
// 未登录学生落地页 —— 「教师职业信息」横向滚动卡片（原型：mock 数据）
//
// 设计说明（确认项落地）：
//   1) 容器：独立公开落地页 student-landing.html（免登录，不破坏 student.html 登录守卫）。
//   2) 数据：当前为前端原型，用 MOCK_TEACHERS；接真实后端时把 loadTeacherCards() 换成
//        GET /api/v1/teacher/published/public-list?tenantCode=xxx
//        返回裁剪 VO：{ publishedProfileId, teacherId, name, title, summary, coverUrl }
//        注意：免登录接口须按 public-endpoint-tenant-bypass 处理（白名单 + @InterceptorIgnore(tenantLine="true") + 按 tenantCode 过滤）。
//   3) 点击行为（不区分登录态）：一律直接打开免登录公开个人页 teacherPublishedProfile.html?id=<publishedProfileId>。
//        未登录访客也允许查看师资介绍，不再在卡片点击处跳登录页；
//        只有在该公开页内部点击「排期/预约」链接时，才由公开页自己弹出登录提示
//        （见 teacherPublishedProfile.html 的拦截逻辑 + login.html 的 redirect 回跳）。
//
(function () {
  'use strict';

  // 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths）
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

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

  // 点击卡片：不区分登录态，直接打开该教师的公开职业信息详情页（teacherPublishedProfile.html?id=）。
  // 未登录也放行 —— 访客可自由浏览师资介绍；需要登录的动作（点「排期/预约」）由公开页内部再提示，
  // 提示层由 teacherPublishedProfile.html 实现（含登录后回跳该排期）。
  function onTeacherCardClick(teacher) {
    if (!teacher) return;
    var pid = teacher.profileId || teacher.teacherId;
    var base = (typeof window.pageUrl === 'function') ? window.pageUrl('teacherPublishedProfile.html') : 'teacherPublishedProfile.html';
    // pageUrl 可能已带 ?tCode=xxx，须用 & 续接，避免拼出第二个 ? 导致 id 解析失败
    window.location.href = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(pid);
  }

  // 加载卡片数据：优先走真实免登录公开列表接口（按当前租户 tCode 过滤）；
  // 有真实数据源（已带 tCode）时一律以真实返回为准，不再回退 mock（避免展示虚假师资）；
  // 仅当完全无租户上下文（缺 tCode、无法取真实数据）时，才用原型 mock 作为预览占位，避免空白页。
  // 拉取单个租户码下的真实师资列表（公开接口，静默降级，不触发全局跳登录）
  async function fetchTeacherList(tc) {
    try {
      var list = await request({
        url: EP.TEACHER_PUBLIC_LIST_PATH,
        method: 'GET',
        params: { tenantCode: tc },
        noAuthRedirect: true,
        customErrorMsg: false
      });
      return (list && list.length) ? list : [];
    } catch (e) {
      // 有真实数据源却请求失败：不回退 mock（不展示虚假师资），返回空由上层决定空状态
      console.warn('[teacherCardCarousel] 拉取真实师资列表失败：', e);
      return [];
    }
  }

  async function loadTeacherCards() {
    var tCode = (typeof getTenantCodeParam === 'function') ? getTenantCodeParam() : '';
    if (!tCode) {
      return MOCK_TEACHERS;
    }
    // 先用原租户码查询；若为空，再做一次大小写兜底（租户码通常为大写，
    // 用户手输小写 tenant_A 时仍能命中后端 TENANT_A，避免「教师风采」空白）。
    var list = await fetchTeacherList(tCode);
    if (!list.length && tCode !== tCode.toUpperCase()) {
      list = await fetchTeacherList(tCode.toUpperCase());
    }
    if (!list.length) {
      return [];
    }
    return list.map(function (it) {
      return {
        teacherId: it.teacherId,
        profileId: it.publishedProfileId,
        name: it.name,
        title: it.title,
        summary: it.summary,
        cover: it.coverUrl || ''
      };
    });
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
