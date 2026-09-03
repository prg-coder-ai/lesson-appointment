/* ============================================================================
 * admin-package.js —— 平台管理员「套餐管理」
 * 子区：套餐模板(/package/template/*) + 租户套餐(/tenant/package/*)
 * ========================================================================== */
let pkgTplPage = { pageNum: 1, pageSize: 8, total: 0, totalPages: 0 };
let tenantPkgPage = { pageNum: 1, pageSize: 8, total: 0, totalPages: 0 };
let pkgTab = 'template';


//添加租户名称查询
let tenantNameMap = {};
function loadTenantNameMap() {
  return request({ url: '/tenant/list', method: 'get' }).then(list => {
    tenantNameMap = {};
    (list || []).forEach(it => { if (it && it.id) tenantNameMap[it.id] = it.tenantCode + ' ' + it.orgName; });
    console.log('tenantNameMap loaded:', tenantNameMap);
    return tenantNameMap;
  }).catch(() => { tenantNameMap = {}; });
}
function tenantName(id) {
  if (!id) return '-';
  return tenantNameMap[id] || ('租户#' + id);
}


function renderPackageCards() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-th-large"></i> 套餐管理</div>
      </div>
      <div class="filter-bar">
        <button class="btn ${pkgTab === 'template' ? 'btn-primary' : 'btn-default'}" onclick="switchPkgTab('template')">套餐模板</button>
        <button class="btn ${pkgTab === 'tenant' ? 'btn-primary' : 'btn-default'}" onclick="switchPkgTab('tenant')">租户套餐</button>
        <button class="btn btn-primary" style="margin-left:auto;" onclick="openPkgTplModal(null)">新增模板</button>
      </div>
      <div id="pkg-body-area"></div>
    </div>`;
  if (window.applyTerms) applyTerms(c);

     loadTenantNameMap().then(() => renderPkgTab()); 
}
function switchPkgTab(t) { pkgTab = t; renderPackageCards(); }
function renderPkgTab() {
  const area = document.getElementById('pkg-body-area');
  if (pkgTab === 'template') renderPkgTplTable(area); else renderTenantPkgTable(area);
}

/* ---------------- 套餐模板 ---------------- */
function renderPkgTplTable(area) {
  area.innerHTML = `
    <div class="table-container">
      <table class="data-table"><thead><tr>
        <th>序号</th><th>模板名称</th><th>编码</th><th>课程上限</th><th>排期上限</th><th>用户上限</th><th>教师上限</th><th>学生上限</th><th>状态</th><th>操作</th>
      </tr></thead><tbody id="pkgtpl-body"></tbody></table>
    </div><div id="pkgtpl-pagebar"></div>`;
  loadPkgTplList();
}
function loadPkgTplList() {
  request({ url: '/package/template/page', method: 'POST', data: { pageNum: pkgTplPage.pageNum, pageSize: pkgTplPage.pageSize } })
    .then(page => {
      if (page) { pkgTplPage.total = page.total || 0; pkgTplPage.totalPages = page.totalPages || 0; renderPkgTplRows(page.rows || []); }
      else renderPkgTplRows([]);
      renderPkgTplPagebar();
    }).catch(() => { renderPkgTplRows([]); renderPkgTplPagebar(); });
}
function renderPkgTplRows(rows) {
  const tb = document.getElementById('pkgtpl-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;">暂无数据</td></tr>'; return; }
  tb.innerHTML = rows.map((t, i) => {
    const e = JSON.stringify(t).replace(/'/g, "\\'");
    return `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(t.templateName || '')}</td>
      <td>${escapeHtml(t.templateCode || '')}</td>
      <td>${t.courseLimit || 0}</td><td>${t.scheduleLimit || 0}</td>
      <td>${t.userTotalLimit || 0}</td><td>${t.teacherLimit || 0}</td><td>${t.studentLimit || 0}</td>
      <td>${t.status === 1 ? '启用' : '停用'}</td>
      <td>
        <button class="btn btn-default" onclick="openPkgTplModal(${e})">编辑</button>
        <button class="btn btn-warning" onclick="togglePkgTpl(${t.id},${t.status})">${t.status === 1 ? '停用' : '启用'}</button>
        <button class="btn btn-danger" onclick="deletePkgTpl(${t.id})">删除</button>
      </td></tr>`;
  }).join('');
}
function renderPkgTplPagebar() {
  const el = document.getElementById('pkgtpl-pagebar');
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${pkgTplPage.total} 条，第 ${pkgTplPage.pageNum}/${Math.max(1, pkgTplPage.totalPages)} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${pkgTplPage.pageNum <= 1 ? 'disabled' : ''} onclick="pkgTplGoto(${pkgTplPage.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${pkgTplPage.pageNum >= pkgTplPage.totalPages ? 'disabled' : ''} onclick="pkgTplGoto(${pkgTplPage.pageNum + 1})">下一页</button>
    </span>`;
}
function pkgTplGoto(n) { if (n < 1) n = 1; if (n > pkgTplPage.totalPages) n = pkgTplPage.totalPages; pkgTplPage.pageNum = n; loadPkgTplList(); }

function openPkgTplModal(obj) {
  let modal = document.getElementById('pkgTplModal');
  if (!modal) modal = createPkgTplModal();
  modal.style.display = 'flex';
  const isEdit = obj && obj.id;
  document.getElementById('pkgTplModalTitle').innerText = isEdit ? '编辑套餐模板' : '新增套餐模板';
  const fc = document.getElementById('pkgTplFormContainer');
  fc.innerHTML = `
    <form id="pkgTplForm" class="form-item">
      <input type="hidden" name="id" value="${isEdit ? obj.id : ''}">
      <div class="form-line"><label>模板名称</label><input name="templateName" value="${isEdit ? escapeHtml(obj.templateName || '') : ''}" required></div>
      <div class="form-line"><label>模板编码</label><input name="templateCode" value="${isEdit ? escapeHtml(obj.templateCode || '') : ''}" ${isEdit ? 'readonly' : ''} placeholder="如 base"></div>
      <div class="form-line"><label>课程上限(0不限)</label><input type="number" name="courseLimit" value="${isEdit ? (obj.courseLimit || 0) : 0}"></div>
      <div class="form-line"><label>排期上限(0不限)</label><input type="number" name="scheduleLimit" value="${isEdit ? (obj.scheduleLimit || 0) : 0}"></div>
      <div class="form-line"><label>用户上限(0不限)</label><input type="number" name="userTotalLimit" value="${isEdit ? (obj.userTotalLimit || 0) : 0}"></div>
      <div class="form-line"><label>教师上限(0不限)</label><input type="number" name="teacherLimit" value="${isEdit ? (obj.teacherLimit || 0) : 0}"></div>
      <div class="form-line"><label>学生上限(0不限)</label><input type="number" name="studentLimit" value="${isEdit ? (obj.studentLimit || 0) : 0}"></div>
      <div class="form-line"><label>状态</label><select name="status">
        <option value="1" ${isEdit && obj.status === 1 ? 'selected' : ''}>启用</option>
        <option value="2" ${isEdit && obj.status === 2 ? 'selected' : ''}>停用</option>
      </select></div>
      <div class="form-line"><label>备注</label><textarea name="remark">${isEdit ? escapeHtml(obj.remark || '') : ''}</textarea></div>
      <div class="form-error" id="pkgTplFormErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitPkgTpl()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closePkgTplModal()">取消</button>
      </div>
    </form>`;
}
function createPkgTplModal() {
  const m = document.createElement('div');
  m.className = 'modal-mask'; m.id = 'pkgTplModal'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-content">
      <div class="modal-header"><div id="pkgTplModalTitle" style="font-weight:600;font-size:16px;"></div>
        <span class="modal-close" id="pkgTplCloseBtn">&times;</span></div>
      <div id="pkgTplFormContainer"></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target.id === 'pkgTplModal') closePkgTplModal(); });
  document.getElementById('pkgTplCloseBtn').addEventListener('click', closePkgTplModal);
  return m;
}
function closePkgTplModal() { const m = document.getElementById('pkgTplModal'); if (m) m.style.display = 'none'; }
function submitPkgTpl() {
  const f = document.getElementById('pkgTplForm');
  const id = f.id.value ? Number(f.id.value) : null;
  const data = {
    templateName: f.templateName.value.trim(),
    templateCode: f.templateCode.value.trim(),
    courseLimit: Number(f.courseLimit.value || 0),
    scheduleLimit: Number(f.scheduleLimit.value || 0),
    userTotalLimit: Number(f.userTotalLimit.value || 0),
    teacherLimit: Number(f.teacherLimit.value || 0),
    studentLimit: Number(f.studentLimit.value || 0),
    status: Number(f.status.value),
    remark: f.remark.value
  };
  if (!data.templateName) { document.getElementById('pkgTplFormErr').innerText = '模板名称必填'; return; }
  if (id) data.id = id;
  request({ url: id ? '/package/template/update' : '/package/template/insert', method: 'POST', data })
    .then(() => { closePkgTplModal(); loadPkgTplList(); }).catch(() => {});
}
function togglePkgTpl(id, cur) {
  const next = cur === 1 ? 2 : 1;
  if (!confirm('确认' + (next === 1 ? '启用' : '停用') + '该套餐模板？')) return;
  request({ url: '/package/template/update', method: 'POST', data: { id: id, status: next } })
    .then(() => loadPkgTplList()).catch(() => {});
}
function deletePkgTpl(id) {
  if (!confirm('确认删除该套餐模板？')) return;
  request({ url: `/package/template/${id}`, method: 'DELETE' })
    .then(() => loadPkgTplList()).catch(() => {});
}

/* ---------------- 租户套餐 --及余量-------------- */
function renderTenantPkgTable(area) {
  area.innerHTML = `
    <div class="table-container">
      <table class="data-table"><thead><tr>
        <th>序号</th><th>租户</th><th>课程(用/限)</th><th>排期(用/限)</th><th>用户(用/限)</th><th>教师(用/限)</th><th>学生(用/限)</th><th>操作</th>
      </tr></thead><tbody id="tpkg-body"></tbody></table>
    </div><div id="tpkg-pagebar"></div>
    <div style="margin-top:12px;">
      <button class="btn btn-primary" onclick="createTenantPkgFromTemplate()">从模板为租户创建套餐</button>
    </div>`;
  loadTenantPkgList();
}
function loadTenantPkgList() {
  request({ url: '/tenant/package/page', method: 'POST', data: { pageNum: tenantPkgPage.pageNum, pageSize: tenantPkgPage.pageSize } })
    .then(page => {
      if (page) { tenantPkgPage.total = page.total || 0; tenantPkgPage.totalPages = page.totalPages || 0; renderTenantPkgRows(page.rows || []); }
      else renderTenantPkgRows([]);
      renderTenantPkgPagebar();
    }).catch(() => { renderTenantPkgRows([]); renderTenantPkgPagebar(); });
}

function renderTenantPkgRows(rows) {
  const tb = document.getElementById('tpkg-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">暂无数据</td></tr>'; return; }
  const noLimited = (v) => v === 0 ? '无上限' : v;
  tb.innerHTML = rows.map((t, i) => {
    const e = JSON.stringify(t).replace(/'/g, "\\'");
    //把tenantId 查询出tenantName
     const tName = tenantName(t.tenantId); 
    return `<tr>
      <td>${i + 1}</td>
      <td>${tName}</td>
      <td>${(t.courseCurrent || 0)}/${noLimited(t.courseLimit || 0)}</td>
      <td>${(t.scheduleCurrent || 0)}/${noLimited(t.scheduleLimit || 0)}</td>
      <td>${(t.userCurrent || 0)}/${noLimited(t.userTotalLimit || 0)}</td>
      <td>${(t.teacherCurrent || 0)}/${noLimited(t.teacherLimit || 0)}</td>
      <td>${(t.studentCurrent || 0)}/${noLimited(t.studentLimit || 0)}</td>
      <td>
        <button class="btn btn-default" onclick="openTenantPkgModal(${e})">编辑</button>
        <button class="btn btn-danger" onclick="deleteTenantPkg(${t.id})">删除</button>
      </td></tr>`;
  }).join('');
}
function renderTenantPkgPagebar() {
  const el = document.getElementById('tpkg-pagebar');
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${tenantPkgPage.total} 条，第 ${tenantPkgPage.pageNum}/${Math.max(1, tenantPkgPage.totalPages)} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${tenantPkgPage.pageNum <= 1 ? 'disabled' : ''} onclick="tenantPkgGoto(${tenantPkgPage.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${tenantPkgPage.pageNum >= tenantPkgPage.totalPages ? 'disabled' : ''} onclick="tenantPkgGoto(${tenantPkgPage.pageNum + 1})">下一页</button>
    </span>`;
}
function tenantPkgGoto(n) { if (n < 1) n = 1; if (n > tenantPkgPage.totalPages) n = tenantPkgPage.totalPages; tenantPkgPage.pageNum = n; loadTenantPkgList(); }
function openTenantPkgModal(obj) {
  const isEdit = obj && obj.id;
  const data = isEdit ? JSON.parse(JSON.stringify(obj)) : {};
  const form = `
    <form id="tpkgForm" class="form-item">
      <input type="hidden" name="id" value="${isEdit ? obj.id : ''}">
      <input type="hidden" name="tenantId" value="${isEdit ? obj.tenantId : ''}">
      <div class="form-line"><label>租户ID</label><input value="${isEdit ? obj.tenantId : ''}" disabled></div>
      <div class="form-line"><label>课程限额</label><input type="number" name="courseLimit" value="${isEdit ? (obj.courseLimit || 0) : 0}"></div>
      <div class="form-line"><label>排期限额</label><input type="number" name="scheduleLimit" value="${isEdit ? (obj.scheduleLimit || 0) : 0}"></div>
      <div class="form-line"><label>用户限额</label><input type="number" name="userTotalLimit" value="${isEdit ? (obj.userTotalLimit || 0) : 0}"></div>
      <div class="form-line"><label>教师限额</label><input type="number" name="teacherLimit" value="${isEdit ? (obj.teacherLimit || 0) : 0}"></div>
      <div class="form-line"><label>学生限额</label><input type="number" name="studentLimit" value="${isEdit ? (obj.studentLimit || 0) : 0}"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitTenantPkg()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closeTenantPkgModal()">取消</button>
      </div>
    </form>`;
  let modal = document.getElementById('tpkgModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-mask'; modal.id = 'tpkgModal'; modal.style.display = 'none';
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><div id="tpkgModalTitle" style="font-weight:600;font-size:16px;"></div><span class="modal-close" id="tpkgCloseBtn">&times;</span></div><div id="tpkgFormContainer"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target.id === 'tpkgModal') closeTenantPkgModal(); });
    document.getElementById('tpkgCloseBtn').addEventListener('click', closeTenantPkgModal);
  }
  modal.style.display = 'flex';
  document.getElementById('tpkgModalTitle').innerText = isEdit ? '编辑租户套餐' : '新增租户套餐';
  document.getElementById('tpkgFormContainer').innerHTML = form;
}
function closeTenantPkgModal() { const m = document.getElementById('tpkgModal'); if (m) m.style.display = 'none'; }
function submitTenantPkg() {
  const f = document.getElementById('tpkgForm');
  const id = f.id.value ? Number(f.id.value) : null;
  const data = {
    tenantId: Number(f.tenantId.value),
    courseLimit: Number(f.courseLimit.value || 0),
    scheduleLimit: Number(f.scheduleLimit.value || 0),
    userTotalLimit: Number(f.userTotalLimit.value || 0),
    teacherLimit: Number(f.teacherLimit.value || 0),
    studentLimit: Number(f.studentLimit.value || 0)
  };
  if (id) data.id = id;
  request({ url: id ? '/tenant/package/update' : '/tenant/package/insert', method: 'POST', data })
    .then(() => { closeTenantPkgModal(); loadTenantPkgList(); }).catch(() => {});
}
function createTenantPkgFromTemplate() {
  const tenantId = prompt('目标租户 ID：');
  if (tenantId === null) return;
  request({ url: '/package/template/list-enabled', method: 'get' }).then(list => {
    const arr = list || [];
    if (!arr.length) { alert('暂无可用套餐模板'); return; }
    const tid = prompt('选择套餐模板 ID：\n' + arr.map(t => t.id + ' : ' + (t.templateName || '')).join('\n'));
    if (tid === null) return;
    request({ url: '/tenant/package/create-from-template', method: 'POST', params: { tenantId: Number(tenantId), templateId: Number(tid) } })
      .then(() => loadTenantPkgList()).catch(() => {});
  }).catch(() => {});
}
function deleteTenantPkg(id) {
  if (!confirm('确认删除该租户套餐？')) return;
  request({ url: `/tenant/package/${id}`, method: 'DELETE' })
    .then(() => loadTenantPkgList()).catch(() => {});
}
