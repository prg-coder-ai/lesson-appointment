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
    return tenantNameMap;
  }).catch(() => { tenantNameMap = {}; });
}
function tenantName(id) {
  if (!id) return '-';
  return tenantNameMap[id] || ('租户#' + id);
}


function renderPackageCards() {
  const c = document.getElementById('dynamic-content-center');
  const tpl = document.getElementById('tpl-package-cards');
  if (!tpl) { console.error('[package] 缺少 #tpl-package-cards'); return; }
  c.replaceChildren(tpl.content.cloneNode(true));
  if (window.applyTerms) applyTerms(c);
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
  // 按 pkgTab 设置当前 tab 高亮（模板两按钮默认 btn-default）
  const isTpl = pkgTab === 'template';
  const t1 = $('pkg-tab-template'), t2 = $('pkg-tab-tenant');
  if (t1) t1.className = 'btn ' + (isTpl ? 'btn-primary' : 'btn-default');
  if (t2) t2.className = 'btn ' + (isTpl ? 'btn-default' : 'btn-primary');
  on(t1, 'click', () => switchPkgTab('template'));
  on(t2, 'click', () => switchPkgTab('tenant'));
  on($('pkg-add-tpl-btn'), 'click', () => openPkgTplModal(null));

     loadTenantNameMap().then(() => renderPkgTab()); 
}
function switchPkgTab(t) { pkgTab = t; renderPackageCards(); }
function renderPkgTab() {
  const area = document.getElementById('pkg-body-area');
  if (pkgTab === 'template') renderPkgTplTable(area); else renderTenantPkgTable(area);
}

/* ---------------- 套餐模板 ---------------- */
function renderPkgTplTable(area) {
  const tpl = document.getElementById('tpl-pkg-tpl-table');
  if (!tpl) { console.error('[package] 缺少 #tpl-pkg-tpl-table'); return; }
  area.replaceChildren(tpl.content.cloneNode(true));
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
    const e = JSON.stringify(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
  // 只允许通过「取消」「保存」按钮或右上角 × 关闭；点遮罩不关闭，避免误触丢失已填内容。
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
  const tpl = document.getElementById('tpl-tenant-pkg-table');
  if (!tpl) { console.error('[package] 缺少 #tpl-tenant-pkg-table'); return; }
  area.replaceChildren(tpl.content.cloneNode(true));
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
  on($('tpkg-create-btn'), 'click', () => createTenantPkgFromTemplate());
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
    const e = JSON.stringify(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
      <div class="form-line"><label>租户</label><input value="${isEdit ? escapeHtml(tenantName(obj.tenantId)) : ''}" disabled></div>
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
    // 只允许通过「取消」「保存」按钮或右上角 × 关闭；点遮罩不关闭，避免误触丢失已填内容。
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
/* ---------------- 从模板为租户创建套餐：卡片式选择（2026-11-04 重做） ----------------
 * 原实现：两次 prompt 依次索要「目标租户 ID」「套餐模板 ID」——
 *   人记不住 id，填错就报"指定租户不存在"，更糟的是把套餐建到别的租户头上；
 *   模板清单也是把 id 拼成文本让人抄，纯人工易错。
 * 现改为下方展开的选择卡片：租户按【机构名称】选、套餐按【模板名称】选，
 * 最后点「指定套餐」把两者关联。顺带处理两件事：
 *   ① 保留字租户 platform/default 只是登录标识锚点，不是经营租户 → 不列出；
 *   ② 已有套餐的租户置灰并标「已有套餐」——后端 createFromTemplate 对重复租户
 *      是直接抛"该租户已存在套餐记录，如需换模板请使用「变更套餐」"。
 * 状态放在 var 对象上（渲染重入时重置），所有节点用事件委托，避免重渲染后监听丢失。 */
var tpkgPickState = { tenantId: null, templateId: null, tenants: [], templates: [], hasPkg: {}, submitting: false };

function tpkgPickEsc(s) {
  return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : String(s)) : String(s == null ? '' : s);
}
function tpkgPickLimitText(t) {
  const n = v => (v === 0 || v == null) ? '不限' : v;
  return '课程 ' + n(t.courseLimit) + ' · 排期 ' + n(t.scheduleLimit) + ' · 用户 ' + n(t.userTotalLimit)
       + ' · 教师 ' + n(t.teacherLimit) + ' · 学生 ' + n(t.studentLimit);
}
function tpkgPickCardStyle(selected, disabled) {
  return 'padding:8px 10px;border:1px solid ' + (selected ? '#2b7cff' : '#eceff5') + ';border-radius:8px;'
       + 'margin-bottom:8px;background:' + (selected ? '#eef5ff' : (disabled ? '#f7f8fa' : '#fff')) + ';'
       + 'cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';' + (disabled ? 'opacity:.65;' : '');
}
function tpkgRenderTenantCards() {
  const box = document.getElementById('tpkg-pick-tenants');
  if (!box) return;
  const list = tpkgPickState.tenants || [];
  if (!list.length) { box.innerHTML = '<div style="padding:10px;color:#8a94a6;font-size:13px;">没有可选租户</div>'; return; }
  box.innerHTML = list.map(t => {
    const has = !!tpkgPickState.hasPkg[t.id];
    const sel = tpkgPickState.tenantId === t.id;
    const name = tpkgPickEsc(t.orgName || t.tenantCode || ('租户#' + t.id));
    const sub = tpkgPickEsc(t.tenantCode || '') + (typeof tenantStatusText === 'function' ? ' · ' + tpkgPickEsc(tenantStatusText(t.status)) : '');
    return `<div data-tid="${t.id}" data-disabled="${has ? 1 : 0}" style="${tpkgPickCardStyle(sel, has)}">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:600;font-size:14px;">${name}</span>
        ${has ? '<span style="margin-left:auto;font-size:12px;color:#c0392b;background:#fdecea;border-radius:10px;padding:1px 8px;white-space:nowrap;">已有套餐</span>' : ''}
      </div>
      <div style="color:#8a94a6;font-size:12px;margin-top:2px;">${sub}</div>
    </div>`;
  }).join('');
}
function tpkgRenderTemplateCards() {
  const box = document.getElementById('tpkg-pick-templates');
  if (!box) return;
  const list = tpkgPickState.templates || [];
  if (!list.length) { box.innerHTML = '<div style="padding:10px;color:#8a94a6;font-size:13px;">没有启用的套餐模板（先去「套餐模板」页启用或新增）</div>'; return; }
  box.innerHTML = list.map(t => {
    const sel = tpkgPickState.templateId === t.id;
    return `<div data-tplid="${t.id}" style="${tpkgPickCardStyle(sel, false)}">
      <div style="font-weight:600;font-size:14px;">${tpkgPickEsc(t.templateName || ('模板#' + t.id))}</div>
      <div style="color:#8a94a6;font-size:12px;margin-top:2px;">${tpkgPickLimitText(t)}</div>
    </div>`;
  }).join('');
}
function tpkgUpdateSummary() {
  const st = tpkgPickState;
  const t = (st.tenants || []).filter(x => x.id === st.tenantId)[0];
  const p = (st.templates || []).filter(x => x.id === st.templateId)[0];
  const sum = document.getElementById('tpkg-pick-summary');
  const ok = document.getElementById('tpkg-pick-confirm');
  if (sum) {
    if (t && p) {
      sum.innerHTML = '将为 <b>' + tpkgPickEsc(t.orgName || t.tenantCode) + '</b> 指定套餐 <b>'
        + tpkgPickEsc(p.templateName) + '</b>（' + tpkgPickLimitText(p) + '）';
    } else if (t) {
      sum.innerHTML = '已选租户 <b>' + tpkgPickEsc(t.orgName || t.tenantCode) + '</b>，请选择套餐模板';
    } else if (p) {
      sum.innerHTML = '已选套餐 <b>' + tpkgPickEsc(p.templateName) + '</b>，请选择租户';
    } else {
      sum.innerHTML = '尚未选择';
    }
  }
  if (ok) ok.disabled = !(t && p) || st.submitting;
}
function tpkgBindPickerOnce() {
  const tl = document.getElementById('tpkg-pick-tenants');
  const pl = document.getElementById('tpkg-pick-templates');
  const ok = document.getElementById('tpkg-pick-confirm');
  const cancel = document.getElementById('tpkg-pick-cancel');
  if (tl && !tl.__tpkgBound) {
    tl.__tpkgBound = true;
    tl.addEventListener('click', function (ev) {
      const card = ev.target && ev.target.closest ? ev.target.closest('[data-tid]') : null;
      if (!card || card.dataset.disabled === '1') return;      // 已有套餐的租户不可选
      tpkgPickState.tenantId = Number(card.dataset.tid);
      tpkgRenderTenantCards();
      tpkgUpdateSummary();
    });
  }
  if (pl && !pl.__tpkgBound) {
    pl.__tpkgBound = true;
    pl.addEventListener('click', function (ev) {
      const card = ev.target && ev.target.closest ? ev.target.closest('[data-tplid]') : null;
      if (!card) return;
      tpkgPickState.templateId = Number(card.dataset.tplid);
      tpkgRenderTemplateCards();
      tpkgUpdateSummary();
    });
  }
  if (ok && !ok.__tpkgBound) { ok.__tpkgBound = true; ok.addEventListener('click', tpkgSubmitPick); }
  if (cancel && !cancel.__tpkgBound) { cancel.__tpkgBound = true; cancel.addEventListener('click', tpkgClosePicker); }
}
function tpkgClosePicker() {
  const panel = document.getElementById('tpkg-picker');
  if (panel) panel.style.display = 'none';
  tpkgPickState = { tenantId: null, templateId: null, tenants: [], templates: [], hasPkg: {}, submitting: false };
  const ok = document.getElementById('tpkg-pick-confirm');
  if (ok) { ok.disabled = true; ok.textContent = '指定套餐'; }
}
/** 点「从模板为租户创建套餐」：在下方展开选择卡片（再点一次收起） */
function createTenantPkgFromTemplate() {
  const panel = document.getElementById('tpkg-picker');
  if (!panel) return;
  if (panel.style.display !== 'none') { tpkgClosePicker(); return; }
  tpkgBindPickerOnce();
  tpkgPickState = { tenantId: null, templateId: null, tenants: [], templates: [], hasPkg: {}, submitting: false };
  panel.style.display = 'block';
  const loading = '<div style="padding:10px;color:#8a94a6;font-size:13px;">加载中…</div>';
  const tl = document.getElementById('tpkg-pick-tenants');
  const pl = document.getElementById('tpkg-pick-templates');
  if (tl) tl.innerHTML = loading;
  if (pl) pl.innerHTML = loading;
  tpkgUpdateSummary();

  Promise.all([
    request({ url: '/tenant/list', method: 'get' }).catch(() => []),
    request({ url: '/package/template/list-enabled', method: 'get' }).catch(() => []),
    request({ url: '/tenant/package/list', method: 'get' }).catch(() => [])
  ]).then(([tenants, templates, pkgs]) => {
    const RESERVED = ['platform', 'default'];                  // 登录标识锚点，不是经营租户
    tpkgPickState.tenants = (tenants || []).filter(t => t && t.id
      && t.deleted !== 1
      && RESERVED.indexOf(String(t.tenantCode || '').toLowerCase()) < 0);
    tpkgPickState.templates = (templates || []).filter(t => t && t.id);
    tpkgPickState.hasPkg = {};
    (pkgs || []).forEach(p => { if (p && p.tenantId) tpkgPickState.hasPkg[p.tenantId] = true; });
    tpkgRenderTenantCards();
    tpkgRenderTemplateCards();
    tpkgUpdateSummary();
  });
}
function tpkgSubmitPick() {
  const st = tpkgPickState;
  if (st.submitting || !st.tenantId || !st.templateId) return;
  st.submitting = true;
  const ok = document.getElementById('tpkg-pick-confirm');
  if (ok) { ok.disabled = true; ok.textContent = '提交中…'; }
  request({ url: '/tenant/package/create-from-template', method: 'POST', params: { tenantId: st.tenantId, templateId: st.templateId } })
    .then(() => {
      if (typeof toastMsg === 'function') toastMsg('租户套餐创建成功', 'success');
      tpkgClosePicker();
      loadTenantPkgList();
    })
    .catch(() => {
      st.submitting = false;
      if (ok) ok.textContent = '指定套餐';
      tpkgUpdateSummary();
    });
}
function deleteTenantPkg(id) {
  if (!confirm('确认删除该租户套餐？')) return;
  request({ url: `/tenant/package/${id}`, method: 'DELETE' })
    .then(() => loadTenantPkgList()).catch(() => {});
}
