/* ============================================================================
 * admin-industry.js —— 平台管理员「行业管理」
 * 挂在 platform_admin.html 的「系统设置」菜单（key=config）下，作为 Tab 之一
 * 依赖：window.request（utility_request.js）、escapeHtml（api.js）、applyTerms（termsFunction.js）
 * 接口：/industry/*
 * ========================================================================== */

/**
 * 渲染行业管理面板（写入 #config-tab-body）
 */
let __industryAll = [];
let industryPage = { pageNum: 1, pageSize: 10 };

function renderIndustryPage() {
  const body = document.getElementById('config-tab-body');
  if (!body) return;
  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-industry"></i> 行业管理</div>
        <button class="btn btn-primary" onclick="openIndustryModal(null)"><i class="fa fa-plus"></i> 新增行业</button>
      </div>
      <div class="table-container">
        <table class="data-table"><thead><tr>
          <th>ID</th><th>编码</th><th>名称</th><th>状态</th><th>备注</th><th>操作</th>
        </tr></thead><tbody id="industry-body"></tbody></table>
      </div>
      <div id="industry-pagebar"></div>
    </div>`;
  if (window.applyTerms) applyTerms(body);
  loadIndustryList();
}

function loadIndustryList() {
  request({ url: '/industry/list', method: 'get' })
    .then(list => { __industryAll = list || []; renderIndustryRows(); })
    .catch(() => {
      const tb = document.getElementById('industry-body');
      if (tb) tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">加载失败</td></tr>';
    });
}
function renderIndustryRows() {
  const tb = document.getElementById('industry-body');
  const bar = document.getElementById('industry-pagebar');
  if (!tb) return;
  const pg = paginateRows(__industryAll, industryPage.pageNum, industryPage.pageSize);
  industryPage.pageNum = pg.pageNum;
  industryPage.totalPages = pg.totalPages;
  if (!__industryAll.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">暂无行业</td></tr>'; if (bar) bar.innerHTML = ''; return; }
  tb.innerHTML = pg.pageRows.map(t => {
    const e = JSON.stringify(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<tr>
      <td>${t.id}</td>
      <td>${escapeHtml(t.code || '')}</td>
      <td>${escapeHtml(t.name || '')}</td>
      <td>${t.status === 1 ? '启用' : '停用'}</td>
      <td>${escapeHtml(t.remark || '')}</td>
      <td>
        <button class="btn btn-default" onclick="openIndustryModal(${e})">编辑</button>
        <button class="btn btn-warning" onclick="toggleIndustryStatus(${t.id},${t.status})">${t.status === 1 ? '停用' : '启用'}</button>
        <button class="btn btn-danger" onclick="deleteIndustry(${t.id})">删除</button>
      </td>
    </tr>`;
  }).join('');
  renderPaginationBar(bar, industryPage, 'industryGoto');
}
function industryGoto(n) { industryPage.pageNum = n; renderIndustryRows(); }

/* ---------- 模态框 ---------- */
function openIndustryModal(obj) {
  let modal = document.getElementById('industryModal');
  if (!modal) modal = createIndustryModal();
  modal.style.display = 'flex';
  const isEdit = obj && obj.id;
  document.getElementById('industryModalTitle').innerText = isEdit ? '编辑行业' : '新增行业';
  const fc = document.getElementById('industryFormContainer');
  fc.innerHTML = `
    <form id="industryForm" class="form-item">
      <input type="hidden" name="id" value="${isEdit ? obj.id : ''}">
      <div class="form-line"><label>行业编码</label><input name="code" value="${isEdit ? escapeHtml(obj.code || '') : ''}" ${isEdit ? 'readonly' : ''} placeholder="如 edu / it / medical"></div>
      <div class="form-line"><label>行业名称</label><input name="name" value="${isEdit ? escapeHtml(obj.name || '') : ''}" required></div>
      <div class="form-line"><label>状态</label><select name="status">
        <option value="1" ${isEdit && obj.status === 1 ? 'selected' : ''}>启用</option>
        <option value="0" ${isEdit && obj.status === 0 ? 'selected' : ''}>停用</option>
      </select></div>
      <div class="form-line"><label>备注</label><textarea name="remark">${isEdit ? escapeHtml(obj.remark || '') : ''}</textarea></div>
      <div class="form-error" id="industryFormErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitIndustry()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closeIndustryModal()">取消</button>
      </div>
    </form>`;
}

function createIndustryModal() {
  const m = document.createElement('div');
  m.className = 'modal-mask'; m.id = 'industryModal'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-content">
      <div class="modal-header"><div id="industryModalTitle" style="font-weight:600;font-size:16px;"></div>
        <span class="modal-close" id="industryCloseBtn">&times;</span></div>
      <div id="industryFormContainer"></div></div>`;
  document.body.appendChild(m);
  // 只允许通过「取消」「保存」按钮或右上角 × 关闭；点遮罩不关闭，避免误触丢失已填内容。
  document.getElementById('industryCloseBtn').addEventListener('click', closeIndustryModal);
  return m;
}
function closeIndustryModal() {
  const m = document.getElementById('industryModal');
  if (m) m.style.display = 'none';
}

function submitIndustry() {
  const f = document.getElementById('industryForm');
  const id = f.id.value ? Number(f.id.value) : null;
  const data = {
    code: f.code.value.trim(),
    name: f.name.value.trim(),
    status: Number(f.status.value),
    remark: f.remark.value
  };
  if (!data.name) { document.getElementById('industryFormErr').innerText = '行业名称必填'; return; }
  if (!data.code) { document.getElementById('industryFormErr').innerText = '行业编码必填'; return; }
  if (id) data.id = id;
  request({ url: id ? '/industry/update' : '/industry/insert', method: 'POST', data })
    .then(() => { closeIndustryModal(); loadIndustryList(); })
    .catch(() => {});
}

function toggleIndustryStatus(id, cur) {
  const next = cur === 1 ? 0 : 1;
  if (!confirm('确认' + (next === 1 ? '启用' : '停用') + '该行业？')) return;
  request({ url: `/industry/${id}/status`, method: 'POST', params: { status: next } })
    .then(() => loadIndustryList())
    .catch(() => {});
}

function deleteIndustry(id) {
  if (!confirm('确认删除该行业？')) return;
  request({ url: `/industry/${id}`, method: 'DELETE' })
    .then(() => loadIndustryList())
    .catch(() => {});
}
