/* ============================================================================
 * admin-tenant.js —— 平台管理员「租户管理」
 * 依赖：window.request（utility_request.js）、escapeHtml（api.js）、applyTerms（termsFunction.js）
 * 接口：/tenant/*
 * ========================================================================== */
let tenantPage = { pageNum: 1, pageSize: 8, total: 0, totalPages: 0 };

/* ---------- 行业字典（id -> name 映射，用于租户列表/编辑显示行业名称） ---------- */
let industryNameMap = {};
function loadIndustryMap() {
  return request({ url: '/industry/list', method: 'get' }).then(list => {
    industryNameMap = {};
    (list || []).forEach(it => { if (it && it.id) industryNameMap[it.id] = it.name; });
    return industryNameMap;
  }).catch(() => { industryNameMap = {}; });
}
function industryName(id) {
  if (!id) return '-';
  return industryNameMap[id] || ('行业#' + id);
}

function renderTenantCards() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-building"></i> 租户管理</div>
        <button class="btn btn-primary" onclick="openTenantModal(null)"><i class="fa fa-plus"></i> 新增租户</button>
      </div>
      <div class="filter-bar">
        <div class="filter-item"><input type="text" id="tenant-kw" placeholder="机构名/编码/联系人"></div>
        <div class="filter-item"><select id="tenant-status">
          <option value="">全部状态</option>
          <option value="1">正常</option>
          <option value="2">停用</option>
          <option value="3">退租</option>
        </select></div>
        <button class="btn" onclick="searchTenant()"><i class="fa fa-search"></i> 搜索</button>
        <button class="btn btn-default" onclick="resetTenantSearch()">重置</button>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr>
            <th>序号</th><th>机构名称</th><th>编码</th><th>联系人</th><th>电话</th><th>行业</th><th>状态</th><th>到期时间</th><th>操作</th>
          </tr></thead>
          <tbody id="tenant-body"></tbody>
        </table>
      </div>
      <div id="tenant-pagebar"></div>
    </div>`;
  if (window.applyTerms) applyTerms(c);
  // 先加载行业字典，再渲染列表（保证行业名称可解析）
   loadIndustryMap().then(() => loadTenantList());

}

function loadTenantList() {
  const kw = (document.getElementById('tenant-kw') || {}).value || '';
  const st = (document.getElementById('tenant-status') || {}).value || null;
  request({
    url: '/tenant/page', method: 'POST',
    data: { keyword: kw, status: st, deleted: 0, pageNum: tenantPage.pageNum, pageSize: tenantPage.pageSize }
  }).then(page => {
    if (page) {
      tenantPage.total = page.total || 0;
      tenantPage.totalPages = page.totalPages || 0;
      renderTenantRows(page.rows || []);
    } else {
      renderTenantRows([]);
    }
    renderTenantPagebar();
  }).catch(() => { renderTenantRows([]); renderTenantPagebar(); });
}

function tenantStatusText(s) {
  return s === 1 ? '正常' : s === 2 ? '停用' : s === 3 ? '退租' : ('' + (s == null ? '' : s));
}

function renderTenantRows(rows) {
  const tb = document.getElementById('tenant-body');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">暂无数据</td></tr>';
    return;
  }
  tb.innerHTML = rows.map((t, i) => {
    const e = JSON.stringify(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(t.orgName || '')}</td>
      <td>${escapeHtml(t.tenantCode || '')}</td>
      <td>${escapeHtml(t.contact || '')}</td>
      <td>${escapeHtml(t.phone || '')}</td>
      <td>${industryName(t.industryId)}</td>
      <td>${tenantStatusText(t.status)}</td>
      <td>${t.expireTime ? ('' + t.expireTime).replace('T', ' ') : '-'}</td>
      <td>
        <button class="btn btn-default" onclick="openTenantModal(${e})">编辑</button>
        <button class="btn btn-warning" onclick="toggleTenantStatus(${t.id},${t.status})">${t.status === 1 ? '停用' : '启用'}</button>
        <button class="btn btn-default" onclick="renewTenant(${t.id})">续期</button>
        <button class="btn btn-default" onclick="assignTenantPackage(${t.id})">分配套餐</button>
        <button class="btn btn-danger" onclick="deleteTenant(${t.id})">删除</button>
      </td>
    </tr>`;
  }).join('');
}

function renderTenantPagebar() {
  const el = document.getElementById('tenant-pagebar');
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${tenantPage.total} 条，第 ${tenantPage.pageNum}/${Math.max(1, tenantPage.totalPages)} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${tenantPage.pageNum <= 1 ? 'disabled' : ''} onclick="tenantGoto(${tenantPage.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${tenantPage.pageNum >= tenantPage.totalPages ? 'disabled' : ''} onclick="tenantGoto(${tenantPage.pageNum + 1})">下一页</button>
    </span>`;
}
function tenantGoto(n) {
  if (n < 1) n = 1;
  if (n > tenantPage.totalPages) n = tenantPage.totalPages;
  tenantPage.pageNum = n;
  loadTenantList();
}
function searchTenant() { tenantPage.pageNum = 1; loadTenantList(); }
function resetTenantSearch() {
  if (document.getElementById('tenant-kw')) document.getElementById('tenant-kw').value = '';
  if (document.getElementById('tenant-status')) document.getElementById('tenant-status').value = '';
  tenantPage.pageNum = 1; loadTenantList();
}

/* ---------- 模态框（独立 id，避免与 admin.html 既有 modal 冲突） ---------- */
function openTenantModal(obj) {
  let modal = document.getElementById('tenantModal');
  if (!modal) modal = createTenantModal();
  modal.style.display = 'flex';
  const isEdit = obj && obj.id;
  document.getElementById('tenantModalTitle').innerText = isEdit ? '编辑租户' : '新增租户';
  const fc = document.getElementById('tenantFormContainer');
  fc.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">加载中…</div>';
  // 行业字典就绪后再渲染表单（下拉需行业列表）
  loadIndustryMap().then(() => buildTenantForm(obj));
}

function buildTenantForm(obj) {
  const isEdit = obj && obj.id;
  const fc = document.getElementById('tenantFormContainer');
  const exp = (isEdit && obj.expireTime) ? ('' + obj.expireTime).replace(' ', 'T').substring(0, 16) : '';
  const industryOptions = Object.keys(industryNameMap).map(k =>
    `<option value="${k}" ${isEdit && Number(obj.industryId) === Number(k) ? 'selected' : ''}>${escapeHtml(industryNameMap[k])}</option>`
  ).join('');
  fc.innerHTML = `
    <form id="tenantForm" class="form-item">
      <input type="hidden" name="id" value="${isEdit ? obj.id : ''}">
      <div class="form-line"><label>机构名称</label><input name="orgName" value="${isEdit ? escapeHtml(obj.orgName || '') : ''}" required></div>
      <div class="form-line"><label>租户编码</label><input name="tenantCode" value="${isEdit ? escapeHtml(obj.tenantCode || '') : ''}" ${isEdit ? 'readonly' : ''} placeholder="如 org001"></div>
      <div class="form-line"><label>所属行业</label><select name="industryId">
        <option value="">--未指定--</option>${industryOptions}
      </select></div>
      <div class="form-line"><label>联系人</label><input name="contact" value="${isEdit ? escapeHtml(obj.contact || '') : ''}"></div>
      <div class="form-line"><label>联系电话</label><input name="phone" value="${isEdit ? escapeHtml(obj.phone || '') : ''}"></div>
      <div class="form-line"><label>状态</label><select name="status">
        <option value="1" ${isEdit && obj.status === 1 ? 'selected' : ''}>正常</option>
        <option value="2" ${isEdit && obj.status === 2 ? 'selected' : ''}>停用</option>
        <option value="3" ${isEdit && obj.status === 3 ? 'selected' : ''}>退租</option>
      </select></div>
      <div class="form-line"><label>到期时间</label><input type="datetime-local" name="expireTime" value="${exp}"></div>
      <div class="form-line"><label>备注</label><textarea name="remark">${isEdit ? escapeHtml(obj.remark || '') : ''}</textarea></div>
      <div class="form-error" id="tenantFormErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitTenant()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closeTenantModal()">取消</button>
      </div>
    </form>`;
}
function createTenantModal() {
  const m = document.createElement('div');
  m.className = 'modal-mask'; m.id = 'tenantModal'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-content">
      <div class="modal-header"><div id="tenantModalTitle" style="font-weight:600;font-size:16px;"></div>
        <span class="modal-close" id="tenantCloseBtn">&times;</span></div>
      <div id="tenantFormContainer"></div></div>`;
  document.body.appendChild(m);
  // 只允许通过「取消」「保存」按钮或右上角 × 关闭；点遮罩不关闭，避免误触丢失已填内容。
  document.getElementById('tenantCloseBtn').addEventListener('click', closeTenantModal);
  return m;
}
function closeTenantModal() { const m = document.getElementById('tenantModal'); if (m) m.style.display = 'none'; }

async function submitTenant() {
  const f = document.getElementById('tenantForm');
  const id = f.id.value ? Number(f.id.value) : null;
  const expire = f.expireTime.value ? f.expireTime.value + ':00' : null;//.replace('T', ' ') api error when: 2024-08-30T12:00 -> 2024-08-30 12:00
  const data = {
    orgName: f.orgName.value.trim(),
    tenantCode: f.tenantCode.value.trim(),
    contact: f.contact.value.trim(),
    phone: f.phone.value.trim(),
    industryId: f.industryId.value ? Number(f.industryId.value) : null,
    status: Number(f.status.value),
    expireTime: expire,
    remark: f.remark.value
  };
  if (!data.orgName) { document.getElementById('tenantFormErr').innerText = '机构名称必填'; return; }
  if (id) data.id = id;
   let ret= await request({ url: id ? '/tenant/update' : '/tenant/insert', method: 'POST', data })
    .then(() => { closeTenantModal(); loadTenantList(); })
    .catch(() => {});
}
function toggleTenantStatus(id, cur) {
  const next = cur === 1 ? 2 : 1;
  if (!confirm('确认' + (next === 1 ? '启用' : '停用') + '该租户？')) return;
  request({ url: `/tenant/${id}/status`, method: 'POST', params: { status: next } })
    .then(() => loadTenantList()).catch(() => {});
}
function renewTenant(id) {
  const m = prompt('续期月数：', '6');
  if (m === null) return;
  const months = Number(m);
  if (!months || months <= 0) { alert('请输入有效月数'); return; }
  request({ url: `/tenant/${id}/renew`, method: 'POST', params: { months } })
    .then(() => loadTenantList()).catch(() => {});
}
function assignTenantPackage(id) {
  request({ url: '/package/template/list-enabled', method: 'get' }).then(list => {
    const arr = list || [];
    if (!arr.length) { alert('暂无可用套餐模板'); return; }
    const tid = prompt('选择套餐模板 ID：\n' + arr.map(t => t.id + ' : ' + (t.templateName || '')).join('\n'));
    if (tid === null) return;
    request({ url: `/tenant/${id}/package`, method: 'POST', params: { templateId: Number(tid) } })
      .then(() => loadTenantList()).catch(() => {});
  }).catch(() => {});
}
function deleteTenant(id) {
  if (!confirm('确认删除该租户？')) return;
  request({ url: `/tenant/${id}`, method: 'DELETE' })
    .then(() => loadTenantList()).catch(() => {});
}
