/* ============================================================================
 * admin-messageManage.js —— 管理员「消息中心 → 消息管理」（moderation 工具）
 * 接口：GET /api/v1/messages（发送历史，管理员域）
 *      + GET /api/v1/messages/{id}/delivery-status（投递统计：「查看」弹窗主体）
 *      + GET /api/v1/messages/{id}/recipients（接收人明细：「查看」弹窗底部列表，本页复用
 *        messages-inbox.js 导出的 window.mountMessageRecipients 渲染）
 *      + DELETE /api/v1/messages/{id}（全局彻底删除）
 *
 * 业务语义
 *   本页是「发送历史 / 投递台账」的管理视图：列出本租户（平台管理员跨租户）全部已发消息，
 *   供管理员对「误发 / 违规」消息执行【彻底删除】——连带删除主消息、所有收件人收件箱副本
 *   与投递记录，并实时通知在线接收方移除（SSE message_deleted）。该操作不可逆，区别于
 *   收件人视角的「删除 / 彻底删除」（仅删自己的 msg_inbox 副本）。
 *
 *   ⚠️ 架构红线：绝不能让发送者自助删主消息。主消息是写扩散的唯一真相源，且 msg_inbox
 *   的标题/内容联表取自主消息；误删会让所有收件人副本变空白。故本页仅限管理员，且只走
 *   级联删除（主消息 + 所有 inbox/delivery），绝不单删主消息。
 *
 *   ⚠️ 必须整体包在 IIFE 里：本文件原本在顶层 `var EP`，而本页面先加载的
 *   termsFunction.js 在顶层`const EP`。`var` 无法重声明全局词法绑定 →
 *   整个脚本抛 SyntaxError 解析失败 → 菜单点进来只会看到
 *   「消息管理模块未加载（admin-messageManage.js）」，且控制台报错位置在
 *   本文件第 1 行，极具误导性（文件在、语法检查过、404 也没有）。
 *   同理 admin-messageCategory.js。凡在多文件页面里声明顶层标识符，
 *   一律用 IIFE 隔离，只把对外入口显式挂window。
 * ========================================================================== */
(function () {
    'use strict';

    /* 菜单 key，必须与 admin.html / platform_admin.html 中 menu-item 的 key 一致 */
    var MSG_MANAGE_MENU_KEY = 'msg_manage';

    /* 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths） */
    var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

    /* 状态文案取共享事实源（shared/domain/message.js，经桥接挂 window.MessageDomain）。
       本地表仅作桥接缺失时的兜底；withdrawn 是 recalled 的历史同义值（建表注释里的旧词汇表），
       三项都必须在，否则历史数据会漏出裸英文。 */
    var MD = window.MessageDomain || {};
    var STATUS_FALLBACK = { sent: '已发送', recalled: '已收回', partial_recalled: '部分收回', withdrawn: '已收回' };
    function statusText(code) {
    if (!code) return '';
    return (MD.messageStatusText ? MD.messageStatusText(code) : (STATUS_FALLBACK[code] || code));
    }
    var SENDER_TEXT = {
    teacher: '教师',
    admin: '管理员',
    platform_admin: '平台管理员',
    system: '系统'
    };

    function escMsgManage(text) {
    if (text == null) return '';
    return String(text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function notifyMsgManage(msg) {
    if (typeof window.showApiError === 'function') window.showApiError(msg);
    else if (typeof window.alert === 'function') window.alert(msg);
    }

    /* -------------------------------------------------------------- 数据访问层 */

    async function loadMsgManageRows(filters) {
    var qs = [];
    if (filters.status) qs.push('status=' + encodeURIComponent(filters.status));
    if (filters.senderType) qs.push('senderType=' + encodeURIComponent(filters.senderType));
    var url = EP.MSG_LIST + (qs.length ? '?' + qs.join('&') : '');
    var page = await request({ url: url, method: 'get' });
    return (page && page.rows) ? page.rows : [];
    }

    /* -------------------------------------------------------------- 页面渲染 */

    /**
     * 页内两个台账（tab 切换），**数据源与语义都不同**：
     *   · sent（发送台账）：本页原有视图 —— 本租户**发出**的全部消息，走 message-service
     *     GET /api/v1/messages（按 msg_message.tenant_id = 本租户 过滤，该列语义是「发送方租户」），
     *     面向「误发 / 违规」消息的彻底删除；
     *   · inbound（接收台账）：**接收方视角** —— 平台方发出的消息进了本租户哪些用户、谁读谁没读，
     *     走主系统 GET /api/v1/msg-ledger/inbound。平台方消息的发送方租户 = 0，
     *     因此**永远不出现在发送台账里**，只能从接收台账看到。
     */
    var mmState = {
    tab: 'sent',
    ledgerPageNum: 1, ledgerPageSize: 10, ledgerTotal: 0,
    ledgerRead: '', ledgerRows: []
    };

    /** 样式注入：本页复用 .msg-tabs / .msg-modal / .rec-* 等消息中心样式，但未必经过 initMessageBadge */
    function ensureStyleSafe() {
    if (typeof window.ensureMessageCenterStyle === 'function') window.ensureMessageCenterStyle();
    }

    function fmtShort(t) {
    if (!t) return '';
    return window.DatetimeDomain
            ? window.DatetimeDomain.formatDateTime(t, false)
            : String(t).replace('T', ' ').substring(0, 16);
    }

    var DESC_SENT =
            '<div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
            '  <b>用途：</b>查看本租户全部已发消息，对「误发 / 违规」消息执行<strong>彻底删除</strong>。<br>' +
            '  <b>彻底删除 = </b>永久删除主消息、所有收件人的收件箱副本与投递记录（含已读副本），<strong>不可逆</strong>；' +
            '  在线接收方会即时收到移除通知。<br>' +
            '  <b>与「收回」区别：</b>收回仅撤未读副本；彻底删除覆盖已读副本，且需管理员权限。' +
            '</div>';

    var DESC_INBOUND =
            '<div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
            '  <b>用途：</b>查看<strong>平台方发出的消息</strong>进了本租户哪些用户、谁读谁没读（接收方视角）。<br>' +
            '  <b>为什么发送台账里看不到这些消息：</b>平台方消息的发送方租户是平台自身，不属本租户，故不在「本租户已发」范围内。<br>' +
            '  <b>本页只读：</b>不提供撤回/删除（那是发送方的动作）；租户边界由后端强制，本租户管理员只能看到本租户用户。' +
            '</div>';

    /** 菜单入口：loadAdminPageContent('msg_manage') 调用 */
    async function renderMessageManagePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;
    ensureStyleSafe();

    container.innerHTML =
            '<div class="card">' +
            '  <div class="card-header">' +
            '    <div class="card-title"><i class="fa fa-envelope-open-text"></i> 消息管理</div>' +
            '    <div class="msg-tabs" id="mm-tabs" style="margin-left:12px;">' +
            '      <button class="msg-tab" data-tab="sent">发送台账</button>' +
            '      <button class="msg-tab" data-tab="inbound">接收台账</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="card-body">' +
            '    <div id="mm-desc"></div>' +
            '    <div id="mm-panel"></div>' +
            '  </div>' +
            '</div>';

    if (typeof applyTerms === 'function') applyTerms(container);

    var tabs = container.querySelector('#mm-tabs');
    if (tabs) {
            tabs.querySelectorAll('.msg-tab').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var t = btn.getAttribute('data-tab');
                    if (t === mmState.tab) return;
                    mmState.tab = t;
                    renderActiveTab();
                });
            });
    }
    await renderActiveTab();
    }

    /** 切换 tab：更新高亮、说明文案与面板内容 */
    async function renderActiveTab() {
    var tabs = document.getElementById('mm-tabs');
    if (tabs) {
            tabs.querySelectorAll('.msg-tab').forEach(function (b) {
                b.classList.toggle('active', b.getAttribute('data-tab') === mmState.tab);
            });
    }
    var desc = document.getElementById('mm-desc');
    if (desc) desc.innerHTML = (mmState.tab === 'sent') ? DESC_SENT : DESC_INBOUND;
    var panel = document.getElementById('mm-panel');
    if (!panel) return;

    if (mmState.tab === 'sent') {
            panel.innerHTML =
                '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
                '  <label style="font-size:13px;color:#5a6472;">状态：' +
                '    <select id="mm-status" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
                '      <option value="">全部</option>' +
                '      <option value="sent">已发送</option>' +
                '      <option value="partial_recalled">部分收回</option>' +
                '      <option value="recalled">已收回</option>' +
                '    </select></label>' +
                '  <label style="font-size:13px;color:#5a6472;">发送者类型：' +
                '    <select id="mm-sender" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
                '      <option value="">全部</option>' +
                '      <option value="teacher">教师</option>' +
                '      <option value="admin">管理员</option>' +
                '      <option value="platform_admin">平台管理员</option>' +
                '      <option value="system">系统</option>' +
                '    </select></label>' +
                '</div>' +
                '<div id="mm-table-body">正在加载…</div>';
            var st = document.getElementById('mm-status');
            var sd = document.getElementById('mm-sender');
            if (st) st.addEventListener('change', loadMsgManageTable);
            if (sd) sd.addEventListener('change', loadMsgManageTable);
            await loadMsgManageTable();
    } else {
            panel.innerHTML =
                '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
                '  <label style="font-size:13px;color:#5a6472;">读状态：' +
                '    <select id="ml-read" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
                '      <option value="">全部</option>' +
                '      <option value="unread">只看还有未读</option>' +
                '      <option value="read">已全部读完</option>' +
                '    </select></label>' +
                '  <button class="btn btn-sm" id="ml-refresh"><i class="fa fa-refresh"></i> 刷新</button>' +
                '</div>' +
                '<div id="ml-table-body">正在加载…</div>' +
                '<div class="msg-pager" id="ml-pager"></div>';
            var rd = document.getElementById('ml-read');
            if (rd) {
                rd.value = mmState.ledgerRead;
                rd.addEventListener('change', function () {
                    mmState.ledgerRead = rd.value;
                    mmState.ledgerPageNum = 1;
                    loadLedgerTable();
                });
            }
            var rf = document.getElementById('ml-refresh');
            if (rf) rf.addEventListener('click', function () { loadLedgerTable(); });
            await loadLedgerTable();
    }
    }

    async function loadMsgManageTable() {
    var host = document.getElementById('mm-table-body');
    if (!host) return;
    var statusEl = document.getElementById('mm-status');
    var senderEl = document.getElementById('mm-sender');
    var filters = {
            status: statusEl ? statusEl.value : '',
            senderType: senderEl ? senderEl.value : ''
    };

    var rows;
    try {
            rows = await loadMsgManageRows(filters);
    } catch (e) {
            host.innerHTML = '<div style="padding:20px;text-align:center;color:#c00;">加载失败，请重试</div>';
            return;
    }

    if (!rows.length) {
            host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">暂无消息</div>';
            return;
    }

    var trs = rows.map(function (m) {
            var mid = m.messageId;
            var title = m.title || '(无标题)';
            var sender = (SENDER_TEXT[m.senderType] || m.senderType || '') +
                (m.senderId ? '（' + m.senderId + '）' : '');
            var time = m.sendTime ? (window.DatetimeDomain ? window.DatetimeDomain.formatDateTime(m.sendTime, false) : String(m.sendTime).replace('T', ' ').substring(0, 16)) : '';
            var statusTxt = statusText(m.status);
            return '<tr>' +
                '<td>' + escMsgManage(title) + '</td>' +
                '<td>' + escMsgManage(sender) + '</td>' +
                '<td>' + escMsgManage(time) + '</td>' +
                '<td>' + escMsgManage(statusTxt) + '</td>' +
                '<td>' +
                '<button class="btn btn-sm" data-act="view" data-mid="' + escMsgManage(mid) + '" style="margin-right:6px;">' +
                '<i class="fa fa-eye"></i> 查看</button>' +
                '<button class="btn btn-danger btn-sm" data-act="global-delete" data-mid="' + escMsgManage(mid) + '">' +
                '<i class="fa fa-trash"></i> 彻底删除</button>' +
                '</td>' +
                '</tr>';
    }).join('');

    host.innerHTML =
            '<div class="table-container"><table class="data-table"><thead><tr>' +
            '<th>标题</th><th>发送者</th><th>发送时间</th><th>状态</th><th>操作</th>' +
            '</tr></thead><tbody>' + trs + '</tbody></table></div>';

    // 事件委托：查看（投递追踪弹窗：标题/发送者/状态/接收已读统计/正文）
    // 接口 GET /api/v1/messages/{mid}/delivery-status（messageTrace），后端 assertManagerOrSender 把关
    host.querySelectorAll('[data-act="view"]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var mid = btn.getAttribute('data-mid');
                var d = null;
                try {
                    d = await request({ url: EP.MSG_DELIVERY(mid), method: 'get' });
                } catch (e) { return; /* 拦截器已提示（消息被删/无权限等） */ }

                var container = document.getElementById('dynamic-content-center');
                if (!container) return;
                var root = container.querySelector('#mm-modal-root');
                if (!root) {
                    root = document.createElement('div');
                    root.id = 'mm-modal-root';
                    container.appendChild(root);
                }
                var senderTxt = (d && d.senderType)
                    ? (SENDER_TEXT[d.senderType] || d.senderType) + (d.senderId ? '（' + d.senderId + '）' : '')
                    : '—';
                var statusTxt = (d && d.status) ? statusText(d.status) : '—';
                var rc = d && d.recipientCount != null ? d.recipientCount : '—';
                var rd = d && d.readCount != null ? d.readCount : '—';
                var content = d && d.content ? escMsgManage(d.content) : '(无正文)';
                root.innerHTML =
                    '<div class="msg-modal-mask" id="mm-mask">' +
                      '<div class="msg-modal">' +
                        '<h3>' + escMsgManage((d && d.title) || '(无标题)') + '</h3>' +
                        '<div class="row">发送者：' + escMsgManage(senderTxt) +
                        '　|　状态：' + escMsgManage(statusTxt) + '</div>' +
                        '<div class="row">接收人数：' + escMsgManage(rc) +
                        '　|　已读：' + escMsgManage(rd) + '</div>' +
                        '<div class="body">' + content + '</div>' +
                        /* 接收人明细挂载点：与「已发」详情同源（复用 messages-inbox.js 的实现，
                           未读优先 + 姓名/账号 + 加载更多），见 window.mountMessageRecipients */
                        '<div class="rec-box" id="msg-recipients"></div>' +
                        '<div style="display:flex;justify-content:flex-end;margin-top:16px;">' +
                          '<button class="btn btn-gray" id="mm-detail-close">关闭</button>' +
                        '</div>' +
                      '</div>' +
                    '</div>';
                root.querySelector('#mm-mask').addEventListener('click', function (e) { if (e.target.id === 'mm-mask') root.innerHTML = ''; });
                root.querySelector('#mm-detail-close').addEventListener('click', function () { root.innerHTML = ''; });
                // 接收人明细（GET /api/v1/messages/{mid}/recipients，权限同 delivery-status）。
                // 不 await：明细后到不阻塞正文与统计；弹层已关时挂载点消失，模块内部自行丢弃过期结果。
                if (typeof window.mountMessageRecipients === 'function') {
                    window.mountMessageRecipients(root, mid);
                }
            });
    });

    // 事件委托：彻底删除
    host.querySelectorAll('[data-act="global-delete"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var mid = btn.getAttribute('data-mid');
                if (typeof window.confirm === 'function' &&
                    !window.confirm('彻底删除该消息（ID ' + mid + '）？\n将永久删除主消息、所有收件人副本及投递记录，且无法恢复！')) {
                    return;
                }
                request({ url: EP.MSG_DELETE_GLOBAL(mid), method: 'delete' })
                    .then(function () { notifyMsgManage('已彻底删除'); loadMsgManageTable(); })
                    .catch(function () { /* 拦截器已提示 */ });
            });
    });
    }

    /* ------------------------------------------------------- 接收台账（平台方 → 本租户） */

    /**
     * 拉取接收台账一页。
     * 权限与租户作用域在**后端**强制：租户管理员恒为本租户（tenantId 入参对其无效），
     * 前端不再传 tenantId —— 传了也没用，反而给"改参数越权"留了想象空间。
     */
    async function loadLedgerRows() {
    var qs = ['pageNum=' + mmState.ledgerPageNum, 'pageSize=' + mmState.ledgerPageSize];
    if (mmState.ledgerRead) qs.push('readState=' + encodeURIComponent(mmState.ledgerRead));
    var page = await areq.get(EP.MSG_LEDGER_INBOUND + '?' + qs.join('&'));
    mmState.ledgerRows = (page && page.rows) ? page.rows : [];
    mmState.ledgerTotal = page ? (Number(page.total) || 0) : 0;
    return mmState.ledgerRows;
    }

    async function loadLedgerTable() {
    var host = document.getElementById('ml-table-body');
    if (!host) return;
    host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">正在加载…</div>';
    try {
            await loadLedgerRows();
    } catch (e) {
            host.innerHTML = '<div style="padding:20px;text-align:center;color:#c00;">加载失败，请重试</div>';
            renderLedgerPager();
            return;
    }
    if (!mmState.ledgerRows.length) {
            host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">暂无平台方发往本租户的消息</div>';
            renderLedgerPager();
            return;
    }

    var trs = mmState.ledgerRows.map(function (m) {
            var mid = m.messageId;
            var title = m.title || '(无标题)';
            var sender = (SENDER_TEXT[m.senderType] || m.senderType || '') +
                (m.senderId ? '（' + m.senderId + '）' : '');
            var rc = m.recipientCount != null ? m.recipientCount : 0;
            var rd = m.readCount != null ? m.readCount : 0;
            // 未读人数 = 接收人数 - 已读人数；台账最关心"还有谁没看"
            var unread = Math.max(0, Number(rc) - Number(rd));
            return '<tr>' +
                '<td>' + escMsgManage(title) + '</td>' +
                '<td>' + escMsgManage(sender) + '</td>' +
                '<td>' + escMsgManage(fmtShort(m.sendTime)) + '</td>' +
                '<td>' + escMsgManage(statusText(m.status)) + '</td>' +
                '<td>' + escMsgManage(String(rc)) + '</td>' +
                '<td>' + escMsgManage(rd + (unread > 0 ? '（未读 ' + unread + '）' : '（全部已读）')) + '</td>' +
                '<td><button class="btn btn-sm" data-act="ledger-view" data-mid="' + escMsgManage(mid) + '">' +
                '<i class="fa fa-eye"></i> 查看</button></td>' +
                '</tr>';
    }).join('');

    host.innerHTML =
            '<div class="table-container"><table class="data-table"><thead><tr>' +
            '<th>标题</th><th>发送者</th><th>发送时间</th><th>状态</th><th>本租户接收</th><th>已读</th><th>操作</th>' +
            '</tr></thead><tbody>' + trs + '</tbody></table></div>';

    host.querySelectorAll('[data-act="ledger-view"]').forEach(function (btn) {
            btn.addEventListener('click', function () { openLedgerDetail(btn.getAttribute('data-mid')); });
    });
    renderLedgerPager();
    }

    function renderLedgerPager() {
    var host = document.getElementById('ml-pager');
    if (!host) return;
    var totalPages = Math.max(1, Math.ceil(mmState.ledgerTotal / mmState.ledgerPageSize));
    host.innerHTML =
            '<button class="btn btn-sm" id="ml-prev"' + (mmState.ledgerPageNum <= 1 ? ' disabled' : '') + '>上一页</button>' +
            '<span>第 ' + mmState.ledgerPageNum + ' / ' + totalPages + ' 页（共 ' + mmState.ledgerTotal + ' 条）</span>' +
            '<button class="btn btn-sm" id="ml-next"' + (mmState.ledgerPageNum >= totalPages ? ' disabled' : '') + '>下一页</button>';
    var prev = host.querySelector('#ml-prev');
    var next = host.querySelector('#ml-next');
    if (prev) prev.addEventListener('click', function () {
            if (mmState.ledgerPageNum > 1) { mmState.ledgerPageNum--; loadLedgerTable(); }
    });
    if (next) next.addEventListener('click', function () {
            if (mmState.ledgerPageNum < totalPages) { mmState.ledgerPageNum++; loadLedgerTable(); }
    });
    }

    /**
     * 接收台账详情：正文 + 本租户接收人明细（未读优先，可切"只看未读"）。
     *
     * 明细走**主系统** /api/v1/msg-ledger/inbound/{mid}/recipients，而不是「已发详情」复用的
     * message-service /recipients —— 后者按消息返回**全部租户**的接收人，且对租户管理员会 403
     * （消息的发送方租户是平台，不等于本租户）。这里返回的行自带姓名/账号，无需再补 USER_BRIEFS。
     */
    var mlRec = { mid: null, pageNum: 0, total: 0, list: [], loading: false, readState: '' };

    function openLedgerDetail(mid) {
    var row = (mmState.ledgerRows || []).filter(function (m) { return String(m.messageId) === String(mid); })[0] || {};
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;
    ensureStyleSafe();
    var root = container.querySelector('#ml-modal-root');
    if (!root) {
            root = document.createElement('div');
            root.id = 'ml-modal-root';
            container.appendChild(root);
    }
    var sender = (SENDER_TEXT[row.senderType] || row.senderType || '—') +
            (row.senderId ? '（' + row.senderId + '）' : '');
    var rc = row.recipientCount != null ? row.recipientCount : 0;
    var rd = row.readCount != null ? row.readCount : 0;
    root.innerHTML =
            '<div class="msg-modal-mask" id="ml-mask">' +
            '  <div class="msg-modal">' +
            '    <h3>' + escMsgManage(row.title || '(无标题)') + '</h3>' +
            '    <div class="row">发送者：' + escMsgManage(sender) +
            '　|　状态：' + escMsgManage(statusText(row.status) || '—') +
            '　|　发送时间：' + escMsgManage(fmtShort(row.sendTime)) + '</div>' +
            '    <div class="row">本租户接收：' + escMsgManage(String(rc)) + '　|　已读：' + escMsgManage(String(rd)) + '</div>' +
            '    <div class="body">' + (row.content ? escMsgManage(row.content) : '(无正文)') + '</div>' +
            '    <div class="rec-box" id="ml-recipients"></div>' +
            '    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
            '      <button class="btn btn-gray btn-sm" id="ml-read-toggle">只看未读</button>' +
            '      <button class="btn btn-gray" id="ml-close">关闭</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    root.querySelector('#ml-mask').addEventListener('click', function (e) { if (e.target.id === 'ml-mask') root.innerHTML = ''; });
    root.querySelector('#ml-close').addEventListener('click', function () { root.innerHTML = ''; });
    root.querySelector('#ml-read-toggle').addEventListener('click', function () {
            mlRec.readState = mlRec.readState === 'unread' ? '' : 'unread';
            this.textContent = mlRec.readState === 'unread' ? '显示全部' : '只看未读';
            loadLedgerRecipients(root, mid, 1);
    });
    loadLedgerRecipients(root, mid, 1);
    }

    function renderLedgerRecipients(root) {
    var box = root.querySelector('#ml-recipients');
    if (!box) return;
    var html = '<div class="rec-head">本租户接收人（' + mlRec.total + '）' +
            '<span class="rec-tip">' + (mlRec.readState === 'unread' ? '只看未读' : '未读优先') + '</span></div>';
    if (!mlRec.list.length) {
            html += '<div class="rec-empty">' + (mlRec.loading ? '加载中…' : '暂无接收人记录') + '</div>';
    } else {
            html += '<div class="rec-list">';
            mlRec.list.forEach(function (r) {
                var st = MD.recipientStateText
                    ? MD.recipientStateText(r)
                    : { text: r.isRead ? '已读' : '未读', cls: r.isRead ? 'read' : 'unread' };
                var name = r.name || r.userId || '';
                var acct = r.account ? '（' + escMsgManage(r.account) + '）' : '';
                var t = (r.isRead && r.readTime) ? r.readTime : (r.deliveryTime || r.ackTime || '');
                html += '<div class="rec-row">' +
                    '<span class="rec-name">' + escMsgManage(name) + acct + '</span>' +
                    (st.text ? '<span class="rec-state rec-' + escMsgManage(st.cls) + '">' + escMsgManage(st.text) + '</span>' : '') +
                    '<span class="rec-time">' + escMsgManage(fmtShort(t)) + '</span>' +
                    '</div>';
            });
            html += '</div>';
            if (mlRec.list.length < mlRec.total) {
                html += '<div class="rec-more" id="ml-rec-more">' +
                    (mlRec.loading ? '加载中…' : '加载更多（已显示 ' + mlRec.list.length + '/' + mlRec.total + '）') + '</div>';
            }
    }
    box.innerHTML = html;
    var more = box.querySelector('#ml-rec-more');
    if (more) more.addEventListener('click', function () { loadLedgerRecipients(root, mlRec.mid, mlRec.pageNum + 1); });
    }

    async function loadLedgerRecipients(root, mid, pageNum) {
    if (!mid || mlRec.loading) return;
    if (pageNum <= 1) { mlRec.mid = mid; mlRec.pageNum = 0; mlRec.total = 0; mlRec.list = []; }
    var alive = function () { return mlRec.mid === mid && root.querySelector('#ml-recipients'); };
    mlRec.loading = true;
    renderLedgerRecipients(root);
    try {
            var qs = { pageNum: pageNum, pageSize: 20 };
            if (mlRec.readState) qs.readState = mlRec.readState;
            var box = await areq.get(EP.MSG_LEDGER_RECIPIENTS(mid, qs));
            var rows = (box && box.rows) ? box.rows : [];
            mlRec.total = box ? (Number(box.total) || 0) : 0;
            mlRec.list = (pageNum <= 1) ? rows : mlRec.list.concat(rows);
            mlRec.pageNum = pageNum;
    } catch (e) {
            mlRec.loading = false;
            if (!alive()) return;
            var host = root.querySelector('#ml-recipients');
            if (host) host.innerHTML = '<div class="rec-empty">接收人明细加载失败</div>';
            return;
    }
    mlRec.loading = false;
    if (!alive()) return;
    renderLedgerRecipients(root);
    }

    /** 页内刷新：顶部「刷新」按钮经 registerPageRefresh 调到这里（按当前 tab 决定刷哪张台账） */
    async function refreshMsgManagePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container || !document.getElementById('mm-panel')) return false; // 已切走菜单
    if (mmState.tab === 'inbound') {
            mmState.ledgerPageNum = 1;
            await loadLedgerTable();
    } else {
            await loadMsgManageTable();
    }
    return true;
    }

    /* ---------------------------------------------------- 顶部刷新注册（铁律#1） */
    if (typeof window.registerPageRefresh === 'function') {
        window.registerPageRefresh(MSG_MANAGE_MENU_KEY, refreshMsgManagePage);
    }

    /* ---------------------------------------------------- 对外入口（IIFE 隔离后必须显式挂出） */
    window.renderMessageManagePage = renderMessageManagePage;
})();
