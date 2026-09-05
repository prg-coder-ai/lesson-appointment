/* ============================================================================
 * platform-admin-user.js —— 平台管理员「用户管理」
 * 依赖：window.request（utility_request.js）、escapeHtml/escapeAttr（api.js）
 * 接口：GET  /user/platformPage（仅平台管理员，跨租户分页，返回含 orgName）
 *       POST /user/add              新增用户（admin 需带 tenantCode；platform_admin 归属平台）
 *       POST /user/updateInfo       编辑姓名/电话/邮箱/状态
 *       POST /user/updateCompany    编辑公司名称（admin→所属租户 org_name；platform_admin→平台行）
 *       POST /user/updateStatus     冻结/启用（active ↔ frozen）
 *       POST /user/account/changePassword  重置密码
 * 保护：当前登录的平台管理员自身（currentUser.userId）不可被冻结/删除，防止锁死登录账号。
 * ========================================================================== */
let platformUserPage = { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 };

/* 当前登录者 userId（自我保护用） */
function __platformSelfUserId() {
  try {
    const u = localStorage.getItem('currentUser');
    return u ? (JSON.parse(u).userId || '') : '';
  } catch (_) { return ''; }
}
const __selfId = __platformSelfUserId();

function platformRoleText(role) {
  if (role === 'platform_admin') return '平台管理员';
  if (role === 'admin') return '租户管理员';
  return role || '';
}
function platformStatusText(s) {
  if (s === 'active') return '正常';
  if (s === 'frozen') return '已冻结';
  if (s === 'pending') return '待审核';
  if (s === 'inactive') return '停用';
  return s || '未知';
}
/* 公司名称回退：platform_admin(tenant_id=0) 后端 orgName 取平台行；前端兜底显示「平台自身」 */
function platformOrgText(u) {
  return (u && u.orgName) ? u.orgName : '平台自身';
}

function renderPlatformUserPage() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-users-cog"></i> 用户管理</div>
        <button class="btn btn-primary" onclick="openPlatformAddUser()"><i class="fa fa-plus"></i> 新增用户</button>
      </div>
      <div class="filter-bar">
        <div class="filter-item"><input type="text" id="pu-account" placeholder="账号"></div>
        <div class="filter-item"><input type="text" id="pu-name" placeholder="姓名"></div>
        <div class="filter-item">
          <select id="pu-role">
            <option value="">全部角色</option>
            <option value="platform_admin">平台管理员</option>
            <option value="admin">租户管理员</option>
          </select>
        </div>
        <div class="filter-item">
          <select id="pu-status">
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="frozen">已冻结</option>
            <option value="pending">待审核</option>
            <option value="inactive">停用</option>
          </select>
        </div>
        <button class="btn" onclick="searchPlatformUsers()"><i class="fa fa-search"></i> 搜索</button>
        <button class="btn btn-default" onclick="resetPlatformUserSearch()">重置</button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr>
            <th>序号</th><th>公司名称</th><th>角色</th><th>账号</th><th>姓名</th><th>电话</th><th>邮箱</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody id="pu-body"></tbody>
        </table>
      </div>
      <div id="pu-pagebar"></div>
    </div>`;
  if (window.applyTerms) applyTerms(c);
  loadPlatformUserList();
}

/* ---------- 列表 ---------- */
function loadPlatformUserList() {
  const params = new URLSearchParams({
    pageNum: platformUserPage.pageNum,
    pageSize: platformUserPage.pageSize,
    account: (document.getElementById('pu-account') || {}).value ? document.getElementById('pu-account').value.trim() : '',
    name: (document.getElementById('pu-name') || {}).value ? document.getElementById('pu-name').value.trim() : '',
    role: (document.getElementById('pu-role') || {}).value || '',
    status: (document.getElementById('pu-status') || {}).value || ''
  });
  request({ url: `/user/platformPage?${params.toString()}` })
    .then(page => {
      if (page) {
        platformUserPage.total = page.total || 0;
        platformUserPage.totalPages = page.totalPages || 0;
        renderPlatformUserRows(page.rows || []);
      } else {
        renderPlatformUserRows([]);
      }
      renderPlatformUserPagebar();
    })
    .catch(() => { renderPlatformUserRows([]); renderPlatformUserPagebar(); });
}
function renderPlatformUserRows(rows) {
  const tb = document.getElementById('pu-body');
  if (!rows || !rows.length) {
    refreshPlatformCache([]);
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#999;">暂无数据</td></tr>';
    return;
  }
  refreshPlatformCache(rows);
  let idx = (platformUserPage.pageNum - 1) * platformUserPage.pageSize;
  tb.innerHTML = rows.map(u => {
    idx++;
    const isSelf = u.userId && u.userId === __selfId;
    const isFrozen = u.status === 'frozen';
    return `<tr>
      <td>${idx}</td>
      <td>${escapeHtml(platformOrgText(u))}</td>
      <td>${platformRoleText(u.role)}</td>
      <td>${escapeHtml(u.account || '')}</td>
      <td>${escapeHtml(u.name || '')}</td>
      <td>${escapeHtml(u.phone || '')}</td>
      <td>${escapeHtml(u.email || '')}</td>
      <td>${platformStatusText(u.status)}</td>
      <td>
        <button class="btn btn-default" onclick="openPlatformEditUser('${u.userId}')">编辑</button>
        <button class="btn btn-warning" onclick="openPlatformResetPwd('${u.userId}')">重置密码</button>
        ${isSelf
          ? '<span style="color:#aaa;font-size:12px;" title="不能冻结/删除当前登录账号">(当前登录)</span>'
          : (isFrozen
              ? `<button class="btn btn-success" onclick="togglePlatformUser('${u.userId}','active')">启用</button>`
              : `<button class="btn btn-warning" onclick="togglePlatformUser('${u.userId}','frozen')">冻结</button>`)}
      </td>
    </tr>`;
  }).join('');
}
function renderPlatformUserPagebar() {
  const el = document.getElementById('pu-pagebar');
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${platformUserPage.total} 条，第 ${platformUserPage.pageNum}/${Math.max(1, platformUserPage.totalPages)} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${platformUserPage.pageNum <= 1 ? 'disabled' : ''} onclick="platformUserGoto(${platformUserPage.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${platformUserPage.pageNum >= platformUserPage.totalPages ? 'disabled' : ''} onclick="platformUserGoto(${platformUserPage.pageNum + 1})">下一页</button>
    </span>`;
}
function platformUserGoto(n) {
  if (n < 1) n = 1;
  if (n > platformUserPage.totalPages) n = platformUserPage.totalPages;
  platformUserPage.pageNum = n;
  loadPlatformUserList();
}
function searchPlatformUsers() { platformUserPage.pageNum = 1; loadPlatformUserList(); }
function resetPlatformUserSearch() {
  ['pu-account', 'pu-name', 'pu-role', 'pu-status'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  platformUserPage.pageNum = 1;
  loadPlatformUserList();
}

/* ---------- 行缓存（编辑回填需原始解密值，不能从脱敏 DOM 读） ---------- */
let platformUserRowCache = new Map();
function refreshPlatformCache(rows) {
  platformUserRowCache.clear();
  (rows || []).forEach(u => { if (u && u.userId) platformUserRowCache.set(String(u.userId), u); });
}

/* ---------- 新增用户 ---------- */
let __puTenantOptions = null; // 租户下拉缓存
function loadTenantOptions(force) {
  if (__puTenantOptions && !force) return Promise.resolve(__puTenantOptions);
  return request({ url: '/tenant/list', method: 'get' })
    .then(list => { __puTenantOptions = list || []; return __puTenantOptions; })
    .catch(() => { __puTenantOptions = []; return __puTenantOptions; });
}
function openPlatformAddUser() {
  let modal = document.getElementById('platformUserModal');
  if (!modal) modal = createPlatformUserModal();
  modal.style.display = 'flex';
  document.getElementById('platformUserModalTitle').innerText = '新增用户';
  const fc = document.getElementById('platformUserModalForm');
  // 默认平台管理员（无需选租户）
  fc.innerHTML = `
    <form id="platformUserForm" class="form-item">
      <div class="form-line"><label>角色</label>
        <select id="puAddRole" onchange="puAddRoleChanged()">
          <option value="platform_admin">平台管理员</option>
          <option value="admin">租户管理员</option>
        </select></div>
      <div class="form-line" id="puAddTenantLine" style="display:none;"><label>所属租户</label>
        <select id="puAddTenant" onchange="puAddTenantChanged()"><option value="">加载中…</option></select></div>
      <div class="form-line"><label>公司名称</label><input id="puAddCompany" readonly style="background:#f5f5f5;"
        title="公司名称继承自所选租户/平台，新增后如需修改请用「编辑」（会同步到该租户/平台行）"></div>
      <div class="form-line"><label>账号</label><input id="puAddAccount" placeholder="登录账号（全局唯一）" required></div>
      <div class="form-line"><label>姓名</label><input id="puAddName" placeholder="用户姓名"></div>
      <div class="form-line"><label>手机号</label><input id="puAddPhone" placeholder="手机号（与邮箱至少填一项）"></div>
      <div class="form-line"><label>电子邮箱</label><input id="puAddEmail" placeholder="电子邮箱（与手机号至少填一项）"></div>
      <div class="form-line"><label>初始密码</label><input id="puAddPwd" value="123456"></div>
      <div class="form-tip">初始密码默认 123456。租户管理员需先选择所属租户。</div>
      <div class="form-error" id="puAddErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitPlatformAddUser()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closePlatformUserModal()">取消</button>
      </div>
    </form>`;
  // 加载租户下拉
  loadTenantOptions(false).then(() => fillTenantSelect());
  puAddRoleChanged();
}
function fillTenantSelect() {
  const sel = document.getElementById('puAddTenant');
  if (!sel) return;
  const arr = __puTenantOptions || [];
  sel.innerHTML = '<option value="">-- 选择租户 --</option>' +
    arr.map(t => `<option value="${escapeAttr(t.tenantCode)}" data-org="${escapeAttr(t.orgName || '')}">${escapeHtml(t.orgName || t.tenantCode)}（${escapeHtml(t.tenantCode)}）</option>`).join('');
}
function puAddRoleChanged() {
  const role = document.getElementById('puAddRole').value;
  const tenantLine = document.getElementById('puAddTenantLine');
  const company = document.getElementById('puAddCompany');
  if (role === 'admin') {
    tenantLine.style.display = '';
    company.value = '';
  } else {
    tenantLine.style.display = 'none';
    company.value = '平台自身';
  }
}
/* 选择租户后自动带出该公司名到「公司名称」，允许再改 */
function puAddTenantChanged() {
  const sel = document.getElementById('puAddTenant');
  const company = document.getElementById('puAddCompany');
  const opt = sel && sel.selectedOptions ? sel.selectedOptions[0] : null;
  if (opt && opt.dataset && opt.dataset.org) {
    company.value = opt.dataset.org;
  }
}
function submitPlatformAddUser() {
  const role = document.getElementById('puAddRole').value;
  const account = (document.getElementById('puAddAccount').value || '').trim();
  const name = (document.getElementById('puAddName').value || '').trim();
  const phone = (document.getElementById('puAddPhone').value || '').trim();
  const email = (document.getElementById('puAddEmail').value || '').trim();
  const password = (document.getElementById('puAddPwd').value || '').trim() || '123456';
  const company = (document.getElementById('puAddCompany').value || '').trim();
  const err = document.getElementById('puAddErr');
  if (!account) { err.innerText = '账号不能为空'; return; }
  if (!phone && !email) { err.innerText = '手机号和电子邮箱至少填写一项'; return; }
  let tenantCode = null;
  if (role === 'admin') {
    tenantCode = document.getElementById('puAddTenant').value;
    if (!tenantCode) { err.innerText = '请为租户管理员选择所属租户'; return; }
  } else {
    tenantCode = 'platform';
  }
  const data = { role: role, account: account, name: name, phone: phone, email: email, password: password, tenantCode: tenantCode };
  request({ url: '/user/add', method: 'POST', data: data })
    .then(() => {
      closePlatformUserModal();
      loadPlatformUserList();
      alert('添加成功，初始密码为 ' + password);
    })
    .catch(() => {});
}

/* ---------- 模态框骨架（点遮罩不关闭，仅取消/保存/× 关闭） ---------- */
function createPlatformUserModal() {
  const m = document.createElement('div');
  m.className = 'modal-mask'; m.id = 'platformUserModal'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-content">
      <div class="modal-header"><div id="platformUserModalTitle" style="font-weight:600;font-size:16px;"></div>
        <span class="modal-close" id="platformUserCloseBtn">&times;</span></div>
      <div id="platformUserModalForm"></div></div>`;
  document.body.appendChild(m);
  document.getElementById('platformUserCloseBtn').addEventListener('click', closePlatformUserModal);
  return m;
}
function closePlatformUserModal() {
  const m = document.getElementById('platformUserModal');
  if (m) m.style.display = 'none';
}

/* ---------- 编辑用户（含公司名称） ---------- */
function openPlatformEditUser(userId) {
  const user = platformUserRowCache.get(String(userId));
  if (!user) { alert('未找到该用户的数据，请刷新列表后重试'); return; }
  let modal = document.getElementById('platformUserModal');
  if (!modal) modal = createPlatformUserModal();
  modal.style.display = 'flex';
  document.getElementById('platformUserModalTitle').innerText = '编辑用户';
  const fc = document.getElementById('platformUserModalForm');
  fc.innerHTML = `
    <form id="platformUserForm" class="form-item">
      <input type="hidden" id="puEditUserId" value="${escapeAttr(user.userId)}">
      <div class="form-line"><label>角色</label><input value="${platformRoleText(user.role)}" readonly></div>
      <div class="form-line"><label>公司名称</label>
        <input id="puEditCompany" value="${escapeAttr(platformOrgText(user))}"
          title="改动会同步到 ${user.role === 'platform_admin' ? '平台自身行' : '该用户所属租户'}，影响 ${user.role === 'platform_admin' ? '平台公司信息' : '该租户全体用户与租户管理展示'}"></div>
      <div class="form-line"><label>账号</label><input value="${escapeAttr(user.account)}" readonly title="账号为登录标识，不可修改"></div>
      <div class="form-line"><label>姓名</label><input id="puEditName" value="${escapeAttr(user.name)}"></div>
      <div class="form-line"><label>手机号</label><input id="puEditPhone" value="${escapeAttr(user.phone)}"></div>
      <div class="form-line"><label>电子邮箱</label><input id="puEditEmail" value="${escapeAttr(user.email)}"></div>
      <div class="form-line"><label>状态</label><select id="puEditStatus">
        <option value="active" ${user.status === 'active' ? 'selected' : ''}>正常</option>
        <option value="frozen" ${user.status === 'frozen' ? 'selected' : ''}>已冻结</option>
        <option value="pending" ${user.status === 'pending' ? 'selected' : ''}>待审核</option>
        <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>停用</option>
      </select></div>
      <div class="form-tip">账号不可修改；公司名称改动会同步到所属${user.role === 'platform_admin' ? '平台' : '租户'}。</div>
      <div class="form-error" id="puEditErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitPlatformEditUser()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closePlatformUserModal()">取消</button>
      </div>
    </form>`;
}
function submitPlatformEditUser() {
  const userId = (document.getElementById('puEditUserId').value || '').trim();
  const company = (document.getElementById('puEditCompany').value || '').trim();
  const name = (document.getElementById('puEditName').value || '').trim();
  const phone = (document.getElementById('puEditPhone').value || '').trim();
  const email = (document.getElementById('puEditEmail').value || '').trim();
  const status = document.getElementById('puEditStatus').value;
  const err = document.getElementById('puEditErr');
  if (!userId) { err.innerText = '用户Id缺失，请刷新后重试'; return; }
  if (!phone && !email) { err.innerText = '手机号和电子邮箱至少填写一项'; return; }
  // 基本信息
  request({ url: '/user/updateInfo', method: 'POST', data: { userId: userId, name: name, phone: phone, email: email, status: status } })
    .then(() => {
      // 公司名称（若改动，写回平台行 / 租户行）
      const compReq = (company && company !== '平台自身')
        ? request({ url: '/user/updateCompany', method: 'POST', data: { userId: userId, orgName: company } }).catch(() => {})
        : Promise.resolve();
      return compReq;
    })
    .then(() => { closePlatformUserModal(); loadPlatformUserList(); alert('保存成功'); })
    .catch(() => {});
}

/* ---------- 冻结/启用 ---------- */
function togglePlatformUser(userId, toStatus) {
  const act = toStatus === 'active' ? '启用' : '冻结';
  if (userId === __selfId) { alert('不能冻结/删除当前登录的账号'); return; }
  if (!confirm('确认' + act + '该用户？')) return;
  request({ url: '/user/updateStatus', method: 'POST', data: { userId: userId, status: toStatus } })
    .then(() => loadPlatformUserList())
    .catch(() => {});
}

/* ---------- 重置密码 ---------- */
function openPlatformResetPwd(userId) {
  const val = prompt('请输入新密码（留空则重置为默认 123456）：', '123456');
  if (val === null) return;
  const pwd = val.trim() || '123456';
  if (!confirm('确认将密码重置为「' + pwd + '」？')) return;
  request({ url: `/user/account/changePassword?userId=${encodeURIComponent(userId)}&password=${encodeURIComponent(pwd)}`, method: 'POST' })
    .then(() => { alert('密码已重置'); loadPlatformUserList(); })
    .catch(() => {});
}

/* 导出到 window（供内联 onclick 引用） */
window.renderPlatformUserPage = renderPlatformUserPage;

