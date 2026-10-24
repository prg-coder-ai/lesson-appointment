/* ============================================================================
 * platform-admin-dataMaintain.js —— 平台管理端「数据维护」（2026-10-24）
 *
 * 对照物：租户管理端 admin.html 的「数据维护」（js/admin-dataMaintainPage.js）。
 * 那个页面维护的是**租户内业务数据**（模板/课程/排期/预订/课次）；
 * 本页面维护的是**平台级对象**（租户 / 用户 / 租户套餐），两者不重叠。
 *
 * 三段数据的口径（与后端 PlatformDataMaintainController 严格对齐）：
 *   租户    软删标记 = sys_tenant.deleted = 1        → 回收站 = deleted=1
 *   用户    软删标记 = user.status = 'frozen'        → 回收站 = status=frozen
 *   套餐    sys_tenant_package **无状态列**，删除本来就是物理的 → 没有回收站
 *           （所以套餐 Tab 的「清空回收站」按钮置灰并写明原因，而不是假装能清空）
 *
 * 依赖：window.request（utility_request.js）、escapeHtml / maskPhone / tenantStatusText（api.js）、
 *       window.DatetimeDomain（shared-domain-bridge.js）
 *
 * ★ 本文件所有顶层标识符都包在 IIFE 内，只有 window.pdm* / window.renderPlatformDataMaintainPage
 *   对外暴露（内联 onclick 只能调全局）。同文件禁同名函数是项目铁律——
 *   tools/check-global-collide.mjs 会拦，但历史教训是"JS 静默覆盖、不报错"，所以命名一律加 pdm 前缀。
 * ========================================================================== */
(function () {
  'use strict';

  // 重复引入守卫（同 admin.html 上 pagefoot.js 的做法）
  if (window.__PDM_LOADED__) return;
  window.__PDM_LOADED__ = true;

  var STYLE_ID = 'pdm-style';

  var state = {
    tab: 'tenant',
    // 租户 Tab 的视图：live=在用（deleted=0） / trash=回收站（deleted=1）
    tenantView: 'live',
    tenant: { pageNum: 1, pageSize: 8, total: 0, totalPages: 0, keyword: '', status: '' },
    user: { pageNum: 1, pageSize: 10, total: 0, totalPages: 0, account: '', status: '', role: '' },
    pkg: { pageNum: 1, pageSize: 8, total: 0, totalPages: 0 },
    // 推广：三个子视图各自独立分页（推广码 / 转化记录 / 推广业绩）
    promo: {
      view: 'referral',
      referral: { pageNum: 1, pageSize: 10, total: 0, totalPages: 0, code: '', pathType: '', status: '' },
      conversion: { pageNum: 1, pageSize: 10, total: 0, totalPages: 0, stage: '', promoterUserId: '', tenantCode: '' },
      achievement: { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 }
    }
  };

  /** 租户 id → 机构名（用户/套餐 Tab 要显示"属于哪个租户"） */
  var tenantNameMap = {};
  var tenantNameLoaded = false;

  var ROLE_TEXT = {
    platform_admin: '平台管理员',
    admin: '管理员',
    teacher: '教师',
    student: '学生'
  };

  var USER_STATUS_TEXT = {
    active: '正常',
    frozen: '已删除(冻结)',
    pending: '待审核',
    inactive: '停用'
  };

  // ────────────────────────────────────────────────────────────────
  // 样式：pdm- 前缀，避免与 admin.css / 租户端 .dm-* 任何现有类冲突
  // ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = ''
      + '.pdm-tabs{display:flex;gap:12px;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #f0f0f0;}'
      + '.pdm-tab{padding:8px 20px;background:#fff;color:#555;border:1px solid #d9d9d9;border-radius:4px;'
      + 'cursor:pointer;font-size:14px;display:inline-flex;align-items:center;gap:6px;transition:all .2s;}'
      + '.pdm-tab:hover{border-color:#409eff;color:#409eff;background:#ecf5ff;}'
      + '.pdm-tab.active{background:#409eff;color:#fff;border-color:#409eff;}'
      + '.pdm-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 20px;border-bottom:1px solid #f0f0f0;}'
      + '.pdm-bar input,.pdm-bar select{padding:7px 10px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;box-sizing:border-box;}'
      + '.pdm-bar input{min-width:200px;}'
      + '.pdm-bar input:focus,.pdm-bar select:focus{outline:none;border-color:#409eff;}'
      + '.pdm-bar .pdm-right{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;}'
      + '.pdm-box{padding:0 20px;overflow-x:auto;}'
      + '.pdm-table{width:100%;border-collapse:collapse;font-size:13px;}'
      + '.pdm-table th{background:#fafafa;padding:11px 12px;text-align:left;border-bottom:2px solid #f0f0f0;'
      + 'font-weight:600;color:#333;white-space:nowrap;}'
      + '.pdm-table td{padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#555;vertical-align:middle;}'
      + '.pdm-table tr:hover{background:#fafafa;}'
      + '.pdm-table .pdm-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;line-height:18px;}'
      + '.pdm-tag-ok{background:#f0f9eb;color:#67c23a;}'
      + '.pdm-tag-dead{background:#fef0f0;color:#f56c6c;}'
      + '.pdm-tag-wait{background:#fdf6ec;color:#e6a23c;}'
      + '.pdm-empty{padding:36px 0;text-align:center;color:#999;font-size:14px;}'
      + '.pdm-err{padding:36px 0;text-align:center;color:#f56c6c;font-size:14px;}'
      + '.pdm-foot{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-top:1px solid #f0f0f0;}'
      + '.pdm-foot .pdm-info{color:#666;font-size:13px;}'
      + '.pdm-foot button{padding:6px 14px;border:1px solid #d9d9d9;background:#fff;border-radius:4px;'
      + 'cursor:pointer;font-size:13px;margin-left:8px;}'
      + '.pdm-foot button:disabled{opacity:.5;cursor:not-allowed;}'
      + '.pdm-note{padding:10px 20px;color:#909399;font-size:12px;line-height:1.7;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.appendChild(document.createTextNode(css));
    document.head.appendChild(el);
  }

  function $(id) { return document.getElementById(id); }

  /** request 在 code=200 时已把 data 解包，这里统一兜住不同形态 */
  function unwrap(res) {
    if (res === null || res === undefined) return null;
    if (typeof res === 'object' && res.code !== undefined && 'data' in res) {
      return res.data;
    }
    return res;
  }

  function fmtTime(v) {
    if (!v) return '-';
    try {
      if (window.DatetimeDomain && window.DatetimeDomain.formatDateTime) {
        return window.DatetimeDomain.formatDateTime(v);
      }
    } catch (e) { /* 落到下面 */ }
    return String(v).replace('T', ' ');
  }

  function tag(text, cls) {
    return '<span class="pdm-tag ' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function userStatusTag(s) {
    var cls = s === 'active' ? 'pdm-tag-ok' : (s === 'frozen' ? 'pdm-tag-dead' : 'pdm-tag-wait');
    return tag(USER_STATUS_TEXT[s] || s || '-', cls);
  }

  function tenantNameOf(id) {
    if (id === 0 || id === null || id === undefined) return '平台';
    return tenantNameMap[id] || ('租户#' + id);
  }

  /**
   * 「所属公司」文案：平台页已有 platformOrgText（platform-admin-user.js），
   * 能正确区分"平台自身"与各租户机构名。这里优先复用它，避免两处口径漂移；
   * 未加载时退回本地兜底。
   */
  function orgTextOf(u) {
    if (typeof window.platformOrgText === 'function') return window.platformOrgText(u);
    if (u && u.orgName) return u.orgName;
    return (u && u.role === 'platform_admin') ? '平台自身' : '-';
  }

  /** 角色文案同理复用 platformRoleText（平台管理员 / 租户管理员）。 */
  function roleTextOf(role) {
    if (typeof window.platformRoleText === 'function') return window.platformRoleText(role);
    return ROLE_TEXT[role] || role || '-';
  }

  // ────────────────────────────────────────────────────────────────
  // 页面骨架
  // ────────────────────────────────────────────────────────────────
  function renderPage() {
    var center = $('dynamic-content-center');
    if (!center) return;
    injectStyles();
    center.innerHTML = ''
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-title"><i class="fa fa-cogs"></i> 数据维护</div></div>'
      + '  <div class="pdm-tabs">'
      + '    <button class="pdm-tab active" id="pdm-tab-tenant" onclick="pdmSelectTab(\'tenant\')"><i class="fa fa-building"></i> 租户</button>'
      + '    <button class="pdm-tab" id="pdm-tab-user" onclick="pdmSelectTab(\'user\')"><i class="fa fa-users"></i> 用户</button>'
      + '    <button class="pdm-tab" id="pdm-tab-pkg" onclick="pdmSelectTab(\'pkg\')"><i class="fa fa-th-large"></i> 租户套餐</button>'
      + '    <button class="pdm-tab" id="pdm-tab-promo" onclick="pdmSelectTab(\'promo\')"><i class="fa fa-bullhorn"></i> 推广</button>'
      + '  </div>'
      + '  <div id="pdm-panel"></div>'
      + '</div>';
    renderPanel();
  }

  function renderPanel() {
    var panel = $('pdm-panel');
    if (!panel) return;
    ['tenant', 'user', 'pkg', 'promo'].forEach(function (t) {
      var b = $('pdm-tab-' + t);
      if (b) b.classList.toggle('active', t === state.tab);
    });
    if (state.tab === 'tenant') renderTenantPanel(panel);
    else if (state.tab === 'user') renderUserPanel(panel);
    else if (state.tab === 'pkg') renderPkgPanel(panel);
    else renderPromoPanel(panel);
  }

  // ────────────────────────────────────────────────────────────────
  // 租户 Tab
  // ────────────────────────────────────────────────────────────────
  function renderTenantPanel(panel) {
    var inTrash = state.tenantView === 'trash';
    panel.innerHTML = ''
      + '<div class="pdm-bar">'
      + '  <input id="pdm-tenant-kw" type="text" placeholder="机构名 / 租户编码 / 联系人" value="' + escapeHtml(state.tenant.keyword) + '"'
      + '         onkeydown="if(event.key===\'Enter\'){pdmSearch(\'tenant\')}"/>'
      + '  <select id="pdm-tenant-view" onchange="pdmChangeTenantView()">'
      + '    <option value="live"' + (inTrash ? '' : ' selected') + '>在用租户</option>'
      + '    <option value="trash"' + (inTrash ? ' selected' : '') + '>回收站（已删除）</option>'
      + '  </select>'
      + '  <button class="btn btn-primary btn-sm" onclick="pdmSearch(\'tenant\')"><i class="fa fa-search"></i> 查询</button>'
      + '  <button class="btn btn-default btn-sm" onclick="pdmReset(\'tenant\')"><i class="fa fa-redo"></i> 重置</button>'
      + '  <div class="pdm-right">'
      + '    <button class="btn btn-warning btn-sm" onclick="pdmPurge(\'tenant\')" ' + (inTrash ? '' : 'disabled title="请先切到回收站"') + '>'
      + '      <i class="fa fa-eraser"></i> 清空回收站</button>'
      + '    <button class="btn btn-danger btn-sm" onclick="pdmBatchDelete(\'tenant\')"><i class="fa fa-trash"></i> 删除选中</button>'
      + '    <button class="btn btn-default btn-sm" onclick="pdmLoad(\'tenant\')"><i class="fa fa-sync"></i> 刷新</button>'
      + '  </div>'
      + '</div>'
      + '<div class="pdm-box" id="pdm-tenant-box"><div class="pdm-empty">加载中…</div></div>'
      + '<div class="pdm-foot"><span class="pdm-info" id="pdm-tenant-info"></span>'
      + '  <span id="pdm-tenant-pager"></span></div>'
      + '<div class="pdm-note">「删除」= 软删除（移入回收站，可恢复）；「彻底删除」= 物理删除该租户及其课程/排期/预订/课次/账号/套餐，不可恢复。</div>';
    loadTenant();
  }

  function loadTenant() {
    var box = $('pdm-tenant-box');
    if (!box) return;
    box.innerHTML = '<div class="pdm-empty">加载中…</div>';
    var p = state.tenant;
    request({
      url: '/tenant/page',
      method: 'POST',
      data: {
        keyword: p.keyword || null,
        deleted: state.tenantView === 'trash' ? 1 : 0,
        pageNum: p.pageNum,
        pageSize: p.pageSize
      }
    }).then(function (res) {
      var page = unwrap(res) || {};
      p.total = page.total || 0;
      p.totalPages = page.totalPages || 0;
      renderTenantRows(page.rows || []);
      renderFooter('tenant');
    }).catch(function (e) {
      box.innerHTML = '<div class="pdm-err">加载失败：' + escapeHtml(errText(e)) + '</div>';
    });
  }

  function renderTenantRows(rows) {
    var box = $('pdm-tenant-box');
    if (!box) return;
    var inTrash = state.tenantView === 'trash';
    if (!rows.length) {
      box.innerHTML = '<div class="pdm-empty">' + (inTrash ? '回收站是空的' : '暂无数据') + '</div>';
      return;
    }
    var head = '<tr><th style="width:52px;">序号</th><th>机构名</th><th>租户编码</th><th>联系人</th><th>电话</th>'
      + '<th>状态</th><th>到期时间</th><th style="width:200px;">操作</th>'
      + '<th style="width:46px;text-align:center;"><input type="checkbox" onclick="pdmInvert(this,\'tenant\')" title="反转本页勾选"></th></tr>';
    var body = rows.map(function (t, i) {
      var obs = '';
      if (inTrash) {
        obs = '<button class="btn btn-default btn-sm" onclick="pdmRestoreTenant(' + t.id + ')">恢复</button> '
          + '<button class="btn btn-danger btn-sm" onclick="pdmPurgeOne(\'tenant\',' + t.id + ')">彻底删除</button>';
      } else {
        obs = '<button class="btn btn-danger btn-sm" onclick="pdmDeleteOne(\'tenant\',' + t.id + ')">删除</button>';
      }
      return '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td>' + escapeHtml(t.orgName || '') + '</td>'
        + '<td>' + escapeHtml(t.tenantCode || '') + '</td>'
        + '<td>' + escapeHtml(t.contact || '') + '</td>'
        + '<td>' + escapeHtml(maskPhone(t.phone || '')) + '</td>'
        + '<td>' + escapeHtml(tenantStatusText(t.status)) + '</td>'
        + '<td>' + escapeHtml(fmtTime(t.expireTime)) + '</td>'
        + '<td>' + obs + '</td>'
        + '<td style="text-align:center;"><input type="checkbox" class="pdm-check-tenant" value="' + t.id + '"></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table class="pdm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  // ────────────────────────────────────────────────────────────────
  // 用户 Tab
  // ────────────────────────────────────────────────────────────────
  function renderUserPanel(panel) {
    var p = state.user;
    var opts = [
      { v: '', t: '全部状态' },
      { v: 'active', t: '正常' },
      { v: 'frozen', t: '已删除(冻结)' },
      { v: 'pending', t: '待审核' },
      { v: 'inactive', t: '停用' }
    ].map(function (o) {
      return '<option value="' + o.v + '"' + (p.status === o.v ? ' selected' : '') + '>' + o.t + '</option>';
    }).join('');

    var roleOpts = [
      { v: '', t: '全部管理账号' },
      { v: 'admin', t: '租户管理员' },
      { v: 'platform_admin', t: '平台管理员' }
    ].map(function (o) {
      return '<option value="' + o.v + '"' + (p.role === o.v ? ' selected' : '') + '>' + o.t + '</option>';
    }).join('');

    panel.innerHTML = ''
      + '<div class="pdm-bar">'
      + '  <input id="pdm-user-kw" type="text" placeholder="账号 模糊搜索" value="' + escapeHtml(p.account) + '"'
      + '         onkeydown="if(event.key===\'Enter\'){pdmSearch(\'user\')}"/>'
      + '  <select id="pdm-user-role" onchange="pdmSearch(\'user\')">' + roleOpts + '</select>'
      + '  <select id="pdm-user-status" onchange="pdmSearch(\'user\')">' + opts + '</select>'
      + '  <button class="btn btn-primary btn-sm" onclick="pdmSearch(\'user\')"><i class="fa fa-search"></i> 查询</button>'
      + '  <button class="btn btn-default btn-sm" onclick="pdmReset(\'user\')"><i class="fa fa-redo"></i> 重置</button>'
      + '  <div class="pdm-right">'
      + '    <button class="btn btn-warning btn-sm" onclick="pdmPurge(\'user\')"><i class="fa fa-eraser"></i> 清空回收站</button>'
      + '    <button class="btn btn-danger btn-sm" onclick="pdmBatchDelete(\'user\')"><i class="fa fa-trash"></i> 删除选中</button>'
      + '    <button class="btn btn-default btn-sm" onclick="pdmLoad(\'user\')"><i class="fa fa-sync"></i> 刷新</button>'
      + '  </div>'
      + '</div>'
      + '<div class="pdm-box" id="pdm-user-box"><div class="pdm-empty">加载中…</div></div>'
      + '<div class="pdm-foot"><span class="pdm-info" id="pdm-user-info"></span>'
      + '  <span id="pdm-user-pager"></span></div>'
      + '<div class="pdm-note">本页<b>只维护管理账号</b>：各租户的管理员（admin）与平台管理员（platform_admin）。'
      + '教师、学生属于租户业务数据，由各租户管理员在租户端维护，平台端不提供其删除 / 清理入口'
      + '（「清空回收站」同样只作用于这两类角色，不会连带删掉教师的学生的冻结账号）。<br>'
      + '「删除」= 把状态置为 frozen（与教师管理的「禁用」同值，可恢复）；'
      + '「彻底删除」= 物理删除账号连同其刷新令牌与会话，不可恢复；审计日志刻意保留。</div>';
    loadUser();
  }

  function loadUser() {
    var box = $('pdm-user-box');
    if (!box) return;
    box.innerHTML = '<div class="pdm-empty">加载中…</div>';
    var p = state.user;
    // ★ 走 /user/platformPage 而不是 /user/page（2026-10-24 收口）：
    //   数据维护页只负责"管理账号"，教师与学生由租户管理员在租户端维护。
    //   platformPage 在服务端就只返回 admin / platform_admin 两类角色，并自带 orgName，
    //   前端不需要再拉 /tenant/list 做反查，也不会因为拉全量用户而误伤业务账号。
    var qs = new URLSearchParams();
    qs.set('pageNum', p.pageNum);
    qs.set('pageSize', p.pageSize);
    if (p.status) qs.set('status', p.status);
    if (p.account) qs.set('account', p.account);
    if (p.role) qs.set('role', p.role);
    request({ url: '/user/platformPage?' + qs.toString() })
      .then(function (res) {
        var page = unwrap(res) || {};
        p.total = page.total || 0;
        p.totalPages = page.totalPages || 0;
        renderUserRows(page.rows || []);
        renderFooter('user');
      })
      .catch(function (e) {
        box.innerHTML = '<div class="pdm-err">加载失败：' + escapeHtml(errText(e)) + '</div>';
      });
  }

  function renderUserRows(rows) {
    var box = $('pdm-user-box');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="pdm-empty">暂无数据</div>';
      return;
    }
    var head = '<tr><th style="width:52px;">序号</th><th>账号</th><th>姓名</th><th>角色</th>'
      + '<th>所属公司</th><th>状态</th><th style="width:220px;">操作</th>'
      + '<th style="width:46px;text-align:center;"><input type="checkbox" onclick="pdmInvert(this,\'user\')" title="反转本页勾选"></th></tr>';
    var body = rows.map(function (u, i) {
      var id = escapeHtml(u.userId || '');
      var obs;
      if (u.status === 'frozen') {
        obs = '<button class="btn btn-default btn-sm" onclick="pdmRestoreUser(\'' + id + '\')">恢复</button> '
          + '<button class="btn btn-danger btn-sm" onclick="pdmPurgeOne(\'user\',\'' + id + '\')">彻底删除</button>';
      } else {
        obs = '<button class="btn btn-danger btn-sm" onclick="pdmDeleteOne(\'user\',\'' + id + '\')">删除</button>';
      }
      return '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td>' + escapeHtml(u.account || '') + '</td>'
        + '<td>' + escapeHtml(u.name || '') + '</td>'
        + '<td>' + escapeHtml(roleTextOf(u.role)) + '</td>'
        + '<td>' + escapeHtml(orgTextOf(u)) + '</td>'
        + '<td>' + userStatusTag(u.status) + '</td>'
        + '<td>' + obs + '</td>'
        + '<td style="text-align:center;"><input type="checkbox" class="pdm-check-user" value="' + id + '"></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table class="pdm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  // ────────────────────────────────────────────────────────────────
  // 租户套餐 Tab
  // ────────────────────────────────────────────────────────────────
  function renderPkgPanel(panel) {
    panel.innerHTML = ''
      + '<div class="pdm-bar">'
      + '  <button class="btn btn-default btn-sm" onclick="pdmReset(\'pkg\')"><i class="fa fa-redo"></i> 重置</button>'
      + '  <div class="pdm-right">'
      + '    <button class="btn btn-warning btn-sm" disabled title="sys_tenant_package 无状态列，删除本来就是物理的，不存在回收站">'
      + '      <i class="fa fa-eraser"></i> 清空回收站（不适用）</button>'
      + '    <button class="btn btn-danger btn-sm" onclick="pdmBatchDelete(\'pkg\')"><i class="fa fa-trash"></i> 删除选中</button>'
      + '    <button class="btn btn-default btn-sm" onclick="pdmLoad(\'pkg\')"><i class="fa fa-sync"></i> 刷新</button>'
      + '  </div>'
      + '</div>'
      + '<div class="pdm-box" id="pdm-pkg-box"><div class="pdm-empty">加载中…</div></div>'
      + '<div class="pdm-foot"><span class="pdm-info" id="pdm-pkg-info"></span>'
      + '  <span id="pdm-pkg-pager"></span></div>'
      + '<div class="pdm-note">租户套餐表（sys_tenant_package）没有软删状态，删除即物理删除，因此没有回收站。'
      + '删除后该租户视为「不限额」，额度校验会跳过。</div>';
    loadPkg();
  }

  function loadPkg() {
    var box = $('pdm-pkg-box');
    if (!box) return;
    box.innerHTML = '<div class="pdm-empty">加载中…</div>';
    var p = state.pkg;
    Promise.all([
      request({ url: '/tenant/package/page', method: 'POST', data: { pageNum: p.pageNum, pageSize: p.pageSize } }),
      ensureTenantMap()
    ]).then(function (arr) {
      var page = unwrap(arr[0]) || {};
      p.total = page.total || 0;
      p.totalPages = page.totalPages || 0;
      renderPkgRows(page.rows || []);
      renderFooter('pkg');
    }).catch(function (e) {
      box.innerHTML = '<div class="pdm-err">加载失败：' + escapeHtml(errText(e)) + '</div>';
    });
  }

  function quotaCell(cur, limit) {
    if (limit === null || limit === undefined) return '-';
    return escapeHtml(String(limit)) + ' <span style="color:#999;">(已用 ' + escapeHtml(String(cur || 0)) + ')</span>';
  }

  function renderPkgRows(rows) {
    var box = $('pdm-pkg-box');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="pdm-empty">暂无数据</div>';
      return;
    }
    var head = '<tr><th style="width:52px;">序号</th><th>套餐ID</th><th>所属租户</th>'
      + '<th>课程额度</th><th>排期额度</th><th>用户总额度</th><th>教师额度</th><th>学生额度</th>'
      + '<th style="width:100px;">操作</th>'
      + '<th style="width:46px;text-align:center;"><input type="checkbox" onclick="pdmInvert(this,\'pkg\')" title="反转本页勾选"></th></tr>';
    var body = rows.map(function (k, i) {
      return '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td>' + escapeHtml(String(k.id)) + '</td>'
        + '<td>' + escapeHtml(tenantNameOf(k.tenantId)) + '</td>'
        + '<td>' + quotaCell(k.courseCurrent, k.courseLimit) + '</td>'
        + '<td>' + quotaCell(k.scheduleCurrent, k.scheduleLimit) + '</td>'
        + '<td>' + quotaCell(k.userCurrent, k.userTotalLimit) + '</td>'
        + '<td>' + quotaCell(k.teacherCurrent, k.teacherLimit) + '</td>'
        + '<td>' + quotaCell(k.studentCurrent, k.studentLimit) + '</td>'
        + '<td><button class="btn btn-danger btn-sm" onclick="pdmDeleteOne(\'pkg\',' + k.id + ')">删除</button></td>'
        + '<td style="text-align:center;"><input type="checkbox" class="pdm-check-pkg" value="' + k.id + '"></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table class="pdm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  // ────────────────────────────────────────────────────────────────
  // 推广 Tab（推广码 / 转化记录 / 推广业绩，2026-10-24）
  //
  // 三张表都没有"软删状态"，所以同样是「能删、没有回收站」——
  // 与租户套餐 Tab 的处理一致：清空按钮置灰并写明原因，不假装能做。
  // 三者删除语义不同，UI 上分别提示：
  //   referral   删码不动转化（转化是历史事实，code 只是字符串引用）
  //   conversion 删记录 + 同事务重算该推广者业绩（否则业绩虚高）
  //   achievement 删这一行 = 把该推广者业绩清零，下次点击/注册会重新建档
  // ────────────────────────────────────────────────────────────────
  var PROMO_VIEW_TEXT = { referral: '推广码', conversion: '转化记录', achievement: '推广业绩' };
  var STAGE_TEXT = { registered: '已注册', approved: '已通过', paid: '已付费' };
  var REWARD_TEXT = { pending: '待发放', paid: '已发放', none: '无奖励' };

  function pathTypeText(v) {
    if (v === 1) return '自助建租户';
    if (v === 2) return '加入租户';
    return '-';
  }

  function shortId(id) {
    if (!id) return '-';
    var s = String(id);
    return s.length > 10 ? (s.slice(0, 8) + '…') : s;
  }

  function renderPromoPanel(panel) {
    var view = state.promo.view;
    var sub = state.promo[view];
    var btn = ['referral', 'conversion', 'achievement'].map(function (v) {
      return '<button class="pdm-tab' + (v === view ? ' active' : '') + '" style="padding:6px 14px;font-size:13px;"'
        + ' onclick="pdmPromoView(\'' + v + '\')">' + PROMO_VIEW_TEXT[v] + '</button>';
    }).join('');

    // 每个子视图的筛选条各自不同（字段差异大），这里只拼共用外壳
    var filters = '';
    if (view === 'referral') {
      filters = ''
        + '<input id="pdm-promo-code" type="text" placeholder="推广码" value="' + escapeHtml(sub.code) + '"'
        + '       onkeydown="if(event.key===\'Enter\'){pdmSearch(\'promo\')}"/>'
        + '<select id="pdm-promo-pathtype" onchange="pdmSearch(\'promo\')">'
        + '  <option value="">全部类型</option>'
        + '  <option value="1"' + (String(sub.pathType) === '1' ? ' selected' : '') + '>自助建租户</option>'
        + '  <option value="2"' + (String(sub.pathType) === '2' ? ' selected' : '') + '>加入租户</option>'
        + '</select>'
        + '<select id="pdm-promo-status" onchange="pdmSearch(\'promo\')">'
        + '  <option value="">全部状态</option>'
        + '  <option value="active"' + (sub.status === 'active' ? ' selected' : '') + '>有效</option>'
        + '  <option value="disabled"' + (sub.status === 'disabled' ? ' selected' : '') + '>停用</option>'
        + '</select>';
    } else if (view === 'conversion') {
      filters = ''
        + '<input id="pdm-promo-promoter" type="text" placeholder="推广人 userId" value="' + escapeHtml(sub.promoterUserId) + '"'
        + '       onkeydown="if(event.key===\'Enter\'){pdmSearch(\'promo\')}"/>'
        + '<input id="pdm-promo-tenantcode" type="text" placeholder="租户编码（模糊）" value="' + escapeHtml(sub.tenantCode) + '"'
        + '       onkeydown="if(event.key===\'Enter\'){pdmSearch(\'promo\')}"/>'
        + '<select id="pdm-promo-stage" onchange="pdmSearch(\'promo\')">'
        + '  <option value="">全部阶段</option>'
        + '  <option value="registered"' + (sub.stage === 'registered' ? ' selected' : '') + '>已注册</option>'
        + '  <option value="approved"' + (sub.stage === 'approved' ? ' selected' : '') + '>已通过</option>'
        + '  <option value="paid"' + (sub.stage === 'paid' ? ' selected' : '') + '>已付费</option>'
        + '</select>';
    }

    panel.innerHTML = ''
      + '<div class="pdm-bar" style="padding-bottom:0;border-bottom:none;">' + btn + '</div>'
      + '<div class="pdm-bar">'
      + filters
      + (view === 'achievement' ? '' : '<button class="btn btn-primary btn-sm" onclick="pdmSearch(\'promo\')"><i class="fa fa-search"></i> 查询</button>')
      + '<button class="btn btn-default btn-sm" onclick="pdmReset(\'promo\')"><i class="fa fa-redo"></i> 重置</button>'
      + '<div class="pdm-right">'
      + '<button class="btn btn-warning btn-sm" disabled title="推广三张表都没有软删状态，删除即物理删除，不存在回收站"><i class="fa fa-eraser"></i> 清空回收站（不适用）</button>'
      + '<button class="btn btn-default btn-sm" onclick="pdmLoad(\'promo\')"><i class="fa fa-sync"></i> 刷新</button>'
      + '</div>'
      + '</div>'
      + '<div class="pdm-box" id="pdm-promo-box"><div class="pdm-empty">加载中…</div></div>'
      + '<div class="pdm-foot"><span class="pdm-info" id="pdm-promo-info"></span>'
      + '  <span id="pdm-promo-pager"></span></div>'
      + '<div class="pdm-note" id="pdm-promo-note"></div>';
    setPromoNote();
    loadPromo();
  }

  function setPromoNote() {
    var el = $('pdm-promo-note');
    if (!el) return;
    var view = state.promo.view;
    if (view === 'referral') {
      el.innerHTML = '推广码删除后<b>不影响已发生的转化记录</b>：转化表里存的是推广码字符串，不是外键，'
        + '已注册/已付费是历史事实，不该因为码被清理而消失。';
    } else if (view === 'conversion') {
      el.innerHTML = '删除转化记录会<b>同一事务内重算</b>该推广者的业绩（注册/通过/付费三个计数 + 最近转化时间）。'
        + '点击量、建租户数、微信注册数、奖励金额这四项没有可靠的重算来源，<b>刻意不回退</b>；'
        + '要恢复某个推广者的业绩，只能靠「推广业绩」里的重算/重置语义另行处理。';
    } else {
      el.innerHTML = '删除业绩行 = <b>把该推广者的业绩清零</b>（下一次点击或注册会被重新建档）。'
        + '这是一条聚合数据，删它不会动转化记录。';
    }
  }

  function loadPromo() {
    var box = $('pdm-promo-box');
    if (!box) return;
    box.innerHTML = '<div class="pdm-empty">加载中…</div>';
    var view = state.promo.view;
    var sub = state.promo[view];
    var qs = new URLSearchParams();
    qs.set('pageNum', sub.pageNum);
    qs.set('pageSize', sub.pageSize);
    var url;
    if (view === 'referral') {
      if (sub.code) qs.set('code', sub.code);
      if (sub.pathType) qs.set('pathType', sub.pathType);
      if (sub.status) qs.set('status', sub.status);
      url = '/promo/platform/referrals?' + qs.toString();
    } else if (view === 'conversion') {
      if (sub.stage) qs.set('stage', sub.stage);
      if (sub.promoterUserId) qs.set('promoterUserId', sub.promoterUserId);
      if (sub.tenantCode) qs.set('tenantCode', sub.tenantCode);
      url = '/promo/platform/conversions?' + qs.toString();
    } else {
      url = '/promo/achievement/overview?' + qs.toString();
    }
    // 推广码要显示"目标租户"机构名，需要租户映射（懒加载，只查一次）
    var p = (view === 'referral')
      ? Promise.all([request({ url: url }), ensureTenantMap()]).then(function (a) { return a[0]; })
      : request({ url: url });
    p.then(function (res) {
        var page = unwrap(res) || {};
        sub.total = page.total || 0;
        sub.totalPages = page.totalPages || 0;
        renderPromoRows(view, page.rows || []);
        renderFooter('promo');
      })
      .catch(function (e) {
        box.innerHTML = '<div class="pdm-err">加载失败：' + escapeHtml(errText(e)) + '</div>';
      });
  }

  function renderPromoRows(view, rows) {
    var box = $('pdm-promo-box');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="pdm-empty">暂无数据</div>';
      return;
    }
    if (view === 'referral') {
      var h1 = '<tr><th style="width:52px;">序号</th><th>推广码</th><th>推广人</th><th>类型</th>'
        + '<th>目标租户</th><th>状态</th><th>创建时间</th><th style="width:90px;">操作</th></tr>';
      var b1 = rows.map(function (r, i) {
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><code>' + escapeHtml(r.referralCode || '') + '</code></td>'
          + '<td title="' + escapeHtml(r.promoterUserId || '') + '">' + escapeHtml(shortId(r.promoterUserId)) + '</td>'
          + '<td>' + escapeHtml(pathTypeText(r.pathType)) + '</td>'
          + '<td>' + escapeHtml(r.targetTenantId ? tenantNameOf(r.targetTenantId) : '-') + '</td>'
          + '<td>' + escapeHtml(r.status || '-') + '</td>'
          + '<td>' + escapeHtml(fmtTime(r.createTime)) + '</td>'
          + '<td><button class="btn btn-danger btn-sm" onclick="pdmPromoDelete(\'referral\',' + r.id + ')">删除</button></td>'
          + '</tr>';
      }).join('');
      box.innerHTML = '<table class="pdm-table"><thead>' + h1 + '</thead><tbody>' + b1 + '</tbody></table>';
      return;
    }
    if (view === 'conversion') {
      var h2 = '<tr><th style="width:52px;">序号</th><th>推广码</th><th>推广人</th><th>被邀请人</th>'
        + '<th>类型</th><th>租户编码</th><th>阶段</th><th>注册时间</th><th>付费时间</th>'
        + '<th style="width:90px;">操作</th></tr>';
      var b2 = rows.map(function (r, i) {
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><code>' + escapeHtml(r.referralCode || '') + '</code></td>'
          + '<td title="' + escapeHtml(r.promoterUserId || '') + '">' + escapeHtml(shortId(r.promoterUserId)) + '</td>'
          + '<td title="' + escapeHtml(r.inviteeUserId || '') + '">' + escapeHtml(shortId(r.inviteeUserId)) + '</td>'
          + '<td>' + escapeHtml(pathTypeText(r.pathType)) + '</td>'
          + '<td>' + escapeHtml(r.tenantCode || '-') + '</td>'
          + '<td>' + tag(STAGE_TEXT[r.stage] || r.stage || '-',
              r.stage === 'paid' ? 'pdm-tag-ok' : (r.stage === 'approved' ? 'pdm-tag-wait' : '')) + '</td>'
          + '<td>' + escapeHtml(fmtTime(r.registeredAt)) + '</td>'
          + '<td>' + escapeHtml(fmtTime(r.paidAt)) + '</td>'
          + '<td><button class="btn btn-danger btn-sm" onclick="pdmPromoDelete(\'conversion\',' + r.id + ')">删除</button></td>'
          + '</tr>';
      }).join('');
      box.innerHTML = '<table class="pdm-table"><thead>' + h2 + '</thead><tbody>' + b2 + '</tbody></table>';
      return;
    }
    var h3 = '<tr><th style="width:52px;">序号</th><th>推广人</th><th>点击</th><th>注册</th><th>通过</th>'
      + '<th>付费</th><th>建租户</th><th>微信注册</th><th>奖励金额</th><th>最近转化</th>'
      + '<th style="width:110px;">操作</th></tr>';
    var b3 = rows.map(function (r, i) {
      return '<tr>'
        + '<td>' + (i + 1) + '</td>'
        + '<td title="' + escapeHtml(r.promoterUserId || '') + '">' + escapeHtml(shortId(r.promoterUserId)) + '</td>'
        + '<td>' + num(r.totalClicks) + '</td>'
        + '<td>' + num(r.totalRegistered) + '</td>'
        + '<td>' + num(r.totalApproved) + '</td>'
        + '<td>' + num(r.totalPaid) + '</td>'
        + '<td>' + num(r.totalTenantsCreated) + '</td>'
        + '<td>' + num(r.totalWxRegistered) + '</td>'
        + '<td>' + escapeHtml(String(r.totalRewardAmount == null ? 0 : r.totalRewardAmount)) + '</td>'
        + '<td>' + escapeHtml(fmtTime(r.lastConversionAt)) + '</td>'
        + '<td><button class="btn btn-danger btn-sm" onclick="pdmPromoDelete(\'achievement\',' + r.id + ')">清零</button></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table class="pdm-table"><thead>' + h3 + '</thead><tbody>' + b3 + '</tbody></table>';
  }

  function num(v) { return (v === null || v === undefined) ? '0' : String(v); }

  // ────────────────────────────────────────────────────────────────
  // 公共：分页条 / 错误文案 / 租户名映射
  // ────────────────────────────────────────────────────────────────
  function stateOf(tab) {
    if (tab === 'promo') return state.promo[state.promo.view];
    return tab === 'user' ? state.user : (tab === 'pkg' ? state.pkg : state.tenant);
  }

  function renderFooter(tab) {
    var p = stateOf(tab);
    var info = $('pdm-' + tab + '-info');
    var pager = $('pdm-' + tab + '-pager');
    if (info) info.textContent = '共 ' + p.total + ' 条，第 ' + p.pageNum + '/' + Math.max(1, p.totalPages) + ' 页';
    if (pager) {
      pager.innerHTML = '<button onclick="pdmGoto(\'' + tab + '\',' + (p.pageNum - 1) + ')"'
        + (p.pageNum <= 1 ? ' disabled' : '') + '>上一页</button>'
        + '<button onclick="pdmGoto(\'' + tab + '\',' + (p.pageNum + 1) + ')"'
        + (p.pageNum >= p.totalPages ? ' disabled' : '') + '>下一页</button>';
    }
  }

  function errText(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    return e.bodyMsg || e.message || '请求失败';
  }

  function ensureTenantMap() {
    if (tenantNameLoaded) return Promise.resolve(tenantNameMap);
    return request({ url: '/tenant/list', method: 'get' })
      .then(function (res) {
        var list = unwrap(res) || [];
        (list || []).forEach(function (t) {
          if (t && t.id !== undefined) tenantNameMap[t.id] = t.orgName || ('租户#' + t.id);
        });
        tenantNameLoaded = true;
        return tenantNameMap;
      })
      .catch(function () { return tenantNameMap; });
  }

  function reload(tab) {
    if (tab === 'user') loadUser();
    else if (tab === 'pkg') loadPkg();
    else if (tab === 'promo') loadPromo();
    else loadTenant();
  }

  // 勾选/反转（与租户端 invertAllMaintainRows 同语义：表头复选框按下即反转本页）
  function invertRows(master, tab) {
    var boxes = document.querySelectorAll('#pdm-' + tab + '-box .pdm-check-' + tab);
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = !boxes[i].checked;
    master.checked = false;
  }

  function checkedIds(tab) {
    var out = [];
    var boxes = document.querySelectorAll('#pdm-' + tab + '-box .pdm-check-' + tab + ':checked');
    for (var i = 0; i < boxes.length; i++) out.push(boxes[i].value);
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // 对外暴露（内联 onclick 只能调全局）
  // ────────────────────────────────────────────────────────────────
  window.renderPlatformDataMaintainPage = renderPage;

  window.pdmSelectTab = function (tab) {
    if (tab !== 'tenant' && tab !== 'user' && tab !== 'pkg' && tab !== 'promo') return;
    state.tab = tab;
    renderPanel();
  };

  /** 推广 Tab 内的子视图切换（推广码 / 转化记录 / 推广业绩） */
  window.pdmPromoView = function (view) {
    if (!state.promo[view] || view === 'view') return;
    state.promo.view = view;
    renderPromoPanel($('pdm-panel'));
  };

  /** 删除一条推广数据：type = referral / conversion / achievement */
  window.pdmPromoDelete = function (type, id) {
    var msg = {
      referral: '删除该推广码？\n已发生的转化记录不会受影响（转化表存的是推广码字符串，不是外键）。',
      conversion: '删除该转化记录？\n将同时按剩余转化重算该推广者的注册/通过/付费计数与最近转化时间。\n'
        + '点击量、建租户数、微信注册数、奖励金额不回退。此操作不可恢复。',
      achievement: '把该推广者的业绩清零？\n这只删聚合行，不动任何转化记录；他下次点击/注册会重新建档。'
    }[type];
    if (!msg) return;
    if (!confirm(msg)) return;
    request({
      url: '/data-maintain/platform/purge/promo?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id),
      method: 'POST'
    })
      .then(function () { loadPromo(); })
      .catch(function (e) { alert('删除失败：' + errText(e)); });
  };

  window.pdmChangeTenantView = function () {
    var el = $('pdm-tenant-view');
    state.tenantView = (el && el.value === 'trash') ? 'trash' : 'live';
    state.tenant.pageNum = 1;
    renderTenantPanel($('pdm-panel'));
  };

  window.pdmSearch = function (tab) {
    var p = stateOf(tab);
    p.pageNum = 1;
    if (tab === 'tenant') {
      p.keyword = (($('pdm-tenant-kw') || {}).value || '').trim();
    } else if (tab === 'user') {
      p.account = (($('pdm-user-kw') || {}).value || '').trim();
      p.status = ($('pdm-user-status') || {}).value || '';
      p.role = ($('pdm-user-role') || {}).value || '';
    } else if (tab === 'promo') {
      var view = state.promo.view;
      if (view === 'referral') {
        p.code = (($('pdm-promo-code') || {}).value || '').trim();
        p.pathType = ($('pdm-promo-pathtype') || {}).value || '';
        p.status = ($('pdm-promo-status') || {}).value || '';
      } else if (view === 'conversion') {
        p.promoterUserId = (($('pdm-promo-promoter') || {}).value || '').trim();
        p.tenantCode = (($('pdm-promo-tenantcode') || {}).value || '').trim();
        p.stage = ($('pdm-promo-stage') || {}).value || '';
      }
    }
    reload(tab);
  };

  window.pdmReset = function (tab) {
    var p = stateOf(tab);
    p.pageNum = 1;
    if (tab === 'tenant') {
      p.keyword = '';
      state.tenantView = 'live';
      renderTenantPanel($('pdm-panel'));
      return;
    }
    if (tab === 'user') {
      p.account = '';
      p.status = '';
      p.role = '';
      renderUserPanel($('pdm-panel'));
      return;
    }
    if (tab === 'promo') {
      var view = state.promo.view;
      if (view === 'referral') { p.code = ''; p.pathType = ''; p.status = ''; }
      else if (view === 'conversion') { p.promoterUserId = ''; p.tenantCode = ''; p.stage = ''; }
      renderPromoPanel($('pdm-panel'));
      return;
    }
    renderPkgPanel($('pdm-panel'));
  };

  window.pdmLoad = function (tab) { reload(tab); };

  window.pdmGoto = function (tab, n) {
    var p = stateOf(tab);
    if (n < 1) n = 1;
    if (p.totalPages && n > p.totalPages) n = p.totalPages;
    p.pageNum = n;
    reload(tab);
  };

  window.pdmInvert = invertRows;

  /** 单条「删除」：租户=软删、用户=置 frozen、套餐=物理删 */
  window.pdmDeleteOne = function (kind, id) {
    if (kind === 'tenant') {
      if (!confirm('将租户移入回收站？\n移入后该租户的账号会被冻结、在线会话被下线，可在「回收站」里恢复。')) return;
      request({ url: '/tenant/' + id, method: 'DELETE' })
        .then(function () { loadTenant(); })
        .catch(function (e) { alert('删除失败：' + errText(e)); });
      return;
    }
    if (kind === 'user') {
      if (!confirm('把该账号置为「已删除(冻结)」？\n冻结后不能登录，可在状态筛选中选中「已删除(冻结)」后恢复。')) return;
      request({ url: '/user/updateStatus', method: 'POST', data: { userId: id, status: 'frozen' } })
        .then(function () { loadUser(); })
        .catch(function (e) { alert('删除失败：' + errText(e)); });
      return;
    }
    if (!confirm('删除该租户套餐？\n删除后该租户视为「不限额」，此操作不可恢复。')) return;
    request({ url: '/tenant/package/' + id, method: 'DELETE' })
      .then(function () { loadPkg(); })
      .catch(function (e) { alert('删除失败：' + errText(e)); });
  };

  /** 单条「彻底删除」（只在回收站里给） */
  window.pdmPurgeOne = function (kind, id) {
    if (kind === 'tenant') {
      if (!confirm('彻底删除该租户？\n将物理删除该租户及其课程/排期/预订/课次/账号/套餐，操作不可恢复。')) return;
      request({ url: '/data-maintain/platform/purge/tenant?tenantId=' + encodeURIComponent(id), method: 'POST' })
        .then(function () { loadTenant(); })
        .catch(function (e) { alert('彻底删除失败：' + errText(e)); });
      return;
    }
    if (!confirm('彻底删除该账号？\n将物理删除账号及其刷新令牌与会话，操作不可恢复（审计日志保留）。')) return;
    request({ url: '/data-maintain/platform/purge/user?userId=' + encodeURIComponent(id), method: 'POST' })
      .then(function () { loadUser(); })
      .catch(function (e) { alert('彻底删除失败：' + errText(e)); });
  };

  /** 清空回收站 */
  window.pdmPurge = function (tab) {
    if (tab === 'tenant') {
      if (!confirm('清空租户回收站？\n将物理删除**所有**已删除的租户及其名下全部数据，操作不可恢复。\n（保留字租户 platform/default 不会被清掉）')) return;
      request({ url: '/data-maintain/platform/purge/tenant', method: 'POST' })
        .then(function (res) {
          var n = (typeof res === 'number') ? res : (unwrap(res) || 0);
          alert('清理完成，共影响 ' + n + ' 行');
          loadTenant();
        })
        .catch(function (e) { alert('清理失败：' + errText(e)); });
      return;
    }
    if (!confirm('清空用户回收站？\n将物理删除**所有**「已删除(冻结)」的管理账号（租户管理员 / 平台管理员）及其登录凭证，操作不可恢复。\n\n教师与学生的账号不在此范围内（由各租户管理员维护），不会被清掉。')) return;
    request({ url: '/data-maintain/platform/purge/user', method: 'POST' })
      .then(function (res) {
        var n = (typeof res === 'number') ? res : (unwrap(res) || 0);
        alert('清理完成，共影响 ' + n + ' 行');
        loadUser();
      })
      .catch(function (e) { alert('清理失败：' + errText(e)); });
  };

  /** 批量删除（复用单条删除，逐个串行，避免并发打爆后端事务） */
  window.pdmBatchDelete = function (tab) {
    var ids = checkedIds(tab);
    if (!ids.length) { alert('请先勾选要删除的行'); return; }
    var label = tab === 'tenant' ? '租户' : (tab === 'user' ? '管理账号' : '租户套餐');
    if (!confirm('确定删除选中的 ' + ids.length + ' 个' + label + '？\n（租户与账号是软删除，可在回收站恢复；套餐是物理删除，不可恢复）')) return;

    var seq = Promise.resolve();
    var failed = 0;
    ids.forEach(function (id) {
      seq = seq.then(function () {
        return deleteByKind(tab, id).catch(function () { failed++; });
      });
    });
    seq.then(function () {
      if (failed) alert('有 ' + failed + ' 条删除失败，请刷新后查看');
      reload(tab);
    });
  };

  function deleteByKind(tab, id) {
    if (tab === 'tenant') return request({ url: '/tenant/' + id, method: 'DELETE' });
    if (tab === 'user') return request({ url: '/user/updateStatus', method: 'POST', data: { userId: id, status: 'frozen' } });
    return request({ url: '/tenant/package/' + id, method: 'DELETE' });
  }

  /** 恢复（租户从回收站还原 / 账号解冻） */
  window.pdmRestoreTenant = function (id) {
    request({ url: '/tenant/' + id + '/restore', method: 'POST' })
      .then(function () { loadTenant(); })
      .catch(function (e) { alert('恢复失败：' + errText(e)); });
  };

  window.pdmRestoreUser = function (id) {
    request({ url: '/user/updateStatus', method: 'POST', data: { userId: id, status: 'active' } })
      .then(function () { loadUser(); })
      .catch(function (e) { alert('恢复失败：' + errText(e)); });
  };
})();
