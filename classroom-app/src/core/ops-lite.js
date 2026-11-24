/**
 * 轻运营三件套（classic script，IIFE 自包含）
 * ==================================================================
 * 管理员手机端：巡课 / 强制结课 / 链接分发（发通知）。
 *
 * 设计边界（方案 §9「不做重后台」）：
 *   - 只做三件套，不含学情报表 / 对账 / 审核 / 契约联调 / 租户配置；
 *   - 端点全部用 shared/apiPaths.js 已登记常量（window.ApiPaths.ENDPOINTS），
 *     不新增字面量端点（避免 FP-003 类缺口）；
 *   - 参照小程序 package-classroom/monitor + distribute，但用纯 Web 实现
 *     （wx.showToast → 页面 toast，wx.showModal → confirm）。
 *
 * 依赖：window.request（utility_request.js）、window.ApiPaths（shared-domain-bridge.js）、
 *       window.classroomUrl（api.js，用于拼课堂链接，缺省时本地拼）。
 * 权限：后端 AdminConsoleController 强制 isManager()，非管理员调用会被 403。
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  var EP = (global.ApiPaths && global.ApiPaths.ENDPOINTS) || {};
  function req() { return global.request; }
  function toast(msg, bad) {
    var box = doc.getElementById('op-toast');
    if (!box) { if (global.console) console.log('[ops] ' + msg); return; }
    box.textContent = msg;
    box.className = 'toast ' + (bad ? 'bad' : 'ok');
    box.style.display = 'block';
    global.setTimeout(function () { box.style.display = 'none'; }, 3200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 课堂链接：优先用 api.js 的 classroomUrl，缺省本地拼（server 模式同源）
  function classLink(sid) {
    if (typeof global.classroomUrl === 'function') {
      try { return global.classroomUrl('', '/classroom.html?scheduleId=' + encodeURIComponent(sid)); } catch (e) { /* fall */ }
    }
    return 'classroom.html?scheduleId=' + encodeURIComponent(sid);
  }

  // ---------- 1) 巡课：进行中课堂列表 ----------
  function loadMonitor() {
    var ep = EP.CLASSROOM_ADMIN_CLASSROOMS || '/api/v1/admin/classrooms/monitor';
    var box = doc.getElementById('monitor-list');
    if (box) box.innerHTML = '<div class="loading">加载中…</div>';
    return req()({ url: ep, method: 'get' }).then(function (res) {
      var rows = (res && (res.rows || res.list || res.data)) || (Array.isArray(res) ? res : []);
      if (!Array.isArray(rows)) rows = [];
      if (!box) return rows;
      if (!rows.length) { box.innerHTML = '<div class="empty">当前没有进行中的课堂</div>'; return rows; }
      box.innerHTML = rows.map(function (r) {
        var sid = r.scheduleId || r.sid || r.id || '';
        var teacher = r.teacherName || r.teacher || r.teacherId || '-';
        var title = r.courseName || r.title || r.subject || ('课次 ' + sid);
        var status = r.status || '-';
        return '<div class="mcard" data-sid="' + esc(sid) + '">' +
          '<div class="mtop"><b>' + esc(title) + '</b><span class="badge">' + esc(status) + '</span></div>' +
          '<div class="mmeta">课次 ' + esc(sid) + ' · 教师 ' + esc(teacher) + '</div>' +
          '<div class="mops">' +
            '<button data-act="link">复制链接</button>' +
            '<button data-act="notice">发通知</button>' +
            '<button data-act="end" class="danger">强制结课</button>' +
          '</div></div>';
      }).join('');
      return rows;
    }).catch(function (e) { toast('巡课列表加载失败：' + (e && e.message || e), true); return []; });
  }

  // ---------- 2) 强制结课 ----------
  function endClass(sid) {
    if (!sid) { toast('缺少课次标识', true); return Promise.resolve(false); }
    if (!global.confirm('确认强制结束课次 ' + sid + ' 的课堂？此操作不可撤销。')) return Promise.resolve(false);
    var tpl = EP.CLASSROOM_ADMIN_END;
    var ep = typeof tpl === 'function' ? tpl(sid) : '/api/v1/admin/classrooms/' + encodeURIComponent(sid) + '/end';
    return req()({ url: ep, method: 'post' }).then(function () {
      toast('已强制结课：' + sid);
      loadMonitor();
      return true;
    }).catch(function (e) { toast('强制结课失败：' + (e && e.message || e), true); return false; });
  }

  // ---------- 3) 链接分发 / 发通知 ----------
  function copyLink(sid) {
    var url = classLink(sid);
    var done = function () { toast('课堂链接已复制'); };
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
    }
    fallbackCopy(url, done);
    return Promise.resolve(true);
  }
  function fallbackCopy(text, done) {
    var ta = doc.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    try { doc.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制：' + text, true); }
    doc.body.removeChild(ta);
  }

  function openNotice(sid) {
    var box = doc.getElementById('notice-panel');
    var sidBox = doc.getElementById('notice-sid');
    if (!box || !sidBox) return;
    sidBox.value = sid || '';
    box.style.display = 'block';
    box.scrollIntoView && box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function sendNotice() {
    var sid = (doc.getElementById('notice-sid') || {}).value || '';
    var text = (doc.getElementById('notice-text') || {}).value || '';
    if (!sid || !text.trim()) { toast('请填写课次与通知内容', true); return Promise.resolve(false); }
    var url = classLink(sid);
    var payload = { content: text.trim(), url: url, targetType: 'classroom', scheduleId: sid };
    // 平台管理员需带 targetTenantId（与小程序 distribute.js:225 一致）
    var user = {};
    try { user = JSON.parse(global.localStorage.getItem('currentUser') || '{}') || {}; } catch (e) { /* ignore */ }
    if (user.role === 'platform_admin' && user.targetTenantId) payload.targetTenantId = user.targetTenantId;

    var ep = EP.MSG_SEND || '/api/v1/messages/send';
    return req()({ url: ep, method: 'post', data: payload }).then(function () {
      toast('通知已发送');
      var t = doc.getElementById('notice-text'); if (t) t.value = '';
      return true;
    }).catch(function (e) { toast('发送失败：' + (e && e.message || e), true); return false; });
  }

  // ---------- 事件绑定（事件委托，卡片为动态渲染） ----------
  function bind() {
    var list = doc.getElementById('monitor-list');
    if (list) list.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button[data-act]');
      if (!btn) return;
      var card = btn.closest('.mcard');
      var sid = card ? card.getAttribute('data-sid') : '';
      var act = btn.getAttribute('data-act');
      if (act === 'link') copyLink(sid);
      else if (act === 'notice') openNotice(sid);
      else if (act === 'end') endClass(sid);
    });
    var refresh = doc.getElementById('op-refresh');
    if (refresh) refresh.addEventListener('click', function () { loadMonitor(); });
    var send = doc.getElementById('notice-send');
    if (send) send.addEventListener('click', function () { sendNotice(); });
    var cancel = doc.getElementById('notice-cancel');
    if (cancel) cancel.addEventListener('click', function () {
      var box = doc.getElementById('notice-panel'); if (box) box.style.display = 'none';
    });
  }

  function run() {
    bind();
    if (!req()) { toast('请求层未就绪，请确认脚本加载顺序', true); return; }
    loadMonitor();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
  else run();

  global.OpsLite = { loadMonitor: loadMonitor, endClass: endClass, copyLink: copyLink,
    openNotice: openNotice, sendNotice: sendNotice, classLink: classLink };
})(typeof window !== 'undefined' ? window : this);
