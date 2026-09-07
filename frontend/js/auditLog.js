/**
 * 审计日志浏览脚本
 * 依赖: utility_request.js (window.request), auth.js
 */
var PAGE_SIZE = 20;

// 初始化操作类型下拉框
async function initActions() {
    try {
        var res = await request({ url: '/api/audit-logs/actions', method: 'get' });
        var actions = (res && res.data) || res || [];
        if (!Array.isArray(actions)) actions = [];
        var select = document.getElementById('f-action');
        actions.forEach(function(a) {
            var opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
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
    if (start) params.startDate = start;
    if (end) params.endDate = end;
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
                    '<td>' + escHtml(r.action || '') + '</td>' +
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
            '<div style="margin-bottom:8px;"><strong>操作类型：</strong>' + escHtml(d.action || '-') + '</div>' +
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

// 工具函数
function formatTime(t) {
    if (!t) return '-';
    return String(t).replace('T', ' ').substring(0, 19);
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 初始化
initActions();
loadAuditLogs(1);
