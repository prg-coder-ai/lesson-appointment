/**
 * 审计日志浏览脚本
 * 依赖: utility_request.js (window.request), auth.js
 *
 * ⚠️ 必须整体包在 IIFE 里：本页先加载的 js/public/termsFunction.js 在**顶层**
 * 声明了 `const EP`；若本文件也在顶层写 `var EP`，后加载者会在解析阶段抛
 * "Identifier 'EP' has already been declared"，整个脚本一个函数都不注册，
 * 页面只剩「模块未加载」的兜底文案。IIFE 隔离后，内联 onclick 需要的入口
 * 在文件末尾显式挂 window（见 check:global-collide 的判定）。
 */
(function () {
  'use strict';

  var PAGE_SIZE = 20;

  /* 端点常量取自共享事实源（shared/apiPaths.js 经桥接挂到 window.ApiPaths） */
  var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  /* 操作类型 → 中文文案：运行时从后端 AuditAction.label 拉取，前端不另抄一份映射表。
     旧后端没有 /action-labels 时静默回退英文枚举名，功能不受影响。 */
  var AUDIT_ACTION_LABEL_MAP = {};
  function auditActionLabel(a) {
      if (!a) return a || '';
      return AUDIT_ACTION_LABEL_MAP[a] || a;
  }

  // 初始化操作类型下拉框
  async function initActions() {
      try {
          try {
              var labels = await request({ url: EP.AUDIT_LOG_ACTION_LABELS, method: 'get' });
              if (labels && typeof labels === 'object') AUDIT_ACTION_LABEL_MAP = labels;
          } catch (e) { /* 兼容旧后端：无中文端点时保持英文 */ }
          var res = await request({ url: '/api/audit-logs/actions', method: 'get' });
          var actions = (res && res.data) || res || [];
          if (!Array.isArray(actions)) actions = [];
          var select = document.getElementById('f-action');
          actions.forEach(function(a) {
              var opt = document.createElement('option');
              opt.value = a;                       // 筛选参数仍传英文枚举名
              opt.textContent = auditActionLabel(a);
              opt.title = a;                       // 悬浮可看原始枚举，便于排障
              select.appendChild(opt);
          });
      } catch (e) {
          console.error('加载操作类型失败:', e);
      }
  }

  // 加载审计日志列表
  async function loadAuditLogs(page) {
      page = page || 1;
      var action = document.getElementById('f-action').value;
      var resType = document.getElementById('f-resourceType').value;
      var result = document.getElementById('f-result').value;
      var start = document.getElementById('f-start').value;
      var end = document.getElementById('f-end').value;
      var userId = document.getElementById('f-userId').value.trim();

      var params = { page: page, size: PAGE_SIZE };
      if (action) params.action = action;
      if (resType) params.resourceType = resType;
      if (result) params.resultStatus = result;
      // 本地日期 → UTC 边界（库里存 UTC 墙钟；直接传 'yyyy-MM-dd' 会让查询边界偏一个时区）
      var startUtc = localDateBoundaryUtc(start, false);
      var endUtc = localDateBoundaryUtc(end, true);
      if (startUtc) params.startDate = startUtc;
      if (endUtc) params.endDate = endUtc;
      if (userId) params.userId = userId;

      try {
          var res = await request({ url: '/api/audit-logs', method: 'get', params: params });
          var data = (res && res.data) || res || {};
          var records = data.rows || data.records || [];
          var total = data.total || 0;

          var tbody = document.getElementById('audit-tbody');
          if (records.length === 0) {
              tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;">暂无数据</td></tr>';
          } else {
              tbody.innerHTML = records.map(function(r) {
                  return '<tr>' +
                      '<td>' + formatTime(r.createdAt) + '</td>' +
                      '<td>' + escHtml(r.userName || '-') + '</td>' +
                      '<td>' + escHtml(r.userRole || '-') + '</td>' +
                      '<td title="' + escHtml(r.action || '') + '">' + escHtml(auditActionLabel(r.action || '')) + '</td>' +
                      '<td>' + escHtml(r.resourceType || '') + ':' + escHtml(r.resourceId || '') + '</td>' +
                      '<td class="badge-' + (r.resultStatus === 'success' ? 'success' : 'fail') + '">' +
                          escHtml(r.resultStatus || '') + '</td>' +
                      '<td>' + (r.costMs != null ? r.costMs + 'ms' : '-') + '</td>' +
                      '<td>' + escHtml(r.ip || '-') + '</td>' +
                      '<td><a href="#" onclick="showDetail(\'' + r.logId + '\');return false;">查看</a></td>' +
                  '</tr>';
              }).join('');
          }

          renderPagination(page, Math.ceil(total / PAGE_SIZE));
      } catch (e) {
          console.error('加载审计日志失败:', e);
          document.getElementById('audit-tbody').innerHTML =
              '<tr><td colspan="9" style="text-align:center;color:#f00;">加载失败</td></tr>';
      }
  }

  // 查看详情
  async function showDetail(logId) {
      try {
          var res = await request({ url: '/api/audit-logs/' + logId, method: 'get' });
          var d = (res && res.data) || res || {};
          var html = '<div style="margin-bottom:8px;"><strong>操作时间：</strong>' + formatTime(d.createdAt) + '</div>' +
              '<div style="margin-bottom:8px;"><strong>操作人：</strong>' + escHtml(d.userName || '-') +
              ' (' + escHtml(d.userId || '-') + ')</div>' +
              '<div style="margin-bottom:8px;"><strong>角色：</strong>' + escHtml(d.userRole || '-') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>操作类型：</strong>' + escHtml(auditActionLabel(d.action || '-'))
              + (d.action ? ' <span style="color:#8a94a6;font-size:12px;">(' + escHtml(d.action) + ')</span>' : '') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>资源：</strong>' +
              escHtml(d.resourceType || '') + ' : ' + escHtml(d.resourceId || '') +
              (d.resourceName ? ' (' + escHtml(d.resourceName) + ')' : '') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>方法：</strong>' + escHtml(d.method || '-') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>请求：</strong>' +
              escHtml(d.httpMethod || '') + ' ' + escHtml(d.requestUrl || '') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>IP：</strong>' + escHtml(d.ip || '-') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>User-Agent：</strong>' + escHtml(d.userAgent || '-') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>结果：</strong>' +
              '<span class="badge-' + (d.resultStatus === 'success' ? 'success' : 'fail') + '">' +
              escHtml(d.resultStatus || '-') + '</span>' +
              (d.errorMsg ? ' - ' + escHtml(d.errorMsg) : '') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>耗时：</strong>' +
              (d.costMs != null ? d.costMs + 'ms' : '-') + '</div>' +
              '<div style="margin-bottom:8px;"><strong>请求参数：</strong></div>' +
              '<div class="audit-detail">' + escHtml(d.requestParams || '(无)') + '</div>';
          document.getElementById('audit-detail-content').innerHTML = html;
          document.getElementById('audit-detail-modal').style.display = 'block';
      } catch (e) {
          console.error('加载详情失败:', e);
      }
  }

  function closeDetail() {
      document.getElementById('audit-detail-modal').style.display = 'none';
  }

  function resetFilter() {
      document.getElementById('f-action').value = '';
      document.getElementById('f-resourceType').value = '';
      document.getElementById('f-result').value = '';
      document.getElementById('f-start').value = '';
      document.getElementById('f-end').value = '';
      document.getElementById('f-userId').value = '';
      loadAuditLogs(1);
  }

  // 渲染分页
  function renderPagination(current, totalPages) {
      var container = document.getElementById('audit-pagination');
      if (totalPages <= 1) {
          container.innerHTML = '';
          return;
      }
      var html = '';
      html += '<button ' + (current <= 1 ? 'disabled' : '') +
          ' onclick="loadAuditLogs(' + (current - 1) + ')">上一页</button>';
      for (var i = 1; i <= totalPages && i <= 10; i++) {
          html += '<button class="' + (i === current ? 'active' : '') +
              '" onclick="loadAuditLogs(' + i + ')">' + i + '</button>';
      }
      html += '<button ' + (current >= totalPages ? 'disabled' : '') +
          ' onclick="loadAuditLogs(' + (current + 1) + ')">下一页</button>';
      container.innerHTML = html;
  }

  // ============================================================
  // 工具函数
  //
  // 时区口径（2026-10-25 修订，见 doc-develop/ 审计日志时区口径说明）：
  //   audit_log.created_at 存的是 **UTC 墙钟**（连接串 serverTimezone=UTC +
  //   Connector/J 默认 preserveInstants=true，写入端 AuditAspect 只 setCreatedAt(new Date())），
  //   后端 JSON 出去是 '2026-10-24T14:00:15.000+00:00'（带偏移，语义完整）。
  //
  //   ⚠️ 这里**不能**用 DatetimeDomain.formatDateTime：它是
  //      String(iso).replace('T',' ').substring(0,19)，等于把 '+00:00' 截掉，
  //      把 UTC 直接当本地时间显示 —— 东八区会整体慢 8 小时，且不报错。
  //      必须走 utcToZoned 换算到浏览器时区。
  // ============================================================

  /** 取浏览器 IANA 时区名（如 Asia/Shanghai）；取不到返回 'UTC'。 */
  function auditZoneName() {
      try {
          if (window.DatetimeDomain && typeof window.DatetimeDomain.nowUserTz === 'function') {
              return window.DatetimeDomain.nowUserTz();
          }
          return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch (e) {
          return 'UTC';
      }
  }

  /** 当前 UTC 偏移的展示串，如 'UTC+08:00'。注意 getTimezoneOffset 返回的是**反向**分钟数。 */
  function auditZoneOffsetText() {
      var minutes = -new Date().getTimezoneOffset();
      if (isNaN(minutes)) return 'UTC';
      var sign = minutes < 0 ? '-' : '+';
      var abs = Math.abs(minutes);
      var hh = ('0' + Math.floor(abs / 60)).slice(-2);
      var mm = ('0' + (abs % 60)).slice(-2);
      return 'UTC' + sign + hh + ':' + mm;
  }

  /** 后端 UTC 串 → 浏览器时区的 'yyyy-MM-dd HH:mm:ss'。 */
  function formatTime(t) {
      if (!t) return '-';
      var D = window.DatetimeDomain;
      if (D && typeof D.utcToZoned === 'function') {
          var zoned = D.utcToZoned(t, undefined, true); // 第三个参数 = 带秒
          if (zoned) return zoned;
      }
      // 兜底：DatetimeDomain 没挂上时宁可原样显示，也不要截断丢时区标识（那样会静默偏移）
      return String(t).replace('T', ' ');
  }

  /**
   * 把 <input type="date"> 的**本地日期**换成 UTC 边界的 ISO 串（带 Z）。
   *
   * 为什么必须转：库里是 UTC 墙钟，后端若直接拼 'yyyy-MM-dd 00:00:00' 去比较，
   * 等于按 UTC 解释用户选的本地日期，查询边界整体偏 8 小时（东八区上午 8 点前查不到）。
   *
   * ⚠️ 不能用 new Date('2026-10-24')：ECMAScript 规定纯日期串按 **UTC** 解析，
   *    与这里的本意正好错反方向；必须用年月日分量构造本地时间。
   *
   * 例：本地 2026-10-24 00:00（Asia/Shanghai）→ '2026-10-23T16:00:00.000Z'
   */
  function localDateBoundaryUtc(dateStr, isEnd) {
      if (!dateStr) return '';
      var p = String(dateStr).split('-');
      if (p.length !== 3) return '';
      var y = Number(p[0]), mo = Number(p[1]), d = Number(p[2]);
      if (!y || !mo || !d) return '';
      var dt = isEnd
          ? new Date(y, mo - 1, d, 23, 59, 59, 999)
          : new Date(y, mo - 1, d, 0, 0, 0, 0);
      if (isNaN(dt.getTime())) return '';
      return dt.toISOString();
  }

  /** 在卡片标题旁渲染「时间为本地时间 + 当前时区名」。 */
  function renderZoneHint() {
      var el = document.getElementById('tz-hint');
      if (!el) return;
      var name = auditZoneName();
      var offset = auditZoneOffsetText();
      el.textContent = '日期为本地时间（' + name + '，' + offset + '）';
      el.title = '数据库 audit_log.created_at 存 UTC；本页按当前浏览器时区换算后显示。'
          + '时区取自浏览器设置，换机器/改系统时区会随之变化。';
  }

  function escHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 内联 onclick（查询/重置/关闭/分页/详情）只能读全局作用域，
     IIFE 隔离后必须把这些入口逐个显式挂出，否则点击报 "xxx is not defined"。 */
  window.initActions = initActions;
  window.loadAuditLogs = loadAuditLogs;
  window.showDetail = showDetail;
  window.closeDetail = closeDetail;
  window.resetFilter = resetFilter;
  window.renderZoneHint = renderZoneHint;
  window.renderPagination = renderPagination;
  window.formatTime = formatTime;
  window.escHtml = escHtml;
  window.localDateBoundaryUtc = localDateBoundaryUtc;
  window.auditActionLabel = auditActionLabel;

  // 初始化
  initActions();
  renderZoneHint();
  loadAuditLogs(1);
})();
