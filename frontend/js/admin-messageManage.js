/* ============================================================================
 * admin-messageManage.js —— 管理员「消息中心 → 消息管理」（moderation 工具）
 * 接口：GET /api/v1/messages（发送历史，管理员域）+ DELETE /api/v1/messages/{id}（全局彻底删除）
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
 * ========================================================================== */

/* 菜单 key，必须与 admin.html / platform_admin.html 中 menu-item 的 key 一致 */
var MSG_MANAGE_MENU_KEY = 'msg_manage';

/* 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths） */
var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

var STATUS_TEXT = {
    sent: '已发送',
    recalled: '已收回',
    partial_recalled: '部分收回'
};
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

/** 菜单入口：loadAdminPageContent('msg_manage') 调用 */
async function renderMessageManagePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;

    container.innerHTML =
        '<div class="card">' +
        '  <div class="card-header">' +
        '    <div class="card-title"><i class="fa fa-envelope-open-text"></i> 消息管理（发送历史）</div>' +
        '  </div>' +
        '  <div class="card-body">' +
        '    <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
        '      <b>用途：</b>查看本租户全部已发消息，对「误发 / 违规」消息执行<strong>彻底删除</strong>。<br>' +
        '      <b>彻底删除 = </b>永久删除主消息、所有收件人的收件箱副本与投递记录（含已读副本），<strong>不可逆</strong>；' +
        '      在线接收方会即时收到移除通知。<br>' +
        '      <b>与「收回」区别：</b>收回仅撤未读副本；彻底删除覆盖已读副本，且需管理员权限。' +
        '    </div>' +
        '    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">' +
        '      <label style="font-size:13px;color:#5a6472;">状态：' +
        '        <select id="mm-status" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <option value="">全部</option>' +
        '          <option value="sent">已发送</option>' +
        '          <option value="partial_recalled">部分收回</option>' +
        '          <option value="recalled">已收回</option>' +
        '        </select></label>' +
        '      <label style="font-size:13px;color:#5a6472;">发送者类型：' +
        '        <select id="mm-sender" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <option value="">全部</option>' +
        '          <option value="teacher">教师</option>' +
        '          <option value="admin">管理员</option>' +
        '          <option value="platform_admin">平台管理员</option>' +
        '          <option value="system">系统</option>' +
        '        </select></label>' +
        '    </div>' +
        '    <div id="mm-table-body">正在加载…</div>' +
        '  </div>' +
        '</div>';

    if (typeof applyTerms === 'function') applyTerms(container);

    await loadMsgManageTable();
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
        var statusTxt = STATUS_TEXT[m.status] || m.status || '';
        return '<tr>' +
            '<td>' + escMsgManage(title) + '</td>' +
            '<td>' + escMsgManage(sender) + '</td>' +
            '<td>' + escMsgManage(time) + '</td>' +
            '<td>' + escMsgManage(statusTxt) + '</td>' +
            '<td>' +
            '<button class="btn btn-danger btn-sm" data-act="global-delete" data-mid="' + escMsgManage(mid) + '">' +
            '<i class="fa fa-trash"></i> 彻底删除</button>' +
            '</td>' +
            '</tr>';
    }).join('');

    host.innerHTML =
        '<div class="table-container"><table class="data-table"><thead><tr>' +
        '<th>标题</th><th>发送者</th><th>发送时间</th><th>状态</th><th>操作</th>' +
        '</tr></thead><tbody>' + trs + '</tbody></table></div>';

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

/** 页内刷新：顶部「刷新」按钮经 registerPageRefresh 调到这里 */
async function refreshMsgManagePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container || !document.getElementById('mm-table-body')) return false; // 已切走菜单
    await loadMsgManageTable();
    return true;
}

/* ---------------------------------------------------- 顶部刷新注册（铁律#1） */
if (typeof window.registerPageRefresh === 'function') {
    window.registerPageRefresh(MSG_MANAGE_MENU_KEY, refreshMsgManagePage);
}
