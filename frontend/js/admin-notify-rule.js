/* ============================================================================
 * admin-notify-rule.js —— 租户管理员「系统配置 → 通知规则」
 * 接口：/notify-rule/*   （见 NotifyRuleController）
 *
 * 业务语义
 *   一份规则 = 一组「上课通知时间点」，每个时间点是一个「课前偏移量」：
 *       应发时刻 = 该课次的上课时刻 − 提前量
 *
 *   一个租户一份「默认规则」，每门课程可单独「覆盖」（整组覆盖，不逐点继承）：
 *       课程专属规则 ＞ 租户默认规则 ＞ 系统内置时间点（提前3天 / 1天 / 课前1小时 / 课前30分钟）
 *
 *   本界面取代原先写死在 frontend/js/public/appointmentNotes.js 里的
 *   「3 天 / 1 天 / 课前 60 分钟」三个时间点 —— 那里既不可配置，
 *   判定又跑在浏览器里（客户端改系统时间即可绕过）。
 *
 * 两个必须知道的取舍（服务端 NotifyDispatchService 的注释里也有）
 *   1. 天级档位与上课时刻同钟点，不额外配「发送钟点」：
 *      周二 14:00 的课，「提前 3 天」会在上周六 14:00 发。界面上用
 *      「应发时刻试算」把这个代价摆出来，管理员能看到避开周末就得上调/下调提前量。
 *   2. 窗口过期不补发：预约时就已经越过的档位不会被补发（否则下单瞬间会被糊一脸旧提醒）。
 *      所以「提前 3 天」这类远期档位只对提前足够久预约的课有效。
 * ========================================================================== */

/* ------------------------------------------------------------------ 状态 */
// 页面刷新注册用的菜单 key，必须与 admin.html 中 menu-item 的 key 一致
var NOTIFY_RULE_MENU_KEY = 'notify_rule';

var notifyRuleRows = [];          // /notify-rule/list 返回的规则列表
var notifyRuleCourseOptions = []; // /notify-rule/course-options 课程下拉
var notifyRuleEditing = null;     // 当前编辑中的规则（含 points 数组，取消不影响已保存数据）
var notifyRuleOptions = null;     // 档位/接收人/粒度 枚举（/notify-rule/options）

/* ------------------------------------------------------------ 小工具函数 */

/** 把「数值 + 粒度」换算成分钟（与服务端 NotifyRuleService.resolveMinutes 同一套口径） */
function notifyToMinutes(value, unit) {
    var v = Number(value);
    if (isNaN(v) || v < 0) return NaN;
    if (unit === 'day') return Math.round(v * 1440);
    if (unit === 'hour') return Math.round(v * 60);
    return Math.round(v);
}

/** 分钟数转可读文案：4320 → 3 天；90 → 1 小时 30 分钟 */
function formatNotifyMinutes(minutes) {
    var m = Number(minutes);
    if (isNaN(m) || minutes === null || minutes === undefined) return '-';
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

/**
 * 分钟数回显成「数值 + 粒度」。
 * 优先沿用库里存的粒度；若不能整除（例如按「天」存了 1000 分钟）则退化为更细的粒度，
 * 避免界面上出现 0.69 天这种没法二次编辑的值。
 */
function notifyFromMinutes(minutes, unit) {
    var m = Number(minutes);
    if (isNaN(m) || m < 0) return { value: 3, unit: unit || 'day' };
    if (unit === 'day' && m % 1440 === 0) return { value: m / 1440, unit: 'day' };
    if (unit !== 'minute' && m % 60 === 0) return { value: m / 60, unit: 'hour' };
    return { value: m, unit: 'minute' };
}

function escapeNotifyHtml(text) {
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
function notifyNotifyRule(msg) {
    if (typeof window.showApiError === 'function') {
        window.showApiError(msg);
    } else {
        window.alert(msg);
    }
}

function notifyPad(n) { return n < 10 ? '0' + n : '' + n; }

/** 日期格式化为 'yyyy-MM-dd HH:mm' */
function notifyFmtDateTime(d) {
    return d.getFullYear() + '-' + notifyPad(d.getMonth() + 1) + '-' + notifyPad(d.getDate()) +
        ' ' + notifyPad(d.getHours()) + ':' + notifyPad(d.getMinutes());
}

/** 解析 'yyyy-MM-ddTHH:mm' / 'yyyy-MM-dd HH:mm' 为本地时间 Date（无效返回 null） */
function notifyParseLocal(text) {
    if (!text) return null;
    var d = new Date(String(text).replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}

/** 档位下拉选项 */
function notifyStageOptions(selected) {
    var list = (notifyRuleOptions && notifyRuleOptions.stages) || [
        { code: 'PRE_FIRST', text: '首次预告' },
        { code: 'PRE_AGAIN', text: '再次预告' },
        { code: 'PRE_SOON', text: '课前预告' },
        { code: 'FINAL_CALL', text: '最后提示' }
    ];
    return list.map(function (s) {
        return '<option value="' + s.code + '"' + (s.code === selected ? ' selected' : '') + '>' +
            escapeNotifyHtml(s.text) + '</option>';
    }).join('');
}

/** 接收人下拉选项 */
function notifyAudienceOptions(selected) {
    var list = (notifyRuleOptions && notifyRuleOptions.audiences) || [
        { code: 'BOTH', text: '学生 + 教师' },
        { code: 'STUDENT', text: '仅学生' },
        { code: 'TEACHER', text: '仅教师' }
    ];
    return list.map(function (a) {
        return '<option value="' + a.code + '"' + (a.code === selected ? ' selected' : '') + '>' +
            escapeNotifyHtml(a.text) + '</option>';
    }).join('');
}

/** 粒度下拉选项 */
function notifyUnitOptions(selected) {
    var list = (notifyRuleOptions && notifyRuleOptions.units) || [
        { code: 'day', text: '天' }, { code: 'hour', text: '小时' }, { code: 'minute', text: '分钟' }
    ];
    return list.map(function (u) {
        return '<option value="' + u.code + '"' + (u.code === selected ? ' selected' : '') + '>' +
            escapeNotifyHtml(u.text) + '</option>';
    }).join('');
}

/** 内置兜底档位（与后端 NotifyRuleService.BUILTIN 保持一致） */
function builtinNotifyPoints() {
    return [
        { stage: 'PRE_FIRST', value: 3, unit: 'day', audience: 'BOTH', enabled: 1 },
        { stage: 'PRE_AGAIN', value: 1, unit: 'day', audience: 'BOTH', enabled: 1 },
        { stage: 'PRE_SOON', value: 1, unit: 'hour', audience: 'BOTH', enabled: 1 },
        { stage: 'FINAL_CALL', value: 30, unit: 'minute', audience: 'BOTH', enabled: 1 }
    ];
}

/* ------------------------------------------------------------ 数据访问层 */

async function fetchNotifyRuleList() {
    try {
        var res = await request({ url: API_BASE_URL + '/notify-rule/list', method: 'get' });
        return Array.isArray(res) ? res : [];
    } catch (e) {
        console.error('fetchNotifyRuleList', e);
        return [];
    }
}

async function fetchNotifyRuleCourseOptions() {
    try {
        var res = await request({ url: API_BASE_URL + '/notify-rule/course-options', method: 'get' });
        return Array.isArray(res) ? res : [];
    } catch (e) {
        console.error('fetchNotifyRuleCourseOptions', e);
        return [];
    }
}

async function fetchNotifyRuleOptions() {
    try {
        return await request({ url: API_BASE_URL + '/notify-rule/options', method: 'get' });
    } catch (e) {
        console.error('fetchNotifyRuleOptions', e);
        return null;
    }
}

/* -------------------------------------------------------------- 页面渲染 */

/** 菜单入口：loadAdminPageContent('notify_rule') 调用 */
async function renderNotifyRulePage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;

    container.innerHTML =
        '<div class="card">' +
        '  <div class="card-header">' +
        '    <div class="card-title"><i class="fa fa-bell"></i> 通知规则（上课提醒的时间点）</div>' +
        '    <button class="btn btn-primary" onclick="openNotifyRuleEditor(\'course\', null)">' +
        '      <i class="fa fa-plus"></i> 新增课程规则</button>' +
        '  </div>' +
        '  <div class="card-body">' +
        '    <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
        '      <b>生效顺序：</b>课程专属规则 &gt; 租户默认规则 &gt; 系统内置时间点（提前 3 天 / 1 天 / 课前 1 小时 / 课前 30 分钟）。<br>' +
        '      <b>发送时刻：</b>提前量一律相对<b>该课次的上课时刻</b>倒推，天级档位与上课时刻同钟点（不设固定发送钟点）。<br>' +
        '      <b>不补发：</b>预约时就已经越过的档位不会补发；已过上课时间的课次绝不发送。一个订单只提醒<b>最近一个未完成课次</b>。<br>' +
        '      <b>幂等：</b>自动发送对「同一课次 + 同一档位 + 同一收件人」只发一次；管理员手动发送不受此限，但仍会留下流水。' +
        '    </div>' +
        '    <div id="notify-rule-table-body">正在加载…</div>' +
        '  </div>' +
        '</div>';

    if (typeof applyTerms === 'function') applyTerms(container);

    // 三个接口互不依赖，并行请求后统一渲染（避免"首屏空、之后慢一步"）
    var results = await Promise.all([
        fetchNotifyRuleList(),
        fetchNotifyRuleCourseOptions(),
        fetchNotifyRuleOptions()
    ]);
    notifyRuleRows = results[0];
    notifyRuleCourseOptions = results[1];
    notifyRuleOptions = results[2];
    renderNotifyRuleTable();
}

/** 页内刷新：只重取数据，保留页面结构 */
async function refreshNotifyRulePage() {
    var container = document.getElementById('dynamic-content-center');
    // 容器已被替换（用户切走了菜单）→ 返回 false，交给通用逻辑整页重渲染
    if (!container || !document.getElementById('notify-rule-table-body')) return false;
    var results = await Promise.all([
        fetchNotifyRuleList(),
        fetchNotifyRuleCourseOptions(),
        fetchNotifyRuleOptions()
    ]);
    notifyRuleRows = results[0];
    notifyRuleCourseOptions = results[1];
    notifyRuleOptions = results[2];
    renderNotifyRuleTable();
}

function renderNotifyRuleTable() {
    var host = document.getElementById('notify-rule-table-body');
    if (!host) return;

    if (!notifyRuleRows.length) {
        host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">暂无规则。' +
            '可先保存「租户默认规则」，或为个别课程单独设置覆盖。</div>';
        return;
    }

    var rows = notifyRuleRows.map(function (rule) {
        var isTenantDefault = rule.scope === 'tenant';
        // 后端未配置默认规则时会给一条 id 为 null 的「虚拟」兜底项，提示尚未保存
        var notSavedYet = (rule.id === null || rule.id === undefined);
        var points = Array.isArray(rule.points) ? rule.points : [];
        var enabledPoints = points.filter(function (p) { return p.enabled !== 0; });
        var scopeTag = isTenantDefault
            ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#e8f1ff;color:#1a6fd4;font-size:12px;">租户默认</span>'
            : '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#eef7ee;color:#3a8a3a;font-size:12px;">课程覆盖</span>';
        var enabledTag = (rule.enabled === 0)
            ? '<span style="color:#c0392b;">已停用</span>'
            : '<span style="color:#3a8a3a;">启用中</span>';

        // 档位摘要：把每档的提前量与接收人浓缩成一行，不必点开就能比对各课程
        var summary = enabledPoints.map(function (p) {
            return escapeNotifyHtml(p.offsetText || formatNotifyMinutes(p.offsetMinutes)) +
                '<span style="color:#8a94a6;">(' + escapeNotifyHtml(p.audienceText || '') + ')</span>';
        }).join(' → ');
        if (!summary) summary = '<span style="color:#c0392b;">无启用的时间点</span>';

        return '<tr>' +
            '<td>' + scopeTag + '</td>' +
            '<td>' + escapeNotifyHtml(rule.courseName || '') +
            (notSavedYet ? ' <span style="color:#c0871b;font-size:12px;">（未保存）</span>' : '') + '</td>' +
            '<td>' + enabledPoints.length + ' / ' + points.length + '</td>' +
            '<td style="font-size:12px;color:#5a6472;">' + summary + '</td>' +
            '<td>' + enabledTag + '</td>' +
            '<td>' +
            '  <button class="btn btn-default" onclick="openNotifyRuleEditor(\'' +
            (isTenantDefault ? 'tenant' : 'course') + '\', \'' + escapeNotifyHtml(rule.courseId || '') + '\')">' +
            '    <i class="fa fa-edit"></i> 编辑</button>' +
            (isTenantDefault
                ? (notSavedYet ? '' : '  <button class="btn btn-warning" onclick="resetTenantNotifyRule()"><i class="fa fa-undo"></i> 恢复系统默认</button>')
                : '  <button class="btn btn-warning" onclick="deleteCourseNotifyRule(\'' +
                  escapeNotifyHtml(rule.courseId || '') + '\', \'' + escapeNotifyHtml(rule.courseName || '') + '\')">' +
                  '<i class="fa fa-trash"></i> 删除</button>') +
            '</td>' +
            '</tr>';
    }).join('');

    host.innerHTML =
        '<div class="table-container"><table class="data-table"><thead><tr>' +
        '<th>作用范围</th><th><span data-term="course">课程</span></th><th>启用档位</th>' +
        '<th>时间点摘要（离上课由远及近）</th><th>状态</th><th>操作</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    if (typeof applyTerms === 'function') applyTerms(host);
}

/* -------------------------------------------------------------- 编辑弹窗 */

/**
 * 打开编辑弹窗。
 * @param {string} scopeKind 'tenant' 编辑租户默认规则；'course' 编辑某课程覆盖
 * @param {string} courseId  课程ID；scopeKind='course' 且为 null 时表示新建（弹窗内选课程）
 */
function openNotifyRuleEditor(scopeKind, courseId) {
    var existing = null;
    if (scopeKind === 'tenant') {
        existing = notifyRuleRows.find(function (r) { return !r.courseId; }) || null;
    } else if (courseId) {
        existing = notifyRuleRows.find(function (r) { return r.courseId === courseId; }) || null;
    }

    // 新建课程覆盖时预填「租户默认的档位」：整组覆盖的语义下，
    // 管理员通常只想改其中一两档，预填能避免每门课都从零配四档。
    var tenantDefault = notifyRuleRows.find(function (r) { return !r.courseId; }) || null;

    var seedPoints = null;
    if (existing && Array.isArray(existing.points) && existing.points.length) {
        seedPoints = existing.points.map(function (p) {
            var form = notifyFromMinutes(p.offsetMinutes, p.inputUnit);
            return {
                stage: p.stage,
                value: form.value,
                unit: form.unit,
                audience: p.audience || 'BOTH',
                enabled: p.enabled === 0 ? 0 : 1
            };
        });
    } else if (tenantDefault && Array.isArray(tenantDefault.points) && tenantDefault.points.length) {
        seedPoints = tenantDefault.points
            .filter(function (p) { return p.enabled !== 0; })
            .map(function (p) {
                var form = notifyFromMinutes(p.offsetMinutes, p.inputUnit);
                return {
                    stage: p.stage,
                    value: form.value,
                    unit: form.unit,
                    audience: p.audience || 'BOTH',
                    enabled: 1
                };
            });
    }
    if (!seedPoints || !seedPoints.length) {
        seedPoints = builtinNotifyPoints();
    }

    notifyRuleEditing = {
        scopeKind: scopeKind,
        courseId: (existing && existing.courseId) || courseId || '',
        isNewCourseRule: scopeKind === 'course' && !existing,
        points: seedPoints
    };

    var enabled = (existing && existing.enabled !== undefined && existing.enabled !== null) ? existing.enabled : 1;
    var nameValue = (existing && existing.name) || (scopeKind === 'tenant' ? '租户默认规则' : '');
    var remarkValue = (existing && existing.remark) || '';

    var courseSelectHtml = '';
    if (scopeKind === 'course') {
        if (existing) {
            courseSelectHtml =
                '<input type="text" id="nr-course" value="' + escapeNotifyHtml(existing.courseName || existing.courseId) + '" disabled ' +
                'style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;background:#f6f8fa;">';
        } else {
            // 第一项：缺省规则（courseId 空串 = 租户默认规则），对所有未单独配置的课程生效；
            // 之后列出本租户全部课程，供为任意课程单独设置覆盖（含已配置项，选它即覆盖更新）。
            var options = '<option value="">缺省规则（对所有未单独配置的课程有效）</option>';
            options += notifyRuleCourseOptions
                .map(function (c) {
                    return '<option value="' + escapeNotifyHtml(c.courseId) + '">' +
                        escapeNotifyHtml(c.courseName) + '</option>';
                }).join('');
            courseSelectHtml =
                '<select id="nr-course" style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
                options + '</select>';
        }
    }

    var modalHtml =
        '<div class="modal-mask" id="notifyRuleModal" style="display:flex;">' +
        '  <div class="modal-content" style="max-width:760px;">' +
        '    <div class="modal-header">' +
        '      <h3 style="margin:0;font-size:16px;">' +
        (scopeKind === 'tenant' ? '编辑租户默认通知规则' : (existing ? '编辑课程通知规则' : '新增课程通知规则')) +
        '      </h3>' +
        '      <span class="modal-close" onclick="closeNotifyRuleEditor()"><i class="fa fa-times"></i></span>' +
        '    </div>' +
        '    <div style="max-height:68vh;overflow:auto;padding-right:4px;">' +
        (scopeKind === 'course'
            ? '  <div class="form-item"><label><span data-term="course">课程</span></label>' + courseSelectHtml + '</div>'
            : '') +
        '      <div class="form-item">' +
        '        <label>规则名（仅界面显示）</label>' +
        '        <input type="text" id="nr-name" value="' + escapeNotifyHtml(nameValue) + '" maxlength="64" ' +
        '               placeholder="例如：寒暑假提前 1 天" style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>是否启用</label>' +
        '        <select id="nr-enabled" style="width:240px;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '          <option value="1"' + (enabled === 0 ? '' : ' selected') + '>启用</option>' +
        '          <option value="0"' + (enabled === 0 ? ' selected' : '') + '>停用（回落到上一级规则）</option>' +
        '        </select>' +
        '      </div>' +
        '      <div class="form-item">' +
        '        <label>备注</label>' +
        '        <input type="text" id="nr-remark" value="' + escapeNotifyHtml(remarkValue) + '" maxlength="255" placeholder="选填" ' +
        '               style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' +
        '      </div>' +

        '      <div style="margin-top:10px;">' +
        '        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '          <label style="font-weight:600;">通知时间点（离上课由远及近）</label>' +
        '          <button class="btn btn-default" onclick="addNotifyPoint()"><i class="fa fa-plus"></i> 添加一档</button>' +
        '        </div>' +
        '        <div style="font-size:12px;color:#8a94a6;margin-bottom:8px;">' +
        '          保存时服务端会按「提前量从大到小」重新编号，所以这里不必关心顺序；' +
        '          但两档提前量不能相同。停用某一档请把该行的「状态」改为停用，不要删行（删行会让档位编号出现空洞）。' +
        '        </div>' +
        '        <div id="nr-points"></div>' +
        '      </div>' +

        '      <div style="margin-top:14px;background:#fffaf0;border:1px solid #ffe0a3;border-radius:6px;padding:10px 14px;">' +
        '        <div style="font-weight:600;margin-bottom:6px;color:#8a5a00;">应发时刻试算（按当前表单值实时计算）</div>' +
        '        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '          <label style="font-size:13px;">假设上课时间：</label>' +
        '          <input type="datetime-local" id="nr-preview-time" oninput="renderNotifyPlanPreview()" ' +
        '                 style="padding:6px 10px;border:1px solid #e9ecef;border-radius:4px;">' +
        '        </div>' +
        '        <div id="nr-plan-preview" style="margin-top:8px;font-size:13px;color:#5a6472;"></div>' +
        '      </div>' +
        '    </div>' +
        '    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">' +
        '      <button class="btn btn-default" onclick="closeNotifyRuleEditor()">取消</button>' +
        '      <button class="btn btn-primary" onclick="submitNotifyRuleForm()"><i class="fa fa-save"></i> 保存规则</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    var old = document.getElementById('notifyRuleModal');
    if (old) old.remove();
    // 挂到 body 上：.modal-content 里有 overflow:auto 的滚动区，
    // 放进内容容器容易被裁切（历史踩过：absolute + overflow:auto 父级必被裁）
    var holder = document.createElement('div');
    holder.innerHTML = modalHtml;
    document.body.appendChild(holder.firstChild);

    // 默认给试算框填一个「明天这个点」，省得每次手选
    var previewInput = document.getElementById('nr-preview-time');
    if (previewInput) {
        var d = new Date(Date.now() + 24 * 60 * 60 * 1000);
        previewInput.value = d.getFullYear() + '-' + notifyPad(d.getMonth() + 1) + '-' + notifyPad(d.getDate()) +
            'T' + notifyPad(d.getHours()) + ':' + notifyPad(d.getMinutes());
    }
    renderNotifyPointRows();
    if (typeof applyTerms === 'function') applyTerms(document.getElementById('notifyRuleModal'));
}

function closeNotifyRuleEditor() {
    var modal = document.getElementById('notifyRuleModal');
    if (modal) modal.remove();
    notifyRuleEditing = null;
}

/**
 * 重画明细行。
 *
 * <p>增删档位时整块重画（而不是局部插入/移除），因为「档位序号」是派生量，
 * 局部改动后还得逐行改序号，反而更容易错。重画前必须先把 DOM 现值收进内存，
 * 否则用户刚输入的内容会丢。
 */
function renderNotifyPointRows() {
    var host = document.getElementById('nr-points');
    if (!host || !notifyRuleEditing) return;

    var points = notifyRuleEditing.points || [];
    if (!points.length) {
        host.innerHTML = '<div style="padding:14px;text-align:center;color:#8a94a6;border:1px dashed #d9e0e8;border-radius:6px;">' +
            '还没有任何时间点，点「添加一档」开始配置。</div>';
        renderNotifyPlanPreview();
        return;
    }

    var rows = points.map(function (p, idx) {
        return '<div class="nr-point-row" data-idx="' + idx + '" ' +
            '     style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px;margin-bottom:6px;background:#fafbfc;border:1px solid #e8ecf1;border-radius:6px;">' +
            '  <span style="width:24px;text-align:center;color:#8a94a6;font-size:13px;">' + (idx + 1) + '</span>' +
            '  <select class="nr-stage" onchange="onNotifyPointChanged()" ' +
            '          style="width:120px;padding:6px 8px;border:1px solid #e9ecef;border-radius:4px;">' +
            notifyStageOptions(p.stage) + '</select>' +
            '  <input type="number" min="0" step="1" class="nr-value" value="' + escapeNotifyHtml(p.value) + '" ' +
            '         oninput="onNotifyPointChanged()" ' +
            '         style="width:90px;padding:6px 8px;border:1px solid #e9ecef;border-radius:4px;">' +
            '  <select class="nr-unit" onchange="onNotifyPointChanged()" ' +
            '          style="width:80px;padding:6px 8px;border:1px solid #e9ecef;border-radius:4px;">' +
            notifyUnitOptions(p.unit) + '</select>' +
            '  <span style="font-size:12px;color:#8a94a6;">前</span>' +
            '  <select class="nr-audience" onchange="onNotifyPointChanged()" ' +
            '          style="width:120px;padding:6px 8px;border:1px solid #e9ecef;border-radius:4px;">' +
            notifyAudienceOptions(p.audience) + '</select>' +
            '  <select class="nr-enabled" onchange="onNotifyPointChanged()" ' +
            '          style="width:90px;padding:6px 8px;border:1px solid #e9ecef;border-radius:4px;">' +
            '    <option value="1"' + (p.enabled === 0 ? '' : ' selected') + '>启用</option>' +
            '    <option value="0"' + (p.enabled === 0 ? ' selected' : '') + '>停用</option>' +
            '  </select>' +
            '  <span class="nr-offset-text" style="font-size:12px;color:#5a6472;min-width:90px;"></span>' +
            '  <button class="btn btn-warning" style="margin-left:auto;" onclick="removeNotifyPoint(' + idx + ')">' +
            '    <i class="fa fa-trash"></i> 删除</button>' +
            '</div>';
    }).join('');

    host.innerHTML = rows;
    renderNotifyPlanPreview();
}

/** 把 DOM 里当前各行的值收进内存（重画前/提交前都要先收） */
function syncNotifyPointsFromDom() {
    if (!notifyRuleEditing) return;
    var rows = document.querySelectorAll('#nr-points .nr-point-row');
    if (!rows.length) {
        notifyRuleEditing.points = [];
        return;
    }
    var list = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        list.push({
            stage: row.querySelector('.nr-stage').value,
            value: row.querySelector('.nr-value').value,
            unit: row.querySelector('.nr-unit').value,
            audience: row.querySelector('.nr-audience').value,
            enabled: Number(row.querySelector('.nr-enabled').value)
        });
    }
    notifyRuleEditing.points = list;
}

/** 任意字段变化：收值 → 刷新每行的可读提前量 + 刷新试算 */
function onNotifyPointChanged() {
    syncNotifyPointsFromDom();
    renderNotifyPlanPreview();
}

function addNotifyPoint() {
    syncNotifyPointsFromDom();
    var points = (notifyRuleEditing && notifyRuleEditing.points) ? notifyRuleEditing.points.slice() : [];
    if (points.length >= 10) {
        notifyNotifyRule('最多配置 10 个通知时间点');
        return;
    }
    // 新档位默认插在「最后提示」的位置：比现有最小提前量再小一些，避免与现有档位重复
    var minMinutes = null;
    points.forEach(function (p) {
        var m = notifyToMinutes(p.value, p.unit);
        if (!isNaN(m) && (minMinutes === null || m < minMinutes)) minMinutes = m;
    });
    var next = minMinutes === null ? 30 : Math.max(1, Math.floor(minMinutes / 2));
    points.push({
        stage: 'FINAL_CALL',
        value: next,
        unit: 'minute',
        audience: 'BOTH',
        enabled: 1
    });
    notifyRuleEditing.points = points;
    renderNotifyPointRows();
}

function removeNotifyPoint(idx) {
    syncNotifyPointsFromDom();
    if (!notifyRuleEditing || !notifyRuleEditing.points) return;
    if (notifyRuleEditing.points.length <= 1) {
        notifyNotifyRule('至少要保留一个时间点；不想发这一档就把它的状态改成「停用」');
        return;
    }
    notifyRuleEditing.points.splice(idx, 1);
    renderNotifyPointRows();
}

/**
 * 应发时刻试算（纯前端本地计算，随表单实时更新）。
 *
 * <p>为什么不调服务端 /preview：那样只能试算「已保存的规则」，而管理员在弹窗里
 * 改的往往还没保存，试算结果会对不上——反而误导。本地算的公式与服务端完全一致
 * （应发时刻 = 上课时刻 − 提前量），并顺带把「已过期」标出来，
 * 让「预约时就已经越过的档位不会补发」这条策略一眼可见。
 */
function renderNotifyPlanPreview() {
    var host = document.getElementById('nr-plan-preview');
    if (!host || !notifyRuleEditing) return;
    var points = notifyRuleEditing.points || [];
    if (!points.length) { host.textContent = '还没有可试算的时间点。'; return; }

    var timeEl = document.getElementById('nr-preview-time');
    var lesson = timeEl ? notifyParseLocal(timeEl.value) : null;
    if (!lesson) { host.textContent = '请选择假设的上课时间。'; return; }

    var now = new Date();
    var items = points.map(function (p) {
        var minutes = notifyToMinutes(p.value, p.unit);
        if (isNaN(minutes) || minutes <= 0) {
            return { error: true, text: '提前量无效' };
        }
        var expect = new Date(lesson.getTime() - minutes * 60000);
        return { minutes: minutes, expect: expect, enabled: p.enabled !== 0 };
    });

    // 顺带把每行的提前量可读值回填到行内（输入「3 + 天」→ 行上显示「= 3 天」），
    // 否则整数字段与粒度下拉之间看不出一致性，改错粒度时不易察觉
    var rowEls = document.querySelectorAll('#nr-points .nr-point-row');
    for (var r = 0; r < rowEls.length; r++) {
        var slot = rowEls[r].querySelector('.nr-offset-text');
        if (!slot) continue;
        var rowItem = items[r];
        slot.textContent = (!rowItem || rowItem.error) ? '' : '= ' + formatNotifyMinutes(rowItem.minutes);
    }

    // 提前量重复检测（服务端也会拦，这里提前提示省一次往返）
    var seen = {};
    var duplicate = false;
    items.forEach(function (it) {
        if (it.error || !it.enabled) return;
        if (seen[it.minutes]) duplicate = true;
        seen[it.minutes] = true;
    });

    var rowsHtml = points.map(function (p, idx) {
        var it = items[idx];
        if (it.error) {
            return '<tr><td>' + (idx + 1) + '</td><td colspan="4" style="color:#c0392b;">提前量无效</td></tr>';
        }
        var state;
        var stateColor;
        if (!it.enabled) {
            state = '已停用';
            stateColor = '#8a94a6';
        } else if (lesson.getTime() <= now.getTime()) {
            state = '课次已过，不发送';
            stateColor = '#c0392b';
        } else if (it.expect.getTime() <= now.getTime()) {
            state = '已过期，不补发';
            stateColor = '#c0871b';
        } else {
            state = '待发送';
            stateColor = '#3a8a3a';
        }
        return '<tr>' +
            '<td>' + (idx + 1) + '</td>' +
            '<td>' + escapeNotifyHtml(formatNotifyMinutes(it.minutes)) + '</td>' +
            '<td>' + notifyFmtDateTime(it.expect) + '</td>' +
            '<td>' + escapeNotifyHtml(notifyAudienceTextOf(p.audience)) + '</td>' +
            '<td style="color:' + stateColor + ';">' + state + '</td>' +
            '</tr>';
    }).join('');

    host.innerHTML =
        '<table class="data-table" style="font-size:12px;"><thead><tr>' +
        '<th>序</th><th>提前量</th><th>应发时刻</th><th>接收人</th><th>状态</th>' +
        '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
        (duplicate
            ? '<div style="color:#c0392b;margin-top:6px;">存在两个提前量相同的时间点，保存会被拒绝，请调整。</div>'
            : '') +
        '<div style="color:#8a94a6;margin-top:6px;">「已过期」= 该档的应发时刻已经过去，不会再补发。' +
        '观察这里的日期能看出天级档位会落在星期几——若落在深夜或休息日，可把提前量调整为与上课钟点错开。</div>';
}

function notifyAudienceTextOf(code) {
    var list = (notifyRuleOptions && notifyRuleOptions.audiences) || [
        { code: 'BOTH', text: '学生 + 教师' }, { code: 'STUDENT', text: '仅学生' }, { code: 'TEACHER', text: '仅教师' }
    ];
    for (var i = 0; i < list.length; i++) {
        if (list[i].code === code) return list[i].text;
    }
    return code || '';
}

/** 收集表单值并做前端侧预校验（服务端仍会再校验一次，前端只为少一次往返） */
function collectNotifyRuleForm() {
    syncNotifyPointsFromDom();

    var courseId = '';
    if (notifyRuleEditing && notifyRuleEditing.scopeKind === 'course') {
        var courseEl = document.getElementById('nr-course');
        courseId = courseEl ? courseEl.value : '';
        // 允许空串：下拉第一项「缺省规则（对所有未单独配置的课程有效）」即租户默认规则；
        // 选具体课程则为其设置覆盖。两者都合法，无需强制必填。
    }

    var points = (notifyRuleEditing && notifyRuleEditing.points) || [];
    if (!points.length) {
        notifyNotifyRule('至少要配置一个通知时间点');
        return null;
    }
    var seen = {};
    var enabledCount = 0;
    var payloadPoints = [];
    for (var i = 0; i < points.length; i++) {
        var p = points[i];
        var minutes = notifyToMinutes(p.value, p.unit);
        if (p.value === '' || isNaN(minutes)) {
            notifyNotifyRule('第 ' + (i + 1) + ' 档的提前量没填或不是数字');
            return null;
        }
        if (minutes <= 0) {
            notifyNotifyRule('第 ' + (i + 1) + ' 档的提前量必须大于 0');
            return null;
        }
        if (minutes > 30 * 24 * 60) {
            notifyNotifyRule('第 ' + (i + 1) + ' 档的提前量不能超过 30 天');
            return null;
        }
        if (p.enabled !== 0) {
            if (seen[minutes]) {
                notifyNotifyRule('第 ' + (i + 1) + ' 档与前面的档位提前量相同（' + formatNotifyMinutes(minutes) + '），请调整');
                return null;
            }
            seen[minutes] = true;
            enabledCount++;
        }
        payloadPoints.push({
            stage: p.stage,
            offsetValue: Number(p.value),
            inputUnit: p.unit,
            audience: p.audience,
            enabled: p.enabled === 0 ? 0 : 1
        });
    }
    if (enabledCount === 0) {
        notifyNotifyRule('至少要启用一个时间点，否则这条规则不会发出任何通知');
        return null;
    }

    return {
        courseId: courseId,
        name: document.getElementById('nr-name').value,
        enabled: Number(document.getElementById('nr-enabled').value),
        remark: document.getElementById('nr-remark').value,
        points: payloadPoints
    };
}

async function submitNotifyRuleForm() {
    var payload = collectNotifyRuleForm();
    if (!payload) return;
    try {
        await request({ url: API_BASE_URL + '/notify-rule/save', method: 'post', data: payload });
        closeNotifyRuleEditor();
        await refreshNotifyRulePage();
        notifyNotifyRule('通知规则已保存');
    } catch (e) {
        console.error('submitNotifyRuleForm', e);
    }
}

/* -------------------------------------------------------------- 删除操作 */

/** 删除某课程覆盖（回落到租户默认规则） */
async function deleteCourseNotifyRule(courseId, courseName) {
    if (!courseId) return;
    if (!window.confirm('确定删除《' + courseName + '》的专属通知规则？\n删除后该课程将按租户默认规则发送上课提醒。')) return;
    try {
        await request({
            url: API_BASE_URL + '/notify-rule/delete',
            method: 'post',
            data: { courseId: courseId }
        });
        await refreshNotifyRulePage();
    } catch (e) {
        console.error('deleteCourseNotifyRule', e);
    }
}

/** 恢复系统内置时间点：删除租户默认规则行 */
async function resetTenantNotifyRule() {
    if (!window.confirm('确定恢复系统内置时间点？\n（提前 3 天 / 提前 1 天 / 课前 1 小时 / 课前 30 分钟）\n' +
        '注意：租户默认规则不能直接删除，此操作会把默认规则改为「停用」，届时按系统内置时间点执行。')) return;
    // 租户默认规则不允许删除（服务端会拒），改为保存一条「停用」的默认规则，
    // 语义等价于「本租户不再自定义，走系统内置时间点」。
    try {
        await request({
            url: API_BASE_URL + '/notify-rule/save',
            method: 'post',
            data: {
                courseId: '',
                name: '租户默认规则（已停用，按系统内置时间点执行）',
                enabled: 0,
                remark: '由「恢复系统默认」生成',
                points: builtinNotifyPoints().map(function (p) {
                    return {
                        stage: p.stage,
                        offsetValue: p.value,
                        inputUnit: p.unit,
                        audience: p.audience,
                        enabled: p.enabled
                    };
                })
            }
        });
        await refreshNotifyRulePage();
        notifyNotifyRule('已切换为系统内置时间点');
    } catch (e) {
        console.error('resetTenantNotifyRule', e);
    }
}

/* ---------------------------------------------------------- 注册页内刷新 */

if (typeof registerPageRefresh === 'function') {
    registerPageRefresh(NOTIFY_RULE_MENU_KEY, refreshNotifyRulePage);
}

window.renderNotifyRulePage = renderNotifyRulePage;
window.refreshNotifyRulePage = refreshNotifyRulePage;
window.openNotifyRuleEditor = openNotifyRuleEditor;
window.closeNotifyRuleEditor = closeNotifyRuleEditor;
window.addNotifyPoint = addNotifyPoint;
window.removeNotifyPoint = removeNotifyPoint;
window.onNotifyPointChanged = onNotifyPointChanged;
window.renderNotifyPlanPreview = renderNotifyPlanPreview;
window.submitNotifyRuleForm = submitNotifyRuleForm;
window.deleteCourseNotifyRule = deleteCourseNotifyRule;
window.resetTenantNotifyRule = resetTenantNotifyRule;
