/**
 * 学生端「我的课时」页（2026-10-28）。
 *
 * 数据源：`GET /api/v1/lesson/balance` + `GET /api/v1/lesson/flows`（分页）。
 * 账本由课堂收尾自动产生，本页**只读**——充值/改判属运营动作，学生端不提供入口。
 *
 * 展示映射（来源文案、数值正负、色调）统一走 shared/domain/lessonLedger.js，
 * 经 shared-domain-bridge 挂到 window.LessonLedgerDomain，这里不重复写映射表。
 *
 * 整体包 IIFE：本仓库多次踩过「同文件同名函数静默覆盖」与「顶层标识符污染」的坑。
 */
(function () {
  'use strict';

  var PAGE_SIZE = 20;

  // 分页与请求状态挂在闭包里，不用全局变量
  var state = { page: 1, total: 0, totalPages: 0, loading: false };

  function domain() {
    return window.LessonLedgerDomain || {};
  }

  function endpoints() {
    return (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dateText(v) {
    if (!v) return '—';
    var D = window.DatetimeDomain;
    if (D && typeof D.formatDateTime === 'function') return D.formatDateTime(v, false);
    return String(v).replace('T', ' ').substring(0, 16);
  }

  function amount(v) {
    var d = domain();
    return typeof d.formatLessonAmount === 'function' ? d.formatLessonAmount(v) : String(v == null ? 0 : v);
  }

  function changeText(v) {
    var d = domain();
    return typeof d.lessonChangeText === 'function' ? d.lessonChangeText(v) : String(v == null ? 0 : v);
  }

  function sourceText(src) {
    var d = domain();
    return typeof d.lessonSourceText === 'function' ? d.lessonSourceText(src) : (src || '课时变动');
  }

  function rowTitle(flow) {
    var d = domain();
    if (typeof d.lessonRowTitle === 'function') return d.lessonRowTitle(flow);
    return flow && flow.courseName ? flow.courseName : '课时变动';
  }

  function tone(balance) {
    var d = domain();
    return typeof d.lessonBalanceTone === 'function' ? d.lessonBalanceTone(balance) : 'normal';
  }

  /** 余额卡片配色：欠课红、用完橙、正常绿（与课次状态的语义色一致） */
  var TONE_STYLE = {
    normal: { color: '#2e9e5b', label: '' },
    empty: { color: '#d9822b', label: '' },
    owed: { color: '#d9534f', label: '' }
  };

  function renderBalance(b) {
    var host = document.getElementById('ml-balance-body');
    if (!host) return;
    var bal = b || {};
    var toneKey = tone(bal);
    var color = (TONE_STYLE[toneKey] || TONE_STYLE.normal).color;

    host.innerHTML =
      '<div class="ml-stat-grid">' +
      '  <div class="ml-stat">' +
      '    <div class="ml-stat-label">剩余课时</div>' +
      '    <div class="ml-stat-value" style="color:' + color + '">' + esc(amount(bal.remainingLessons)) + '</div>' +
      '  </div>' +
      '  <div class="ml-stat">' +
      '    <div class="ml-stat-label">累计课时</div>' +
      '    <div class="ml-stat-value">' + esc(amount(bal.totalLessons)) + '</div>' +
      '  </div>' +
      '  <div class="ml-stat">' +
      '    <div class="ml-stat-label">已消耗</div>' +
      '    <div class="ml-stat-value">' + esc(amount(bal.usedLessons)) + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="ml-tip" style="' + (toneKey === 'normal' ? '' : 'color:' + color + ';') + '">' +
      esc(bal.tip || '') +
      '</div>';

    // 没有账本记录时，明细区给出更明确的空态文案（比"暂无数据"更有信息量）
    if (bal.hasAccount === false) {
      var empty = document.getElementById('ml-flow-empty');
      if (empty) empty.textContent = '还没有课时流水：首次上课并完成课堂结算后，这里会自动出现记录。';
    }
  }

  function renderFlows(pageData) {
    var body = document.getElementById('ml-flow-body');
    if (!body) return;
    var rows = (pageData && pageData.rows) || [];
    state.total = (pageData && pageData.total) || 0;
    state.totalPages = (pageData && pageData.totalPages) || 0;

    if (!rows.length) {
      body.innerHTML = '';
      var emptyBox = document.getElementById('ml-flow-empty');
      if (emptyBox) emptyBox.style.display = '';
      renderPager();
      return;
    }
    var emptyBox2 = document.getElementById('ml-flow-empty');
    if (emptyBox2) emptyBox2.style.display = 'none';

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var f = rows[i] || {};
      var chg = Number(f.changeLessons);
      var chgColor = chg < 0 ? '#d9534f' : '#2e9e5b';
      html +=
        '<tr>' +
        '<td>' + esc(dateText(f.createTime)) + '</td>' +
        '<td>' + esc(rowTitle(f)) + '</td>' +
        '<td>' + esc(sourceText(f.source)) + '</td>' +
        '<td style="color:' + chgColor + ';font-weight:600;text-align:right;">' + esc(changeText(f.changeLessons)) + '</td>' +
        '<td style="text-align:right;">' + esc(amount(f.remainingAfter)) + '</td>' +
        '<td>' + esc(f.reason || '') + '</td>' +
        '</tr>';
    }
    body.innerHTML = html;
    renderPager();
  }

  function renderPager() {
    var host = document.getElementById('ml-pager');
    if (!host) return;
    if (state.totalPages <= 1) { host.innerHTML = ''; return; }
    host.innerHTML =
      '<button type="button" class="btn btn-default" id="ml-prev" ' + (state.page <= 1 ? 'disabled' : '') + '>上一页</button>' +
      '<span style="margin:0 10px;">第 ' + state.page + ' / ' + state.totalPages + ' 页（共 ' + state.total + ' 条）</span>' +
      '<button type="button" class="btn btn-default" id="ml-next" ' + (state.page >= state.totalPages ? 'disabled' : '') + '>下一页</button>';
    var prev = document.getElementById('ml-prev');
    var next = document.getElementById('ml-next');
    if (prev) prev.addEventListener('click', function () { if (state.page > 1) loadFlows(state.page - 1); });
    if (next) next.addEventListener('click', function () { if (state.page < state.totalPages) loadFlows(state.page + 1); });
  }

  function showError(msg) {
    var host = document.getElementById('ml-flow-empty');
    if (host) { host.style.display = ''; host.textContent = msg; }
  }

  function loadBalance() {
    if (typeof window.request !== 'function') return;
    var EP = endpoints();
    window.request({ url: EP.LESSON_BALANCE, method: 'get', customLoading: false })
      .then(function (data) { renderBalance(data); })
      .catch(function () { showError('课时账户加载失败，请稍后重试'); });
  }

  function loadFlows(page) {
    if (typeof window.request !== 'function' || state.loading) return;
    state.loading = true;
    state.page = page || 1;
    var EP = endpoints();
    window.request({
      url: EP.LESSON_FLOWS,
      method: 'get',
      params: { pageNum: state.page, pageSize: PAGE_SIZE },
      customLoading: false
    })
      .then(function (data) { renderFlows(data); })
      .catch(function () { showError('课时流水加载失败，请稍后重试'); })
      .then(function () { state.loading = false; });
  }

  /**
   * 渲染「我的课时」页。由 student.html 的菜单 switch 调用。
   * @param {HTMLElement} container 内容容器（缺省取 #dynamic-content-center）
   */
  window.renderMyLessonPage = function (container) {
    var host = container || document.getElementById('dynamic-content-center');
    if (!host) return;

    var tpl = document.getElementById('tpl-my-lesson');
    if (!tpl) {
      host.innerHTML = '<div class="card"><div class="card-title">我的课时</div>' +
        '<p style="padding:12px 0;">页面模板缺失（#tpl-my-lesson），请联系管理员。</p></div>';
      return;
    }
    host.replaceChildren(tpl.content.cloneNode(true));
    if (typeof window.applyTerms === 'function') window.applyTerms(host);

    state.page = 1;
    state.total = 0;
    state.totalPages = 0;
    loadBalance();
    loadFlows(1);
  };
})();
