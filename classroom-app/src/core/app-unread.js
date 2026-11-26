/**
 * 未读消息角标（菜单项 + 桌面任务栏）
 * ==================================================================
 * 两块输出：
 *   ① 「消息中心」菜单项右上角的数字角标 —— 用户不点进去也知道有几条未读；
 *   ② 桌面壳（Electron）任务栏图标上的数字 —— 窗口最小化 / 被别的窗口盖住时
 *      也能看到，这是桌面端相对网页端唯一没法用页面元素替代的地方。
 *
 * 为什么单独一个文件、不并在 messages-inbox.js 里：
 *   那个文件是 frontend 的原件（App 只是复制过来），改它就得走 frontend-patches
 *   登记；而「菜单角标 + 任务栏」是 App 才需要的形态，放在 App 自有适配层最干净。
 *
 * 依赖（缺一不可，缺了静默降级，不影响页面其它功能）：
 *   axios                —— 页面已引入
 *   window.ApiPaths      —— 端点常量事实源（shared/apiPaths.js）
 *   localStorage.token / currentUser —— 登录态
 *
 * 说明：messages-inbox.js 里已有 setBadge()，它读的正是 #msg-unread-badge。
 *      本文件负责「把这个元素造出来」，两者共用同一元素，不会出现两个数字。
 */
(function () {
  'use strict';

  var POLL_MS = 60000;      // 轮询间隔：一分钟一次，够用且不打扰后端
  var lastCount = -1;       // 只为减少无意义的 IPC/重绘

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }
  function userId() {
    try {
      var cu = JSON.parse(localStorage.getItem('currentUser') || '{}');
      return cu && cu.userId;
    } catch (e) { return null; }
  }
  function msgBase() {
    return window.MESSAGE_API_BASE_URL || window.API_BASE_URL || '';
  }

  /** 找到「消息中心」菜单项；找不到（管理员页 / 无菜单页）返回 null */
  function menuItem() {
    return document.querySelector('.menu-item[key="messages"]');
  }

  /** 造出（或复用）角标元素 —— 与 messages-inbox.js 的 setBadge 共用同一 id */
  function ensureEl() {
    var item = menuItem();
    if (!item) return null;
    var el = document.getElementById('msg-unread-badge');
    if (!el) {
      el = document.createElement('span');
      el.id = 'msg-unread-badge';
      el.className = 'menu-unread-badge';
      item.appendChild(el);
    }
    return el;
  }

  function paint(n) {
    n = Number(n) || 0;
    if (n < 0) n = 0;

    var el = ensureEl();
    if (el) {
      if (n > 0) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.style.display = 'inline-block';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    }
    // 菜单项本身加个标记，方便样式上让「有未读」时标题加粗（可选）
    var item = menuItem();
    if (item) {
      if (n > 0) item.classList.add('has-unread');
      else item.classList.remove('has-unread');
    }

    // 桌面壳：推给主进程画任务栏角标
    if (n !== lastCount) {
      lastCount = n;
      try {
        if (window.classroomDesktop && typeof window.classroomDesktop.setUnread === 'function') {
          window.classroomDesktop.setUnread(n);
        }
      } catch (e) { /* 非桌面壳，忽略 */ }
    }
  }

  function refresh() {
    var uid = userId();
    var t = token();
    if (!uid || !t) return paint(0);
    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
    var path = EP.MSG_UNREAD ? EP.MSG_UNREAD(uid) : ('/api/v1/user/' + uid + '/inbox/unread-count');
    if (typeof axios !== 'function') return;

    axios.get(msgBase() + path, {
      timeout: 10000,
      headers: { Authorization: 'Bearer ' + t }
    }).then(function (resp) {
      var res = resp && resp.data;
      // Result 包一层：{code:200,data:n}
      var n = (res && typeof res === 'object' && 'data' in res) ? res.data : res;
      paint(n);
    }).catch(function () { /* 静默：角标失败不该弹错 */ });
  }

  function start() {
    ensureEl();
    refresh();
    setInterval(refresh, POLL_MS);
    // 从后台切回前台时立刻刷一次（手机切 App / 桌面切窗口都很常见）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });
    // 页面内其它地方标记已读后，可调 window.refreshUnreadBadge() 立即更新
    window.refreshUnreadBadge = refresh;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
