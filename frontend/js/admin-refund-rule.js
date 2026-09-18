/* ============================================================================
 * admin-refund-rule.js —— 租户管理员「系统配置 → 退改规则」
 * 接口：/refund-rule/*   （见 RefundRuleController）
 *
 * 业务语义
 *   一个租户一份「默认规则」，每门课程可单独「覆盖」：
 *     课程专属规则 ＞ 租户默认规则 ＞ 系统内置默认（提前24小时免责 / 12小时退50%）
 *
 *   规则只有两个时间阈值，不退费区由「不足部分退费线」推导：
 *     提前 ≥ 免责线              → 免责（退 100%）
 *     部分退费线 ≤ 提前 < 免责线 → 部分退费（退 partialRefundPercent%）
 *     提前 < 部分退费线          → 不退费（退 0%）
 *   这样不会出现「不退费线高于部分退费线」这类自相矛盾的配置。
 *
 *   时间点录入支持「小时 / 分钟」两种粒度，落库统一换算为分钟。
 * ========================================================================== */

/* ------------------------------------------------------------------ 状态 */
// 页面刷新注册用的菜单 key，必须与 admin.html 中 menu-item 的 key 一致
var REFUND_RULE_MENU_KEY = 'refund_rule';

var refundRuleRows = [];          // /refund-rule/list 返回的规则列表
var refundRuleCourseOptions = []; // /refund-rule/course-options 课程下拉
var refundRuleEditing = null;     // 当前正在编辑的规则（复制体，取消不影响原数据）

/* ------------------------------------------------------------ 小工具函数 */

/** 分钟数转可读文案：390 → 6 小时 30 分钟；1440 → 24 小时；1500 → 1 天 1 小时 */
function formatRefundMinutes(minutes) {
    if (minutes === null || minutes === undefined || minutes === '') return '-';
    var m = Number(minutes);
    if (isNaN(m)) return '-';
    if (m <= 0) return '0 分钟';
    var days = Math.floor(m / 1440);
    var rest = m % 1440;
    var hours = Math.floor(rest / 60);
    var mins = rest % 60;
    var parts = [];
    if (days > 0) parts.push(days + ' 天');
    if (hours > 0) parts.push(hours + ' 小时');
    if (mins > 0) parts.push(mins + ' 分钟');
    return parts.length ? parts.join(' ') : '0 分钟';
}

/** 按粒度把界面上的数值换算成分钟 */
function refundRuleToMinutes(value, unit) {
    var v = Number(value);
    if (isNaN(v) || v < 0) return NaN;
    return unit === 'minute' ? Math.round(v) : Math.round(v * 60);
}

/**
 * 分钟数回显成「数值 + 粒度」。
 * 优先沿用库里存的粒度；若按该粒度不能整除（如 90 分钟按小时就是 1.5），
 * 则退化为分钟显示，避免界面上出现 1.5 小时这种别扭的中间值。
 */
function refundRuleFromMinutes(minutes, unit) {
    var m = Number(minutes);
    if (isNaN(m) || m < 0) return { value: '', unit: unit || 'hour' };
    if (unit === 'minute') return { value: m, unit: 'minute' };
    if (m % 60 === 0) return { value: m / 60, unit: 'hour' };
    return { value: m, unit: 'minute' };
}

function escapeRefundHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 轻提示。
 * 注意：request 封装内部的 showError 是 IIFE 私有函数，并没有挂到 window，
 * 这里不能直接调用它；项目统一的对外提示入口是 window.showApiError（由页面提供）。
 */
function notifyRefundRule(msg) {
    if (typeof window.showApiError === 'function') {
        window.showApiError(msg);
    } else {
        window.alert(msg);
    }
}

/** 三档区间说明（纯前端拼，用于表单实时预览） */
function refundRuleZoneText(freeMinutes, partialMinutes, percent) {
    if (isNaN(freeMinutes) || isNaN(partialMinutes)) return '请先填写两个时间点';
    if (freeMinutes < partialMinutes) return '⚠ 免责时间点必须 ≥ 部分退费时间点';
    return '提前 ≥ ' + formatRefundMinutes(freeMinutes) + ' 免责（退 100%）　｜　'
        + formatRefundMinutes(partialMinutes) + ' ≤ 提前 < ' + formatRefundMinutes(freeMinutes)
        + ' 部分退费（退 ' + (percent === '' || isNaN(percent) ? '-' : percent) + '%）　｜　'
        + '提前 < ' + formatRefundMinutes(partialMinutes) + ' 不退费（退 0%）';
}

/* ------------------------------------------------------------ 数据访问层 */

async function fetchRefundRuleList() {
    try {
        var res = await request({ url: API_BASE_URL + '/refund-rule/list', method: 'get' });
        return Array.isArray(res) ? res : [];
    } catch (e) {
        console.error('fetchRefundRuleList', e);
        return [];
    }
}

async function fetchRefundRuleCourseOptions() {
    try {
        var res = await request({ url: API_BASE_URL + '/refund-rule/course-options', method: 'get' });
        return Array.isArray(res) ? res : [];
    } catch (e) {
        console.error('fetchRefundRuleCourseOptions', e);
        return [];
    }
}

/** 管理端规则预览：给定课程 + 假设课次时间，立即算出档位与文案 */
async function fetchRefundRulePreview(courseId, lessonTime) {
    var params = {};
    if (courseId) params.courseId = courseId;
    if (lessonTime) params.lessonTime = lessonTime;
    try {
        return await request({
            url: API_BASE_URL + '/refund-rule/preview',
            method: 'get',
            params: params,
            customErrorMsg: false
        });
    } catch (e) {
        console.error('fetchRefundRulePreview', e);
        return null;
    }
}

/* -------------------------------------------------------------- 页面渲染 */

/** 菜单入口：loadAdminPageContent('refund_rule') 调用 */
async function renderRefundRulePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;

    container.innerHTML =
        '<div class="card">' +
        '  <div class="card-header">' +
        '    <div class="card-title"><i class="fa fa-undo"></i> 退改规则（免责 / 部分退费 / 不退费）</div>' +
        '    <button class="btn btn-primary" onclick="openRefundRuleEditor(\'course\', null)">' +
        '      <i class="fa fa-plus"></i> 新增课程规则</button>' +
        '  </div>' +
        '  <div class="card-body">' +
        '    <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
        '      <b>生效顺序：</b>课程专属规则 &gt; 租户默认规则 &gt; 系统内置默认（提前 24 小时免责 / 提前 12 小时退 50%）。<br>' +
        '      <b>判定依据：</b>该<b>课次</b>的上课时间与学生/管理员操作时刻的差值（提前多久）。<br>' +
        '      <b>三档划分：</b>只需填「免责时间点」与「部分退费时间点」，<b>提前不足部分退费线即不退费</b>——' +
        '      不再单独设第三个值，避免出现「不退费线高于部分退费线」这类自相矛盾的配置。' +
        '    </div>' +
        '    <div id="refund-rule-table-body">正在加载…</div>' +
        '  </div>' +
        '</div>';

    if (typeof applyTerms === 'function') applyTerms(container);

    // 两个接口互不依赖，并行请求后统一渲染（避免"首屏空、之后慢一步"）
    var results = await Promise.all([fetchRefundRuleList(), fetchRefundRuleCourseOptions()]);
    refundRuleRows = results[0];
    refundRuleCourseOptions = results[1];
    renderRefundRuleTable();
}

/** 页内刷新：只重取数据，保留页面结构 */
async function refreshRefundRulePage() {
    var container = document.getElementById('dynamic-content-center');
    // 容器已被替换（用户切走了菜单）→ 返回 false，交给通用逻辑整页重渲染
    if (!container || !document.getElementById('refund-rule-table-body')) return false;
    var results = await Promise.all([fetchRefundRuleList(), fetchRefundRuleCourseOptions()]);
    refundRuleRows = results[0];
    refundRuleCourseOptions = results[1];
    renderRefundRuleTable();
}

function renderRefundRuleTable() {
    var host = document.getElementById('refund-rule-table-body');
    if (!host) return;

    if (!refundRuleRows.length) {
        host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">暂无规则。' +
            '可先保存「租户默认规则」，或为个别课程单独设置覆盖。</div>';
        return;
    }

    var rows = refundRuleRows.map(function (rule) {
        var isTenantDefault = rule.scope === 'tenant';
        // 后端未配置默认规则时会给一条 id 为 null 的「虚拟」兜底项，提示尚未保存
        var notSavedYet = (rule.id === null || rule.id === undefined);
        var free = refundRuleFromMinutes(rule.freeBeforeMinutes, rule.freeUnit);
        var partial = refundRuleFromMinutes(rule.partialBeforeMinutes, rule.partialUnit);
        var scopeTag = isTenantDefault
            ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#e8f1ff;color:#1a6fd4;font-size:12px;">租户默认</span>'
            : '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#eef7ee;color:#3a8a3a;font-size:12px;">课程覆盖</span>';
        var enabledTag = (rule.enabled === 0)
            ? '<span style="color:#c0392b;">已停用</span>'
            : '<span style="color:#3a8a3a;">启用中</span>';

        return '<tr>' +
            '<td>' + scopeTag + '</td>' +
            '<td>' + escapeRefundHtml(rule.courseName || '') +
            (notSavedYet ? ' <span style="color:#c0871b;font-size:12px;">（未保存）</span>' : '') + '</td>' +
            '<td>提前 ' + formatRefundMinutes(rule.freeBeforeMinutes) + '</td>' +
            '<td>提前 ' + formatRefundMinutes(rule.partialBeforeMinutes) + '</td>' +
            '<td>' + (rule.partialRefundPercent === null || rule.partialRefundPercent === undefined ? '-' : rule.partialRefundPercent + '%') + '</td>' +
            '<td>' + enabledTag + '</td>' +
            '<td style="font-size:12px;color:#5a6472;">' + escapeRefundHtml(rule.ruleText || '') + '</td>' +
            '<td>' +
            '  <button class="btn btn-default" onclick="openRefundRuleEditor(\'' +
            (isTenantDefault ? 'tenant' : 'course') + '\', \'' + escapeRefundHtml(rule.courseId || '') + '\')">' +
            '    <i class="fa fa-edit"></i> 编辑</button>' +
            (isTenantDefault
                ? (notSavedYet ? '' : '  <button class="btn btn-warning" onclick="resetTenantRefundRule()"><i class="fa fa-undo"></i> 恢复系统默认</button>')
                : '  <button class="btn btn-warning" onclick="deleteCourseRefundRule(\'' +
                  escapeRefundHtml(rule.courseId || '') + '\', \'' + escapeRefundHtml(rule.courseName || '') + '\')">' +
                  '<i class="fa fa-trash"></i> 删除</button>') +
            '</td>' +
            '</tr>';
    }).join('');

    host.innerHTML =
        '<div class="table-container"><table class="data-table"><thead><tr>' +
        '<th>作用范围</th><th>课程</th><th>免责时间点</th><th>部分退费时间点</th>' +
        '<th>部分退费比例</th><th>状态</th><th>三档说明</th><th>操作</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* -------------------------------------------------------------- 编辑弹窗 */

/**
 * 打开编辑弹窗。
 * @param {string} scopeKind 'tenant' 编辑租户默认规则；'course' 编辑某课程覆盖
 * @param {string} courseId  课程ID；scopeKind='course' 且为 null 时表示新建（弹窗内选课程）
 */
function openRefundRuleEditor(scopeKind, courseId) {
    var existing = null;
    if (scopeKind === 'tenant') {
        existing = refundRuleRows.find(function (r) { return !r.courseId; }) || null;
    } else if (courseId) {
        existing = refundRuleRows.find(function (r) { return r.courseId === courseId; }) || null;
    }

    // 新建课程覆盖时，先给一份默认值（沿用租户默认规则的数值，减少重复填写）
    var tenantDefault = refundRuleRows.find(function (r) { return !r.courseId; }) || null;
    var seed = existing || {
        courseId: courseId || '',
        freeBeforeMinutes: tenantDefault ? tenantDefault.freeBeforeMinutes : 1440,
        freeUnit: tenantDefault ? tenantDefault.freeUnit : 'hour',
        partialBeforeMinutes: tenantDefault ? tenantDefault.partialBeforeMinutes : 720,
        partialUnit: tenantDefault ? tenantDefault.partialUnit : 'hour',
        partialRefundPercent: tenantDefault ? tenantDefault.partialRefundPercent : 50,
        enabled: (tenantDefault && tenantDefault.id !== null && tenantDefault.id !== undefined) ? tenantDefault.enabled : 1,
        remark: ''
    };

    refundRuleEditing = {
        scopeKind: scopeKind,
        courseId: seed.courseId || '',
        isNewCourseRule: scopeKind === 'course' && !existing
    };

    var free = refundRuleFromMinutes(seed.freeBeforeMinutes, seed.freeUnit);
    var partial = refundRuleFromMinutes(seed.partialBeforeMinutes, seed.partialUnit);

    // 课程选择框：排除已单独配置过的课程（那些走"编辑"）
    var configuredIds = {};
    refundRuleRows.forEach(function (r) { if (r.courseId) configuredIds[r.courseId] = true; });
    var courseSelectHtml = '';
    if (scopeKind === 'course') {
        if (existing) {
            courseSelectHtml =
                '<input type="text" id="rr-course" value="' + escapeRefundHtml(seed.courseName || seed.courseId) + '" disabled ' +
                'style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;background:#f6f8fa;">';
        } else {
            var options = refundRuleCourseOptions
                .filter(function (c) { return !configuredIds[c.courseId]; })
                .map(function (c) {
                    return '<option value="' + escapeRefundHtml(c.courseId) + '">' +
                        escapeRefundHtml(c.courseName) + '</option>';
                }).join('');
            if (!options) options = '<option value="">（所有课程都已单独配置）</option>';
            courseSelectHtml =
                '<select id="rr-course" style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
                options + '</select>';
        }
    }

    var modalHtml =
        '<div class="modal-mask" id="refundRuleModal" style="display:flex;">' +
        '  <div class="modal-content" style="max-width:640px;">' +
        '    <div class="modal-header">' +
        '      <h3 style="margin:0;font-size:16px;">' +
        (scopeKind === 'tenant' ? '编辑租户默认退改规则' : (existing ? '编辑课程退改规则' : '新增课程退改规则')) +
        '      </h3>' +
        '      <span class="modal-close" onclick="closeRefundRuleEditor()"><i class="fa fa-times"></i></span>' +
        '    </div>' +
        '    <div style="max-height:66vh;overflow:auto;padding-right:4px;">' +
        (scopeKind === 'course'
            ? '  <div class="form-item"><label>课程</label>' + courseSelectHtml + '</div>'
            : '') +
        '      <div class="form-item">' +
        '        <label>免责时间点（提前多久以上免收退改费用）</label>' +
        '        <div style="display:flex;gap:8px;align-items:center;">' +
        '          <input type="number" min="0" step="0.01" id="rr-free-value" value="' + free.value + '"' +
        '                 oninput="onRefundRuleFormChanged()" style="flex:1;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <select id="rr-free-unit" onchange="onRefundRuleFormChanged()" style="width:100px;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '            <option value="hour"' + (free.unit === 'hour' ? ' selected' : '') + '>小时</option>' +
        '            <option value="minute"' + (free.unit === 'minute' ? ' selected' : '') + '>分钟</option>' +
        '          </select>' +
        '        </div>' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>部分退费时间点（提前多久以上、但不足免责线时按比例退费）</label>' +
        '        <div style="display:flex;gap:8px;align-items:center;">' +
        '          <input type="number" min="0" step="0.01" id="rr-partial-value" value="' + partial.value + '"' +
        '                 oninput="onRefundRuleFormChanged()" style="flex:1;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <select id="rr-partial-unit" onchange="onRefundRuleFormChanged()" style="width:100px;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '            <option value="hour"' + (partial.unit === 'hour' ? ' selected' : '') + '>小时</option>' +
        '            <option value="minute"' + (partial.unit === 'minute' ? ' selected' : '') + '>分钟</option>' +
        '          </select>' +
        '        </div>' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>部分退费比例（%）</label>' +
        '        <input type="number" min="1" max="99" id="rr-percent" value="' + (seed.partialRefundPercent === null || seed.partialRefundPercent === undefined ? 50 : seed.partialRefundPercent) + '"' +
        '               oninput="onRefundRuleFormChanged()" style="width:140px;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '        <div style="font-size:12px;color:#8a94a6;margin-top:4px;">提前不足部分退费时间点时不退费（0%），因此这里只能填 1~99。</div>' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>是否启用</label>' +
        '        <select id="rr-enabled" style="width:140px;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <option value="1"' + (seed.enabled === 0 ? '' : ' selected') + '>启用</option>' +
        '          <option value="0"' + (seed.enabled === 0 ? ' selected' : '') + '>停用（回落到上一级规则）</option>' +
        '        </select>' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>备注</label>' +
        '        <input type="text" id="rr-remark" value="' + escapeRefundHtml(seed.remark || '') + '" placeholder="选填，例如：寒暑假期间适用" ' +
        '               style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '      </div>' +
        '      <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;font-size:13px;line-height:1.8;">' +
        '        <div style="font-weight:600;margin-bottom:4px;">三档区间预览</div>' +
        '        <div id="rr-zone-preview" style="color:#5a6472;"></div>' +
        '      </div>' +
        '      <div style="margin-top:14px;background:#fffaf0;border:1px solid #ffe0a3;border-radius:6px;padding:10px 14px;">' +
        '        <div style="font-weight:600;margin-bottom:6px;color:#8a5a00;">规则试算（按当前表单值，不影响已保存规则）</div>' +
        '        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '          <label style="font-size:13px;">假设课次时间：</label>' +
        '          <input type="datetime-local" id="rr-preview-time" style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <button class="btn btn-default" onclick="runRefundRulePreview()"><i class="fa fa-calculator"></i> 试算</button>' +
        '        </div>' +
        '        <div id="rr-preview-result" style="margin-top:8px;font-size:13px;color:#5a6472;"></div>' +
        '      </div>' +
        '    </div>' +
        '    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
        '      <button class="btn btn-default" onclick="closeRefundRuleEditor()">取消</button>' +
        '      <button class="btn btn-primary" onclick="submitRefundRuleForm()"><i class="fa fa-save"></i> 保存规则</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    var old = document.getElementById('refundRuleModal');
    if (old) old.remove();
    // 挂到 body 上：.modal-content 里有 overflow:auto 的滚动区，
    // 放进内容容器容易被裁切（历史踩过：absolute + overflow:auto 父级必被裁）
    var holder = document.createElement('div');
    holder.innerHTML = modalHtml;
    document.body.appendChild(holder.firstChild);

    // 默认给试算框填一个「明天这个点」，省得每次手选
    var previewInput = document.getElementById('rr-preview-time');
    if (previewInput) {
        var d = new Date(Date.now() + 24 * 60 * 60 * 1000);
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        previewInput.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    onRefundRuleFormChanged();
}

function closeRefundRuleEditor() {
    var modal = document.getElementById('refundRuleModal');
    if (modal) modal.remove();
    refundRuleEditing = null;
}

/** 表单任意字段变化 → 刷新三档区间预览 */
function onRefundRuleFormChanged() {
    var zone = document.getElementById('rr-zone-preview');
    if (!zone) return;
    var freeValue = document.getElementById('rr-free-value').value;
    var freeUnit = document.getElementById('rr-free-unit').value;
    var partialValue = document.getElementById('rr-partial-value').value;
    var partialUnit = document.getElementById('rr-partial-unit').value;
    var percent = document.getElementById('rr-percent').value;
    zone.textContent = refundRuleZoneText(
        refundRuleToMinutes(freeValue, freeUnit),
        refundRuleToMinutes(partialValue, partialUnit),
        percent
    );
}

/** 收集表单值并做前端侧预校验（服务端仍会再校验一次，前端只为少一次往返） */
function collectRefundRuleForm() {
    var freeValue = document.getElementById('rr-free-value').value;
    var freeUnit = document.getElementById('rr-free-unit').value;
    var partialValue = document.getElementById('rr-partial-value').value;
    var partialUnit = document.getElementById('rr-partial-unit').value;
    var percentValue = document.getElementById('rr-percent').value;

    var courseId = '';
    if (refundRuleEditing && refundRuleEditing.scopeKind === 'course') {
        var courseEl = document.getElementById('rr-course');
        courseId = courseEl ? courseEl.value : '';
        if (!courseId) {
            notifyRefundRule('请选择要配置的课程');
            return null;
        }
    }

    var freeMinutes = refundRuleToMinutes(freeValue, freeUnit);
    var partialMinutes = refundRuleToMinutes(partialValue, partialUnit);
    var percent = Number(percentValue);

    if (isNaN(freeMinutes) || freeValue === '') { notifyRefundRule('请填写免责时间点'); return null; }
    if (isNaN(partialMinutes) || partialValue === '') { notifyRefundRule('请填写部分退费时间点'); return null; }
    if (freeMinutes < partialMinutes) { notifyRefundRule('免责时间点必须大于或等于部分退费时间点'); return null; }
    if (isNaN(percent) || percent < 1 || percent > 99) { notifyRefundRule('部分退费比例需在 1~99 之间'); return null; }

    return {
        courseId: courseId,
        enabled: Number(document.getElementById('rr-enabled').value),
        freeBeforeMinutes: freeMinutes,
        freeUnit: freeUnit,
        partialBeforeMinutes: partialMinutes,
        partialUnit: partialUnit,
        partialRefundPercent: percent,
        remark: document.getElementById('rr-remark').value
    };
}

async function submitRefundRuleForm() {
    var payload = collectRefundRuleForm();
    if (!payload) return;
    try {
        await request({ url: API_BASE_URL + '/refund-rule/save', method: 'post', data: payload });
        closeRefundRuleEditor();
        await refreshRefundRulePage();
        notifyRefundRule('退改规则已保存');
    } catch (e) {
        console.error('submitRefundRuleForm', e);
    }
}

/** 试算：调 /refund-rule/preview，但用表单里的当前数值覆盖规则，便于"改之前先看看效果" */
async function runRefundRulePreview() {
    var host = document.getElementById('rr-preview-result');
    if (!host) return;
    var timeEl = document.getElementById('rr-preview-time');
    if (!timeEl || !timeEl.value) { host.textContent = '请先选择假定的课次时间'; return; }

    var courseId = '';
    if (refundRuleEditing && refundRuleEditing.scopeKind === 'course') {
        var courseEl = document.getElementById('rr-course');
        courseId = courseEl ? courseEl.value : '';
    }
    host.textContent = '计算中…';
    var hint = await fetchRefundRulePreview(courseId, timeEl.value.replace('T', ' '));
    if (!hint) { host.textContent = '试算失败，请稍后重试'; return; }

    // 试算用的是「已保存的规则」，若表单被改过要提示一句，避免误以为试算含未保存的改动
    var formChanged = false;
    var payload = collectRefundRuleForm();
    if (payload && hint) {
        formChanged = (payload.freeBeforeMinutes !== hint.freeBeforeMinutes ||
            payload.partialBeforeMinutes !== hint.partialBeforeMinutes ||
            payload.partialRefundPercent !== hint.partialRefundPercent);
    }
    host.innerHTML =
        '<div>距上课还有 <b>' + escapeRefundHtml(hint.aheadText || '-') + '</b>，' +
        '判定为 <b>' + escapeRefundHtml(hint.levelText || '-') + '</b>' +
        (hint.refundPercent === null || hint.refundPercent === undefined ? '' : '，退费比例 ' + hint.refundPercent + '%') +
        '</div>' +
        '<div style="color:#8a94a6;font-size:12px;margin-top:4px;">' + escapeRefundHtml(hint.ruleText || '') + '</div>' +
        (formChanged
            ? '<div style="color:#c0871b;font-size:12px;margin-top:4px;">注：试算使用<b>已保存</b>的规则；表单里的改动需点「保存规则」后才会生效。</div>'
            : '');
}

/* -------------------------------------------------------------- 删除操作 */

/** 删除某课程覆盖（回落到租户默认规则） */
async function deleteCourseRefundRule(courseId, courseName) {
    if (!courseId) return;
    if (!window.confirm('确定删除《' + courseName + '》的专属退改规则？\n删除后该课程将按租户默认规则执行。')) return;
    try {
        await request({
            url: API_BASE_URL + '/refund-rule/delete',
            method: 'post',
            data: { courseId: courseId }
        });
        await refreshRefundRulePage();
    } catch (e) {
        console.error('deleteCourseRefundRule', e);
    }
}

/** 恢复系统内置默认：删除租户默认规则行 */
async function resetTenantRefundRule() {
    if (!window.confirm('确定恢复系统内置默认规则？\n（提前 24 小时免责 / 提前 12 小时退 50% / 不足 12 小时不退费）')) return;
    try {
        await request({
            url: API_BASE_URL + '/refund-rule/delete',
            method: 'post',
            data: { courseId: '' }
        });
        await refreshRefundRulePage();
    } catch (e) {
        console.error('resetTenantRefundRule', e);
    }
}

/* ---------------------------------------------------------- 注册页内刷新 */

if (typeof registerPageRefresh === 'function') {
    registerPageRefresh(REFUND_RULE_MENU_KEY, refreshRefundRulePage);
}

window.renderRefundRulePage = renderRefundRulePage;
window.refreshRefundRulePage = refreshRefundRulePage;
window.openRefundRuleEditor = openRefundRuleEditor;
window.closeRefundRuleEditor = closeRefundRuleEditor;
window.onRefundRuleFormChanged = onRefundRuleFormChanged;
window.submitRefundRuleForm = submitRefundRuleForm;
window.runRefundRulePreview = runRefundRulePreview;
window.deleteCourseRefundRule = deleteCourseRefundRule;
window.resetTenantRefundRule = resetTenantRefundRule;
window.formatRefundMinutes = formatRefundMinutes;
