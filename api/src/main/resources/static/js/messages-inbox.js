/**
 * 消息中心前端模块（学生/教师/管理员/平台管理员 共用）
 * 依赖：axios（页面已引入）、window.escapeHtml（api.js，缺则自带兜底）、localStorage.token / currentUser
 * 跨端口调用 message-service(8090)：mreq 实例（Bearer + 响应解包 + SSE）
 * 同端口调用主系统 api(8081)：areq 实例（解析接收人 scope 用 /user/message-recipients）
 *
 * 功能覆盖（按业务需求）：
 *  - 接收：收件箱/收藏/回收站、未读角标、SSE 实时推送、删除(移回收站)、标已读/未读/收藏
 *  - 发送：不指定具体管理员，按 scope 自动解析接收人（一个/全部由勾选控制）；教师/学生也可指定某位老师/管理员
 *  - 已发：查看已发消息、对「接收方未读」的消息执行收回
 *  - 离线暂存：消息服务不可达时，最初 10 条未发送消息存入 localStorage，恢复后自动重发
 *  - 入口：window.openComposeMessage() / window.openComposeToUser(userId, role, name)（列表页「发消息」链接用）
 */
(function () {
  'use strict';
  if (typeof axios === 'undefined') {
    console.error('messages-inbox.js 依赖 axios，请先引入 axios CDN');
    return;
  }

  // message-service 基址：默认同源主机 + 8090，可用 window.MESSAGE_API_BASE_URL 覆盖
  const MSG_BASE = window.MESSAGE_API_BASE_URL || ('http://' + location.hostname + ':8090');
  // api 基址：同源 8081（默认相对路径）
  const API_BASE = window.API_BASE_URL || '';
  const OFFLINE_KEY = 'msg_offline_queue';

  const esc = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function (s) {
        return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      };

  // ---- message-service(8090) 独立 axios 实例 ----
  const mreq = axios.create({ baseURL: MSG_BASE, timeout: 15000, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
  mreq.interceptors.request.use(function (config) {
    const t = localStorage.getItem('token');
    if (t) config.headers.Authorization = 'Bearer ' + t;
    return config;
  }, function (err) { return Promise.reject(err); });
  mreq.interceptors.response.use(function (resp) {
    const res = resp.data;
    if (res && res.code === 200) return res.data;
    const msg = (res && (res.message || res.msg)) || '操作失败';
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(res || new Error(msg));
  }, function (error) {
    let msg = '网络异常，请稍后重试';
    if (error.response) {
      const st = error.response.status;
      if (st === 401) { msg = '登录已过期，请重新登录'; cleanupAuth(); setTimeout(function () { location.href = './index.html'; }, 600); }
      else if (st === 403) { msg = '无权限访问该资源'; }
      else if (st === 404) { msg = '接口地址不存在'; }
      else if (st === 500) { msg = '服务器内部错误'; }
      else { msg = '请求错误：' + st; }
    } else if (error.code === 'ECONNABORTED') { msg = '请求超时，请稍后重试'; }
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(error);
  });

  // ---- api(8081) 独立 axios 实例（解析接收人 scope）----
  const areq = axios.create({ baseURL: API_BASE, timeout: 15000, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
  areq.interceptors.request.use(function (config) {
    const t = localStorage.getItem('token');
    if (t) config.headers.Authorization = 'Bearer ' + t;
    return config;
  }, function (err) { return Promise.reject(err); });
  areq.interceptors.response.use(function (resp) {
    const res = resp.data;
    if (res && res.code === 200) return res.data;
    const msg = (res && (res.message || res.msg)) || '操作失败';
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(res || new Error(msg));
  }, function (error) {
    let msg = '网络异常，请稍后重试';
    if (error.response) {
      const st = error.response.status;
      if (st === 401) { msg = '登录已过期，请重新登录'; cleanupAuth(); setTimeout(function () { location.href = './index.html'; }, 600); }
      else if (st === 403) { msg = '无权限访问该资源'; }
      else { msg = '请求错误：' + st; }
    }
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(error);
  });

  function cleanupAuth() {
    try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); localStorage.removeItem('currentUser'); } catch (e) {}
  }

  // ---- 模块级状态（单例）----
  const state = { userId: null, folder: 'inbox', pageNum: 1, pageSize: 10, keyword: '', total: 0, selected: {} };
  let es = null;

  function curUserId() {
    try { const cu = JSON.parse(localStorage.getItem('currentUser') || '{}'); return cu && cu.userId; } catch (e) { return null; }
  }
  function currentUserRole() {
    try { const cu = JSON.parse(localStorage.getItem('currentUser') || '{}'); return (cu && cu.role) || null; } catch (e) { return null; }
  }
  // 学生也可发送（向教师/管理员）；教师/管理员/平台管理员均可发送
  function canSend() {
    const r = currentUserRole();
    return r === 'student' || r === 'teacher' || r === 'admin' || r === 'platform_admin';
  }
  // 服务是否不可达（用于离线暂存判定）
  function isUnreachable(err) {
    if (!err) return true;
    if (err.response) return false; // 有 HTTP 响应（4xx/5xx）视为已可达，仅业务失败，不暂存
    return true; // 连接拒绝/超时/DNS/Network Error
  }

  // ---- 样式（仅注入一次）----
  function ensureStyle() {
    if (document.getElementById('msg-inbox-style')) return;
    const css = [
      '.msg-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;}',
      '.msg-tabs{display:inline-flex;border:1px solid var(--border-color,#eee);border-radius:8px;overflow:hidden;}',
      '.msg-tab{padding:6px 14px;cursor:pointer;font-size:14px;background:#fff;color:#555;border:none;}',
      '.msg-tab.active{background:var(--primary-color,#3a7afe);color:#fff;}',
      '.msg-search{flex:1;min-width:160px;max-width:280px;padding:7px 10px;border:1px solid var(--border-color,#eee);border-radius:8px;}',
      '.msg-list{display:flex;flex-direction:column;gap:8px;}',
      '.msg-item{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--border-color,#eee);border-radius:10px;background:#fff;cursor:pointer;transition:.15s;}',
      '.msg-item:hover{box-shadow:0 2px 10px rgba(0,0,0,.06);}',
      '.msg-item.unread{background:#f5f9ff;}',
      '.msg-check{margin-top:5px;flex:none;}',
      '.msg-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;background:#3a7afe;flex:none;visibility:hidden;}',
      '.msg-item.unread .msg-dot{visibility:visible;}',
      '.msg-main{flex:1;min-width:0;}',
      '.msg-title{font-size:15px;font-weight:600;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.msg-item.unread .msg-title{font-weight:700;}',
      '.msg-sub{font-size:12px;color:#888;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;}',
      '.msg-actions{flex:none;display:flex;gap:6px;align-items:center;}',
      '.msg-star{color:#f5a623;cursor:pointer;font-size:16px;}',
      '.msg-star.off{color:#ccc;}',
      '.msg-badge{display:inline-block;min-width:18px;height:18px;line-height:18px;padding:0 5px;border-radius:9px;background:#ff4d4f;color:#fff;font-size:11px;text-align:center;margin-left:6px;vertical-align:middle;}',
      '.msg-pri{font-size:11px;padding:1px 6px;border-radius:4px;}',
      '.msg-pri.HIGH{background:#fff1f0;color:#cf1322;}',
      '.msg-pri.MEDIUM{background:#e6f7ff;color:#096dd9;}',
      '.msg-pri.LOW{background:#f6ffed;color:#389e0d;}',
      '.msg-empty{text-align:center;color:#999;padding:40px 0;}',
      '.msg-pager{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px;font-size:14px;}',
      '.btn-sm{padding:4px 10px;font-size:12px;}',
      '.msg-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:2000;}',
      '.msg-modal{background:#fff;width:600px;max-width:92vw;max-height:86vh;overflow:auto;border-radius:12px;padding:22px 24px;}',
      '.msg-modal h3{margin:0 0 10px;}',
      '.msg-modal .row{font-size:13px;color:#666;margin:6px 0;}',
      '.msg-modal .body{margin-top:12px;padding:12px;background:#fafafa;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:14px;color:#333;}',
      '.msg-rcpt-list{max-height:200px;overflow:auto;border:1px solid #eee;border-radius:8px;padding:8px;margin-top:6px;}'
    ].join('');
    const st = document.createElement('style');
    st.id = 'msg-inbox-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- 未读角标 ----
  function setBadge(n) {
    const el = document.getElementById('msg-unread-badge');
    if (!el) return;
    n = Number(n) || 0;
    if (n > 0) { el.style.display = 'inline-block'; el.textContent = n > 99 ? '99+' : n; }
    else { el.style.display = 'none'; }
  }
  async function refreshBadge() {
    const uid = state.userId || curUserId();
    if (!uid) return;
    try { const n = await mreq.get('/api/v1/users/' + encodeURIComponent(uid) + '/inbox/unread-count'); setBadge(n); } catch (e) { /* 静默 */ }
  }
  window.initMessageBadge = function () {
    state.userId = curUserId();
    if (!state.userId) return;
    ensureStyle();
    refreshBadge();
  };

  // ---- 主渲染 ----
  window.renderMessagesPage = function (container) {
    if (!container) return;
    state.userId = curUserId();
    if (!state.userId) { container.innerHTML = '<div class="msg-empty">未登录，无法加载消息中心。</div>'; return; }
    ensureStyle();
    state.folder = 'inbox'; state.pageNum = 1; state.keyword = ''; state.selected = {};
    const composeBtn = canSend()
      ? '<button class="btn btn-primary" id="msg-compose"><i class="fa fa-paper-plane"></i> 发送通知</button>'
      : '';
    const sentTab = canSend()
      ? '<button class="msg-tab" data-folder="sent">已发</button>'
      : '';
    container.innerHTML =
      '<div class="msg-toolbar">' +
        '<div class="msg-tabs">' +
          '<button class="msg-tab active" data-folder="inbox">收件箱</button>' +
          '<button class="msg-tab" data-folder="starred">收藏</button>' +
          '<button class="msg-tab" data-folder="trash">回收站</button>' +
          sentTab +
        '</div>' +
        '<input class="msg-search" id="msg-search" placeholder="搜索标题关键词">' +
        '<button class="btn btn-gray" id="msg-search-btn"><i class="fa fa-search"></i> 搜索</button>' +
        '<button class="btn btn-gray" id="msg-allread"><i class="fa fa-check-double"></i> 全部已读</button>' +
        '<button class="btn btn-gray" id="msg-batch-read"><i class="fa fa-check"></i> 批量已读</button>' +
        '<button class="btn btn-gray" id="msg-batch-del"><i class="fa fa-trash"></i> 批量删除</button>' +
        '<button class="btn btn-primary" id="msg-refresh"><i class="fa fa-refresh"></i> 刷新</button>' +
        composeBtn +
      '</div>' +
      '<div class="msg-list" id="msg-list"></div>' +
      '<div class="msg-pager" id="msg-pager"></div>' +
      '<div id="msg-modal-root"></div>';

    container.querySelectorAll('.msg-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        container.querySelectorAll('.msg-tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        state.folder = t.getAttribute('data-folder'); state.pageNum = 1; state.selected = {};
        loadMessages(container);
      });
    });
    container.querySelector('#msg-search-btn').addEventListener('click', function () {
      state.keyword = container.querySelector('#msg-search').value.trim(); state.pageNum = 1; loadMessages(container);
    });
    container.querySelector('#msg-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') container.querySelector('#msg-search-btn').click(); });
    container.querySelector('#msg-refresh').addEventListener('click', function () { loadMessages(container); refreshBadge(); flushOfflineQueue(); });
    container.querySelector('#msg-allread').addEventListener('click', function () { markAllRead(container); });
    container.querySelector('#msg-batch-read').addEventListener('click', function () { batchRead(container); });
    container.querySelector('#msg-batch-del').addEventListener('click', function () { batchDelete(container); });
    const composeEl = container.querySelector('#msg-compose');
    if (composeEl) composeEl.addEventListener('click', function () { openComposeMessage(); });

    connectSse();
    loadMessages(container);
    refreshBadge();
    flushOfflineQueue(); // 进入页面即尝试重发离线消息
  };

  async function loadMessages(container) {
    const listEl = container.querySelector('#msg-list');
    const pagerEl = container.querySelector('#msg-pager');
    if (!listEl) return;
    listEl.innerHTML = '<div class="msg-empty">加载中…</div>';
    const uid = state.userId;
    let url; const params = { pageNum: state.pageNum, pageSize: state.pageSize };
    let renderRow;
    if (state.folder === 'sent') {
      url = '/api/v1/messages/sent';
      renderRow = sentRowHtml;
    } else if (state.folder === 'starred') { url = '/api/v1/users/' + encodeURIComponent(uid) + '/starred'; renderRow = rowHtml; }
    else if (state.folder === 'trash') { url = '/api/v1/users/' + encodeURIComponent(uid) + '/deleted'; renderRow = rowHtml; }
    else { url = '/api/v1/users/' + encodeURIComponent(uid) + '/inbox'; if (state.keyword) params.keyword = state.keyword; renderRow = rowHtml; }
    let data;
    try { data = await mreq.get(url, { params: params }); }
    catch (e) { listEl.innerHTML = '<div class="msg-empty">加载失败，请稍后重试。</div>'; return; }

    const rows = (data && data.rows) || [];
    state.total = (data && data.total) || 0;
    if (!rows.length) { listEl.innerHTML = '<div class="msg-empty">暂无消息</div>'; if (pagerEl) pagerEl.innerHTML = ''; return; }
    listEl.innerHTML = rows.map(renderRow).join('');
    if (state.folder === 'sent') bindSentRowEvents(container, rows);
    else bindRowEvents(container, rows);
    renderPager(container);
  }

  function rowHtml(m) {
    const mid = m.messageId;
    const unread = !m.isRead;
    const starred = !!m.isStarred;
    const pri = m.priority || 'MEDIUM';
    const time = m.sendTime ? String(m.sendTime).replace('T', ' ').substring(0, 16) : '';
    const cat = m.categoryName ? esc(m.categoryName) : '';
    const sender = m.senderName ? esc(m.senderName) : '系统';
    const title = m.title ? esc(m.title) : '(无标题)';
    const checked = state.selected[mid] ? 'checked' : '';
    return '' +
      '<div class="msg-item ' + (unread ? 'unread' : '') + '" data-mid="' + mid + '">' +
        '<input type="checkbox" class="msg-check" data-mid="' + mid + '" ' + checked + '>' +
        '<span class="msg-dot"></span>' +
        '<span class="msg-star ' + (starred ? '' : 'off') + '" data-act="star" data-mid="' + mid + '" title="收藏">' + (starred ? '★' : '☆') + '</span>' +
        '<div class="msg-main" data-act="open" data-mid="' + mid + '">' +
          '<div class="msg-title">' + title + '</div>' +
          '<div class="msg-sub">' +
            '<span>来自：' + sender + '</span>' +
            (cat ? '<span>分类：' + cat + '</span>' : '') +
            '<span class="msg-pri ' + pri + '">' + pri + '</span>' +
            '<span>' + time + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="msg-actions">' +
          (unread
            ? '<button class="btn btn-gray btn-sm" data-act="read" data-mid="' + mid + '">标记已读</button>'
            : '<button class="btn btn-gray btn-sm" data-act="unread" data-mid="' + mid + '">标未读</button>') +
          (state.folder === 'trash'
            ? '<button class="btn btn-gray btn-sm" data-act="restore" data-mid="' + mid + '">恢复</button>'
            : '<button class="btn btn-gray btn-sm" data-act="delete" data-mid="' + mid + '">删除</button>') +
        '</div>' +
      '</div>';
  }

  function sentRowHtml(m) {
    const mid = m.messageId;
    const pri = m.priority || 'MEDIUM';
    const time = m.sendTime ? String(m.sendTime).replace('T', ' ').substring(0, 16) : '';
    const cat = m.categoryCode ? esc(m.categoryCode) : '';
    const title = m.title ? esc(m.title) : '(无标题)';
    const rc = Number(m.recipientCount) || 0;
    const rd = Number(m.readCount) || 0;
    const recallable = !!m.recallable;
    const statusTxt = m.status === 'recalled' ? '已收回' : (m.status === 'partial_recalled' ? '部分收回' : '已发送');
    return '' +
      '<div class="msg-item" data-mid="' + mid + '">' +
        '<span class="msg-dot" style="visibility:hidden;"></span>' +
        '<div class="msg-main" data-act="open-sent" data-mid="' + mid + '">' +
          '<div class="msg-title">' + title + '</div>' +
          '<div class="msg-sub">' +
            (cat ? '<span>分类：' + cat + '</span>' : '') +
            '<span class="msg-pri ' + pri + '">' + pri + '</span>' +
            '<span>接收 ' + rc + ' 人 · 已读 ' + rd + ' 人</span>' +
            '<span>状态：' + statusTxt + '</span>' +
            '<span>' + time + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="msg-actions">' +
          (recallable
            ? '<button class="btn btn-warning btn-sm" data-act="recall" data-mid="' + mid + '">收回</button>'
            : '<button class="btn btn-gray btn-sm" disabled>不可收回</button>') +
        '</div>' +
      '</div>';
  }

  function bindRowEvents(container, rows) {
    container.querySelectorAll('.msg-item').forEach(function (item) {
      const mid = item.getAttribute('data-mid');
      const check = item.querySelector('.msg-check');
      if (check) check.addEventListener('click', function (e) { e.stopPropagation(); state.selected[mid] = check.checked; });
      const star = item.querySelector('[data-act="star"]');
      if (star) star.addEventListener('click', function (e) { e.stopPropagation(); toggleStar(container, mid); });
      const main = item.querySelector('[data-act="open"]');
      if (main) main.addEventListener('click', function () { openDetail(container, mid); });
      item.querySelectorAll('[data-act="read"],[data-act="unread"],[data-act="delete"],[data-act="restore"]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          const act = b.getAttribute('data-act');
          if (act === 'read') markRead(container, mid, true);
          else if (act === 'unread') markRead(container, mid, false);
          else if (act === 'delete') removeMsg(container, mid);
          else if (act === 'restore') restoreMsg(container, mid);
        });
      });
    });
  }

  function bindSentRowEvents(container, rows) {
    container.querySelectorAll('.msg-item').forEach(function (item) {
      const mid = item.getAttribute('data-mid');
      const main = item.querySelector('[data-act="open-sent"]');
      if (main) main.addEventListener('click', function () { openSentDetail(container, mid); });
      const recall = item.querySelector('[data-act="recall"]');
      if (recall) recall.addEventListener('click', function (e) {
        e.stopPropagation();
        recallMessage(container, mid);
      });
    });
  }

  function renderPager(container) {
    const el = container.querySelector('#msg-pager');
    if (!el) return;
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    el.innerHTML =
      '<button class="btn btn-gray btn-sm" id="msg-prev" ' + (state.pageNum <= 1 ? 'disabled' : '') + '>上一页</button>' +
      '<span>第 ' + state.pageNum + ' / ' + totalPages + ' 页（共 ' + state.total + ' 条）</span>' +
      '<button class="btn btn-gray btn-sm" id="msg-next" ' + (state.pageNum >= totalPages ? 'disabled' : '') + '>下一页</button>';
    const prev = el.querySelector('#msg-prev'); const next = el.querySelector('#msg-next');
    if (prev) prev.addEventListener('click', function () { if (state.pageNum > 1) { state.pageNum--; loadMessages(container); } });
    if (next) next.addEventListener('click', function () { if (state.pageNum < totalPages) { state.pageNum++; loadMessages(container); } });
  }

  async function openDetail(container, mid) {
    let d;
    try { d = await mreq.get('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/' + mid); }
    catch (e) { return; }
    const root = container.querySelector('#msg-modal-root');
    const content = d.content ? esc(d.content) : '(无正文)';
    const payload = d.payload ? esc(JSON.stringify(d.payload)) : '';
    root.innerHTML =
      '<div class="msg-modal-mask" id="msg-mask">' +
        '<div class="msg-modal">' +
          '<h3>' + esc(d.title || '(无标题)') + '</h3>' +
          '<div class="row">来自：' + esc(d.senderName || d.senderType || '系统') + '　|　优先级：' + esc(d.priority || '') + '　|　分类：' + esc(d.categoryName || '') + '</div>' +
          '<div class="row">发送时间：' + esc(d.sendTime || '') + '</div>' +
          '<div class="body">' + content + '</div>' +
          (payload ? '<div class="row" style="margin-top:10px;">附加信息：' + payload + '</div>' : '') +
          '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">' +
            '<button class="btn btn-gray" id="msg-detail-close">关闭</button>' +
            '<button class="btn btn-primary" id="msg-detail-read">' + (d.isRead ? '标为未读' : '标记已读') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.querySelector('#msg-mask').addEventListener('click', function (e) { if (e.target.id === 'msg-mask') root.innerHTML = ''; });
    root.querySelector('#msg-detail-close').addEventListener('click', function () { root.innerHTML = ''; });
    root.querySelector('#msg-detail-read').addEventListener('click', function () { markRead(container, mid, !d.isRead).then(function () { root.innerHTML = ''; }); });
    if (!d.isRead) markRead(container, mid, true);
  }

  async function openSentDetail(container, mid) {
    let d;
    try { d = await mreq.get('/api/v1/messages/' + mid + '/delivery-status'); }
    catch (e) { d = null; }
    const root = container.querySelector('#msg-modal-root');
    const content = d && d.content ? esc(d.content) : '(无正文/无详情权限)';
    const rc = d && d.recipientCount != null ? d.recipientCount : '—';
    const rd = d && d.readCount != null ? d.readCount : '—';
    root.innerHTML =
      '<div class="msg-modal-mask" id="msg-mask">' +
        '<div class="msg-modal">' +
          '<h3>' + esc((d && d.title) || '(无标题)') + '</h3>' +
          '<div class="row">接收人数：' + rc + '　|　已读：' + rd + '</div>' +
          '<div class="body">' + content + '</div>' +
          '<div style="display:flex;justify-content:flex-end;margin-top:16px;">' +
            '<button class="btn btn-gray" id="msg-detail-close">关闭</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.querySelector('#msg-mask').addEventListener('click', function (e) { if (e.target.id === 'msg-mask') root.innerHTML = ''; });
    root.querySelector('#msg-detail-close').addEventListener('click', function () { root.innerHTML = ''; });
  }

  async function recallMessage(container, mid) {
    if (!confirm('确定收回该消息？仅对「接收方均未读」的消息可收回。')) return;
    try {
      await mreq.post('/api/v1/messages/' + mid + '/withdraw');
      toast('已收回', true);
      loadMessages(container);
    } catch (e) { /* 拦截器已提示 */ }
  }

  async function markRead(container, mid, read) {
    const path = read ? '/read' : '/unread';
    try { await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/' + mid + path); }
    catch (e) { return Promise.reject(e); }
    loadMessages(container); refreshBadge();
    return Promise.resolve();
  }

  async function toggleStar(container, mid) {
    const item = container.querySelector('.msg-item[data-mid="' + mid + '"]');
    const starred = item && item.querySelector('.msg-star') && !item.querySelector('.msg-star').classList.contains('off');
    const path = starred ? '/unstar' : '/star';
    try { await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/' + mid + path); }
    catch (e) { return; }
    loadMessages(container);
  }

  async function removeMsg(container, mid) {
    if (!confirm('确定删除该消息？将移入回收站。')) return;
    try { await mreq.delete('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/' + mid); }
    catch (e) { return; }
    loadMessages(container); refreshBadge();
  }

  async function restoreMsg(container, mid) {
    try { await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/' + mid + '/restore'); }
    catch (e) { return; }
    loadMessages(container);
  }

  async function markAllRead(container) {
    try {
      const ids = await mreq.get('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/ids', { params: { isDeleted: 0 } });
      if (ids && ids.length) {
        await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/read/batch', { messageIds: ids });
      }
    } catch (e) { return; }
    loadMessages(container); refreshBadge();
  }

  async function batchRead(container) {
    const ids = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    if (!ids.length) { alert('请先勾选消息'); return; }
    try { await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/read/batch', { messageIds: ids }); }
    catch (e) { return; }
    loadMessages(container); refreshBadge();
  }

  async function batchDelete(container) {
    const ids = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
    if (!ids.length) { alert('请先勾选消息'); return; }
    if (!confirm('确定删除选中的 ' + ids.length + ' 条消息？将移入回收站。')) return;
    try { await mreq.post('/api/v1/users/' + encodeURIComponent(state.userId) + '/messages/batch', { messageIds: ids }); }
    catch (e) { return; }
    state.selected = {}; loadMessages(container); refreshBadge();
  }

  // ---- SSE 实时推送 ----
  function connectSse() {
    disconnectSse();
    const uid = state.userId; const token = localStorage.getItem('token');
    if (!uid || !token || typeof EventSource === 'undefined') return;
    const url = MSG_BASE + '/api/v1/sse/connect?access_token=' + encodeURIComponent(token);
    try {
      es = new EventSource(url);
      es.addEventListener('ready', function () { flushOfflineQueue(); }); // 连接就绪即尝试重发离线消息
      es.addEventListener('message', function (e) {
        try {
          const p = JSON.parse(e.data);
          if (p && p.type === 'new_message') {
            refreshBadge();
            const cont = document.getElementById('dynamic-content-center');
            if (state.folder === 'inbox' && cont) loadMessages(cont);
            else if (cont) refreshBadge();
          } else if (p && p.type === 'message_recalled') {
            if (state.folder === 'sent') loadMessages(document.getElementById('dynamic-content-center') || document);
          }
        } catch (err) { /* 忽略心跳/异常帧 */ }
      });
      es.onerror = function () { /* EventSource 会自动重连 */ };
    } catch (e) { /* 不支持或创建失败，静默降级为手动刷新 */ }
  }

  function disconnectSse() {
    if (es) { try { es.close(); } catch (e) {} es = null; }
  }
  window.disconnectMessageSse = disconnectSse;

  // ---- 离线暂存队列（最多 10 条，FIFO：保留最初 10 条）----
  function queueOffline(body) {
    let q = [];
    try { q = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (e) { q = []; }
    q.push(body);
    if (q.length > 10) q = q.slice(0, 10);
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); } catch (e) {}
  }
  function flushOfflineQueue() {
    let q = [];
    try { q = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (e) { return; }
    if (!q.length) return;
    const sent = [];
    const remaining = [];
    let pending = q.length;
    q.forEach(function (body) {
      mreq.post('/api/v1/messages/send', body).then(function () {
        sent.push(body);
      }).catch(function () {
        remaining.push(body); // 仍不可达，保留
      }).finally(function () {
        pending--;
        if (pending === 0) {
          try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining)); } catch (e) {}
          if (sent.length) {
            toast('已自动重发 ' + sent.length + ' 条离线消息', true);
            if (state.folder === 'sent') { const c = document.getElementById('dynamic-content-center'); if (c) loadMessages(c); }
          }
        }
      });
    });
  }

  // ---- 提示 ----
  function toast(msg, ok) {
    let t = document.getElementById('msg-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'msg-toast';
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:3000;padding:10px 18px;border-radius:8px;color:#fff;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.2);';
      document.body.appendChild(t);
    }
    t.style.background = ok ? '#52c41a' : '#ff4d4f';
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.display = 'none'; }, 2600);
  }

  // ---- 角色对应的接收范围（scope → 自动解析接收人）----
  function composeScopes() {
    const role = currentUserRole();
    if (role === 'student') return [
      { scope: 'tenant_admin', label: '本租户管理员' },
      { scope: 'my_teachers', label: '我的任课教师' }
    ];
    if (role === 'teacher') return [
      { scope: 'tenant_admin', label: '本租户管理员' },
      { scope: 'my_students', label: '我的学生' }
    ];
    if (role === 'admin') return [
      { scope: 'platform_admin', label: '平台管理员' },
      { scope: 'teachers', label: '本租户教师' },
      { scope: 'students', label: '本租户学生' }
    ];
    if (role === 'platform_admin') return [
      { scope: 'platform_admin', label: '平台管理员' },
      { scope: 'tenant_admin', label: '租户管理员', needsTenant: true },
      { scope: 'teachers', label: '教师', needsTenant: true },
      { scope: 'students', label: '学生', needsTenant: true }
    ];
    return [];
  }

  function buildComposeHtml(preset) {
    preset = preset || {};
    const scopes = composeScopes();
    const defaultMode = preset.userIds && preset.userIds.length ? 'specific' : 'scope';
    const scopeOptions = scopes.map(function (s, i) {
      return '<option value="' + s.scope + '"' + (s.needsTenant ? ' data-tenant="1"' : '') + (i === 0 ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
    const presetIds = (preset.userIds || []).join(',');
    const presetName = preset.name ? ('（致：' + esc(preset.name) + '）') : '';
    return '' +
      '<div class="msg-modal-mask" id="msg-compose-mask">' +
        '<div class="msg-modal" style="width:620px;">' +
          '<h3>发送通知' + presetName + '</h3>' +
          '<div class="row">接收方式：' +
            '<label style="margin-right:14px;"><input type="radio" name="msg-mode" value="scope"' + (defaultMode === 'scope' ? ' checked' : '') + '> 按范围（系统自动解析接收人）</label>' +
            '<label><input type="radio" name="msg-mode" value="specific"' + (defaultMode === 'specific' ? ' checked' : '') + '> 指定用户ID</label>' +
          '</div>' +
          '<div class="row" id="msg-scope-row">' +
            '接收范围：<select id="msg-scope" style="padding:6px;">' + scopeOptions + '</select>' +
            '<span id="msg-tenant-wrap" style="display:none;margin-left:10px;">租户ID：<input id="msg-tenant-id" placeholder="平台管理员需填" style="padding:6px;width:120px;"></span>' +
            ' <button class="btn btn-gray btn-sm" id="msg-load-rcpt"><i class="fa fa-refresh"></i> 加载接收人</button>' +
          '</div>' +
          '<div class="row" id="msg-ids-row" style="display:none;">指定用户ID（多个用逗号/空格分隔）：<br><textarea id="msg-ids" rows="2" style="width:100%;margin-top:6px;">' + esc(presetIds) + '</textarea></div>' +
          '<div class="msg-rcpt-list" id="msg-rcpt-list" style="display:none;"></div>' +
          '<div class="row">标题：<input id="msg-title" maxlength="120" style="width:100%;margin-top:6px;padding:6px;" placeholder="通知标题"></div>' +
          '<div class="row">正文：<textarea id="msg-content" rows="5" style="width:100%;margin-top:6px;"></textarea></div>' +
          '<div class="row">优先级：' +
            '<select id="msg-priority"><option value="HIGH">高</option><option value="MEDIUM" selected>中</option><option value="LOW">低</option></select>' +
            '　分类编码：<input id="msg-category" placeholder="如 BOOKING_CREATED" style="padding:6px;">' +
          '</div>' +
          '<div class="row" style="color:#999;">提示：勾选接收人即「向所选的一个/多个发送」；全选即「向该范围所有人发送」。系统不要求你指定具体管理员。</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">' +
            '<button class="btn btn-gray" id="msg-compose-cancel">取消</button>' +
            '<button class="btn btn-primary" id="msg-compose-send">发送</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // 打开发送弹窗（preset: {userIds:[], role, name} 用于列表页「发消息」链接）
  window.openComposeMessage = function (preset) {
    if (!canSend()) { toast('当前角色无权发送通知', false); return; }
    let root = document.getElementById('msg-compose-root');
    if (!root) { root = document.createElement('div'); root.id = 'msg-compose-root'; document.body.appendChild(root); }
    root.innerHTML = buildComposeHtml(preset);
    const mask = root.querySelector('#msg-compose-mask');
    mask.addEventListener('click', function (e) { if (e.target.id === 'msg-compose-mask') root.innerHTML = ''; });
    root.querySelector('#msg-compose-cancel').addEventListener('click', function () { root.innerHTML = ''; });

    const modeRadios = root.querySelectorAll('input[name="msg-mode"]');
    const scopeRow = root.querySelector('#msg-scope-row');
    const idsRow = root.querySelector('#msg-ids-row');
    const rcptList = root.querySelector('#msg-rcpt-list');
    const scopeSel = root.querySelector('#msg-scope');
    const tenantWrap = root.querySelector('#msg-tenant-wrap');

    function syncMode() {
      const mode = root.querySelector('input[name="msg-mode"]:checked').value;
      if (mode === 'scope') {
        scopeRow.style.display = ''; idsRow.style.display = 'none';
      } else {
        scopeRow.style.display = 'none'; rcptList.style.display = 'none'; rcptList.innerHTML = ''; idsRow.style.display = '';
      }
    }
    modeRadios.forEach(function (r) { r.addEventListener('change', syncMode); });

    function syncTenant() {
      const opt = scopeSel.options[scopeSel.selectedIndex];
      const need = opt && opt.getAttribute('data-tenant') === '1';
      tenantWrap.style.display = need ? '' : 'none';
    }
    scopeSel.addEventListener('change', syncTenant);

    root.querySelector('#msg-load-rcpt').addEventListener('click', function () { loadRecipients(root); });

    root.querySelector('#msg-compose-send').addEventListener('click', function () { doSend(root); });

    // 初始化：若预设了用户，直接进入指定模式；否则默认范围模式并加载一次接收人
    syncMode();
    syncTenant();
    if (!(preset && preset.userIds && preset.userIds.length)) {
      // 默认加载第一范围的接收人，方便直接勾选
      loadRecipients(root);
    }
  };

  // 列表页「发消息」链接入口
  window.openComposeToUser = function (userId, role, name) {
    if (!userId) { toast('缺少用户ID', false); return; }
    window.openComposeMessage({ userIds: [String(userId)], role: role, name: name });
  };

  async function loadRecipients(root) {
    const scopeSel = root.querySelector('#msg-scope');
    const scope = scopeSel.value;
    const opt = scopeSel.options[scopeSel.selectedIndex];
    const needsTenant = opt && opt.getAttribute('data-tenant') === '1';
    const listEl = root.querySelector('#msg-rcpt-list');
    listEl.style.display = '';
    listEl.innerHTML = '加载中…';
    try {
      const params = { scope: scope };
      if (needsTenant) {
        const tid = (root.querySelector('#msg-tenant-id').value || '').trim();
        if (!tid) { listEl.innerHTML = '<div style="color:#c00;padding:6px;">请先填写租户ID</div>'; return; }
        params.tenantId = tid;
      }
      const users = await areq.get('/user/message-recipients', { params: params });
      if (!users || !users.length) { listEl.innerHTML = '<div style="color:#999;padding:6px;">该范围暂无接收人</div>'; return; }
      listEl.innerHTML = users.map(function (u) {
        const name = u.name || u.userId || '未命名';
        const role = u.role || '';
        const uid = u.userId || '';
        return '<label style="display:block;padding:4px 2px;">' +
          '<input type="checkbox" class="msg-rcpt-item" value="' + esc(uid) + '" checked> ' +
          esc(name) + ' <span style="color:#999;">(' + esc(role) + ' · ' + esc(uid) + ')</span></label>';
      }).join('');
    } catch (e) {
      listEl.innerHTML = '<div style="color:#c00;padding:6px;">接收人解析失败，请重试</div>';
    }
  }

  function parseIds(str) {
    return (str || '').split(/[\s,，;；]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  async function doSend(root) {
    const title = root.querySelector('#msg-title').value.trim();
    const content = root.querySelector('#msg-content').value;
    const priority = root.querySelector('#msg-priority').value;
    const categoryCode = root.querySelector('#msg-category').value.trim();
    if (!title) { toast('请填写标题', false); return; }
    const mode = root.querySelector('input[name="msg-mode"]:checked').value;
    let ids = [];
    if (mode === 'specific') {
      ids = parseIds(root.querySelector('#msg-ids').value);
    } else {
      const boxes = root.querySelectorAll('#msg-rcpt-list input.msg-rcpt-item:checked');
      boxes.forEach(function (b) { if (b.value) ids.push(b.value); });
      if (!boxes.length) { toast('请先点击「加载接收人」', false); return; }
    }
    if (!ids.length) { toast('请至少选择一个接收人', false); return; }
    const body = { title: title, content: content || '', priority: priority, recipientUserIds: ids, broadcast: false };
    if (categoryCode) body.categoryCode = categoryCode;
    try {
      await mreq.post('/api/v1/messages/send', body);
      root.innerHTML = '';
      toast('发送成功', true);
      flushOfflineQueue();
    } catch (e) {
      if (isUnreachable(e)) {
        queueOffline(body);
        root.innerHTML = '';
        toast('消息服务不可达，已暂存本地（最多10条），恢复后自动重发', false);
      }
      // 非不可达的业务错误，拦截器已提示
    }
  }
})();
