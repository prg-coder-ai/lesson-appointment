/**
 * 教师列表页（S5 新建页）
 * 端点：GET /teacher/published/public-list?tenantCode=xxx（免登录，四处白名单已登记）
 * 红线：R1 名词走 data-term；R2 跳转用 pageUrl()；R3 加载公共 JS 清单 + data-term-title。
 * 注意：免登录接口用 noAuthRedirect，失败不触发全局跳登录；不回退 mock（不展示虚假师资）。
 */
(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function teacherLabel() {
    return (typeof termText === 'function') ? termText('teacher') : '教师';
  }

  function onCardClick(teacher) {
    if (!teacher) return;
    var pid = teacher.publishedProfileId || teacher.teacherId;
    var base = (typeof window.pageUrl === 'function') ? window.pageUrl('teacherPublishedProfile.html') : 'teacherPublishedProfile.html';
    window.location.href = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(pid);
  }

  function render(list, grid) {
    var label = teacherLabel();
    if (!list || !list.length) {
      grid.innerHTML = '<div class="tl-empty">暂无可展示的' + esc(label) + '信息</div>';
      return;
    }
    grid.innerHTML = list.map(function (t, i) {
      var cover = t.coverUrl ? ('background:' + esc(t.coverUrl) + ';') : 'background:linear-gradient(135deg,#4e6ef2,#7a8cff);';
      var initial = (t.name || '?').charAt(0);
      return '<div class="tl-card" data-index="' + i + '" role="button" tabindex="0" ' +
        'onclick="window.__tlCardClick(' + i + ')" ' +
        'onkeydown="if(event.key===\'Enter\'){window.__tlCardClick(' + i + ');}">' +
        '<div class="tl-cover" style="' + cover + '"><span>' + esc(initial) + '</span></div>' +
        '<div class="tl-body">' +
        '<div class="tl-name">' + esc(t.name) + '</div>' +
        (t.title ? '<div class="tl-title">' + esc(t.title) + '</div>' : '') +
        (t.summary ? '<div class="tl-summary">' + esc(t.summary) + '</div>' : '') +
        '<div class="tl-foot">查看' + esc(label) + '详情 ›</div>' +
        '</div></div>';
    }).join('');
    window.__tlCardClick = function (i) { onCardClick(list[i]); };
  }

  async function init() {
    var grid = document.getElementById('tl-grid');
    var back = document.getElementById('tl-back');
    if (back) back.onclick = function () { history.length > 1 ? history.back() : (window.location.href = (typeof pageUrl === 'function' ? pageUrl('student.html') : 'student.html')); };

    var tc = (typeof getTenantCodeParam === 'function') ? getTenantCodeParam() : '';
    var url = (window.API_BASE_URL || '') + '/teacher/published/public-list';
    var list = [];
    try {
      list = await request({
        url: url, method: 'GET', params: { tenantCode: tc || '' },
        noAuthRedirect: true, customErrorMsg: false
      }) || [];
    } catch (e) {
      console.warn('[teacher-list] 拉取师资列表失败：', e);
      list = [];
    }
    // 大小写兜底（tenant_A → TENANT_A）
    if (!list.length && tc && tc !== tc.toUpperCase()) {
      try {
        list = await request({
          url: url, method: 'GET', params: { tenantCode: tc.toUpperCase() },
          noAuthRedirect: true, customErrorMsg: false
        }) || [];
      } catch (e) { list = []; }
    }
    render(list, grid);
    if (typeof applyTerms === 'function') { try { applyTerms(); } catch (e) {} }
    if (typeof applyDocumentTitle === 'function') { try { applyDocumentTitle(); } catch (e) {} }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
