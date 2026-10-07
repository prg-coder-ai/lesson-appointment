/* ============================================================================
 * admin-messageCategory.js —— 管理员「系统配置 → 消息分类管理」
 * 接口：/api/v1/message-categories/*   （见 CategoryController / CategoryService）
 *
 * 业务语义
 *   消息分类是「消息用词字典」：发送消息时只能从已存在的分类中选择（不可手输），
 *   因此分类由管理员在此统一维护。
 *   两级体系：level1=发起维度（如 教师/管理员消息），level2=业务场景（挂在一级之下）。
 *   平台预置(tenant=0)全租户可见；租户管理员只能增/改/删本租户私有分类；
 *   系统预置分类不可改、不可删（后端 isSystemPredefined 保护）。
 *
 *   tree 接口返回的是扁平列表（按 sort、level 排序，无 children 嵌套），
 *   前端据此渲染表格，并用 parentId 计算父子关系与缩进。
 * ========================================================================== */

/* 菜单 key，必须与 admin.html / platform_admin.html 中 menu-item 的 key 一致 */
var MSG_CAT_MENU_KEY = 'msg_category';

/* 端点常量：统一取共享事实源 shared/apiPaths.js（经桥接挂到 window.ApiPaths） */
var EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};

/* tree 返回的扁平分类列表（缓存，供弹窗构造父级下拉复用） */
var msgCatList = [];

/* 当前正在编辑的分类 id（null = 新增） */
var msgCatEditingId = null;

/* ------------------------------------------------------------ 小工具函数 */

function escMsgCat(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 统一提示：优先用页面提供的 showApiError，否则 alert */
function notifyMsgCat(msg) {
    if (typeof window.showApiError === 'function') window.showApiError(msg);
    else if (typeof window.alert === 'function') window.alert(msg);
}

function findMsgCat(id) {
    for (var i = 0; i < msgCatList.length; i++) {
        if (String(msgCatList[i].categoryId) === String(id)) return msgCatList[i];
    }
    return null;
}

/** 某分类是否含有子分类（其它分类的 parentId 指向它） */
function msgCatHasChild(id) {
    for (var i = 0; i < msgCatList.length; i++) {
        var p = msgCatList[i].parentId;
        if (p != null && p !== 0 && String(p) === String(id)) return true;
    }
    return false;
}

/* ------------------------------------------------------------ 数据访问层 */

async function loadMsgCategories() {
    try {
        // tree 返回扁平列表；路由经 dev 代理 /api/v1/message* → 8090(message-service)
        var list = await request({ url: EP.MSG_CATEGORIES, method: 'get' });
        msgCatList = Array.isArray(list) ? list : [];
    } catch (e) {
        msgCatList = [];
    }
    renderMsgCatTable();
}

/* -------------------------------------------------------------- 页面渲染 */

/** 菜单入口：loadAdminPageContent('msg_category') 调用 */
async function renderMessageCategoryPage() {
    var container = document.getElementById('dynamic-content-center');
    if (!container) return;

    container.innerHTML =
        '<div class="card">' +
        '  <div class="card-header">' +
        '    <div class="card-title"><i class="fa fa-tags"></i> 消息分类管理</div>' +
        '    <button class="btn btn-primary" onclick="openMsgCatEditor(null)">' +
        '      <i class="fa fa-plus"></i> 新增分类</button>' +
        '  </div>' +
        '  <div class="card-body">' +
        '    <div style="background:#f6f8fa;border:1px solid #e3e8ee;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:13px;line-height:1.9;color:#5a6472;">' +
        '      <b>用途：</b>发送消息时只能从下方已存在的分类中选择，不可手输。<br>' +
        '      <b>层级：</b>一级=发起维度（如 教师/管理员消息），二级=业务场景（挂在一级之下）。<br>' +
        '      <b>权限：</b>系统预置分类不可改、不可删；自定义分类由本租户维护（平台管理员可维护全局分类）。' +
        '    </div>' +
        '    <div id="msg-cat-table-body">正在加载…</div>' +
        '  </div>' +
        '</div>';

    if (typeof applyTerms === 'function') applyTerms(container);

    await loadMsgCategories();
}

/** 页内刷新：只重取数据，保留页面结构（顶部「刷新」按钮经 registerPageRefresh 调到这里） */
async function refreshMsgCatPage() {
    var container = document.getElementById('dynamic-content-center');
    // 容器已被替换（用户切走了菜单）→ 返回 false，交给通用逻辑整页重渲染
    if (!container || !document.getElementById('msg-cat-table-body')) return false;
    await loadMsgCategories();
    return true;
}

function renderMsgCatTable() {
    var host = document.getElementById('msg-cat-table-body');
    if (!host) return;

    if (!msgCatList.length) {
        host.innerHTML = '<div style="padding:20px;text-align:center;color:#8a94a6;">' +
            '暂无分类。点击右上角「新增分类」创建第一个。</div>';
        return;
    }

    var rows = msgCatList.map(function (n) {
        var level = n.categoryLevel || 1;
        var indent = 'padding-left:' + (8 + (level - 1) * 22) + 'px;';
        var sys = n.isSystemPredefined === 1;
        var hasChild = msgCatHasChild(n.categoryId);
        var typeTag = sys
            ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#eee;color:#888;font-size:12px;">系统预置</span>'
            : '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#e8f1ff;color:#1a6fd4;font-size:12px;">自定义</span>';
        var actions = '';
        if (!sys) {
            actions += '<button class="btn btn-default" onclick="openMsgCatEditor(\'' +
                escMsgCat(n.categoryId) + '\')"><i class="fa fa-edit"></i> 编辑</button> ';
            if (!hasChild) {
                actions += '<button class="btn btn-warning" onclick="deleteMsgCat(\'' +
                    escMsgCat(n.categoryId) + '\',\'' + escMsgCat(n.categoryName) + '\')">' +
                    '<i class="fa fa-trash"></i> 删除</button>';
            }
        }
        return '<tr>' +
            '<td style="' + indent + '">' + escMsgCat(n.categoryName) + '</td>' +
            '<td>' + escMsgCat(n.categoryCode || '') + '</td>' +
            '<td>' + level + '</td>' +
            '<td>' + typeTag + '</td>' +
            '<td style="color:#5a6472;font-size:12px;">' +
            (sys ? '不可改 / 不可删' : (hasChild ? '含子分类，删除前请先移除其子项' : '')) + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
    }).join('');

    host.innerHTML =
        '<div class="table-container"><table class="data-table"><thead><tr>' +
        '<th>分类名称</th><th>编码</th><th>层级</th><th>类型</th><th>说明</th><th>操作</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* -------------------------------------------------------------- 编辑弹窗 */

function closeMsgCatEditor() {
    var m = document.getElementById('msgCatModal');
    if (m && m.parentNode) m.parentNode.removeChild(m);
}

function openMsgCatEditor(id) {
    var existing = id ? findMsgCat(id) : null;
    var isEdit = !!existing;
    msgCatEditingId = id;

    // 父级下拉：仅一级分类可作父级；编辑时排除自身
    var parentOpts = '<option value="">（无上级，作为一级分类）</option>';
    parentOpts += msgCatList
        .filter(function (p) {
            return (p.categoryLevel === 1 || p.categoryLevel == null) &&
                String(p.categoryId) !== String(id);
        })
        .map(function (p) {
            var sel = (existing && String(existing.parentId) === String(p.categoryId)) ? ' selected' : '';
            return '<option value="' + escMsgCat(p.categoryId) + '"' + sel + '>' +
                escMsgCat(p.categoryName) + '</option>';
        }).join('');

    var nameVal = existing ? escMsgCat(existing.categoryName) : '';
    var codeVal = existing ? escMsgCat(existing.categoryCode || '') : '';
    var sortVal = (existing && existing.sort != null) ? existing.sort : '';
    // 后端 update 不处理 parentId（层级创建后不可改），故编辑时父级下拉禁用
    var parentDisabled = isEdit ? ' disabled' : '';

    var modalHtml =
        '<div class="modal-mask" id="msgCatModal" style="display:flex;">' +
        '  <div class="modal-content" style="max-width:560px;">' +
        '    <div class="modal-header">' +
        '      <h3 style="margin:0;font-size:16px;">' + (isEdit ? '编辑分类' : '新增分类') + '</h3>' +
        '      <span class="modal-close" onclick="closeMsgCatEditor()"><i class="fa fa-times"></i></span>' +
        '    </div>' +
        '    <div style="max-height:66vh;overflow:auto;padding:16px;">' +
        '      <div class="form-item"><label>分类名称 <span style="color:#c00;">*</span></label>' +
        '        <input type="text" id="msgcat-name" value="' + nameVal + '" placeholder="如：作业通知" ' +
        '          style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;"></div>' +
        '      <div class="form-item"><label>分类编码</label>' +
        (isEdit
            ? '        <input type="text" id="msgcat-code" value="' + codeVal + '" disabled ' +
              '          style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;background:#f6f8fa;">'
            : '        <input type="text" id="msgcat-code" value="' + codeVal + '" placeholder="留空则系统自动生成" ' +
              '          style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">') +
        '        <div style="font-size:12px;color:#8a94a6;margin-top:4px;">编码在租户内唯一；留空由系统生成（如 CAT_xxxx）。</div></div>' +
        '      <div class="form-item"><label>上级分类</label>' +
        '        <select id="msgcat-parent" ' + parentDisabled +
        '          style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;">' + parentOpts + '</select>' +
        (isEdit ? '        <div style="font-size:12px;color:#8a94a6;margin-top:4px;">层级创建后不可修改。</div>' : '') +
        '      </div>' +
        '      <div class="form-item"><label>排序（数字越小越靠前）</label>' +
        '        <input type="number" id="msgcat-sort" value="' + sortVal + '" ' +
        '          style="width:100%;padding:8px 12px;border:1px solid #e9ecef;border-radius:4px;"></div>' +
        '    </div>' +
        '    <div class="modal-footer" style="padding:12px 16px;text-align:right;border-top:1px solid #eee;">' +
        '      <button class="btn btn-default" onclick="closeMsgCatEditor()">取消</button> ' +
        '      <button class="btn btn-primary" onclick="saveMsgCat()">保存</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    closeMsgCatEditor();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function saveMsgCat() {
    var nameEl = document.getElementById('msgcat-name');
    var codeEl = document.getElementById('msgcat-code');
    var parentEl = document.getElementById('msgcat-parent');
    var sortEl = document.getElementById('msgcat-sort');
    if (!nameEl) return;

    var name = (nameEl.value || '').trim();
    if (!name) { notifyMsgCat('请填写分类名称'); return; }

    var code = (codeEl && !codeEl.disabled) ? (codeEl.value || '').trim() : '';
    var parentRaw = parentEl ? parentEl.value : '';
    var parentId = parentRaw ? Number(parentRaw) : null;
    var sortRaw = sortEl ? sortEl.value : '';
    var sort = sortRaw === '' ? 0 : Number(sortRaw);
    if (isNaN(sort)) sort = 0;

    var id = msgCatEditingId;
    // 新增：编码可选（留空自动生成）；编辑：不改编码（编辑框禁用，不发送 categoryCode）
    var body = { categoryName: name, sort: sort };
    if (!id) {
        if (code) body.categoryCode = code;
        if (parentId) body.parentId = parentId;   // 后端据 parentId 推 level
    }

    try {
        if (id) {
            body.categoryId = Number(id);
            await request({ url: EP.MSG_CATEGORY_BY_ID(id), method: 'put', data: body });
        } else {
            await request({ url: EP.MSG_CATEGORY_CREATE, method: 'post', data: body });
        }
        notifyMsgCat('保存成功');
        closeMsgCatEditor();
        await loadMsgCategories();
    } catch (e) {
        // request 拦截器已统一提示错误
    }
}

async function deleteMsgCat(id, name) {
    if (typeof window.confirm === 'function' &&
        !window.confirm('确定删除分类「' + (name || '') + '」？\n删除后该分类下的历史消息仍保留，但将不再出现在发送下拉中。')) {
        return;
    }
    try {
        await request({ url: EP.MSG_CATEGORY_BY_ID(id), method: 'delete' });
        notifyMsgCat('删除成功');
        await loadMsgCategories();
    } catch (e) {
        // request 拦截器已统一提示错误
    }
}

/* ---------------------------------------------------- 顶部刷新注册（铁律#1） */
if (typeof window.registerPageRefresh === 'function') {
    window.registerPageRefresh(MSG_CAT_MENU_KEY, refreshMsgCatPage);
}
