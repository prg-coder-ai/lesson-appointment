/* ============================================================================
 * admin-term.js —— 平台管理员「行业词汇」
 * 挂在 platform_admin.html 的「系统设置」菜单（key=config）下，作为 Tab 之一
 * 职责：维护三级作用域词汇 —— 平台词(0,0) / 行业词(行业id,0)
 *       （租户词由租户管理端自行维护，不在本页）
 * 依赖：window.request（utility_request.js）、escapeHtml（api.js）、applyTerms（termsFunction.js）
 * 接口：/term/list /term/insert /term/update /term/{id}/status /term/copy；/industry/list
 * ========================================================================== */

let currentTermIndustryId = 0; // 当前列表作用域：0=平台词，>0=行业词

// 支持的语言（ISO 639-1）。新增语言只需在此追加，无需改后端
const TERM_LANG_OPTIONS = [
  { code: 'zh', label: '中文 (zh)' },
  { code: 'en', label: 'English (en)' },
  { code: 'fr', label: 'Français (fr)' },
  { code: 'ja', label: '日本語 (ja)' },
  { code: 'ko', label: '한국어 (ko)' },
  { code: 'de', label: 'Deutsch (de)' },
  { code: 'es', label: 'Español (es)' },
  { code: 'ru', label: 'Русский (ru)'
  }
];

/**
 * 渲染行业词汇面板（写入 #config-tab-body）
 */
function renderTermPage() {
  const body = document.getElementById('config-tab-body');
  if (!body) return;
  body.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-book"></i> 行业词汇</div>
        <div class="tab-bar" style="margin-left:16px;">
          <select id="term-scope-select" onchange="switchTermScope(this.value)">
            <option value="0">平台词（全系统默认）</option>
            <option value="-1">-- 按行业过滤 --</option>
          </select>
        </div>
        <button class="btn btn-default" onclick="copyIndustryTerms()"><i class="fa fa-copy"></i> 行业词复制</button>
        <button class="btn btn-primary" onclick="openTermModal(null)"><i class="fa fa-plus"></i> 新增词条</button>
      </div>
      <div style="margin-bottom:10px;padding:8px 12px;border-radius:6px;background:rgba(59,130,246,.08);color:#3b82f6;font-size:12px;line-height:1.7;">
        编码命名规范：标签/菜单/按钮/提示词用语义名（如 <code>courseType</code>）；<b>下拉选项词 = 标签词 + "." + 选项编码</b>（如 <code>courseType.oneOnOne</code>），词表优先、缺词回退页面默认文案
      </div>
      <div class="table-container">
        <table class="data-table"><thead><tr>
          <th>编码</th><th>显示词</th><th>语言</th><th>类型</th><th>排序</th><th>状态</th><th>备注</th><th>操作</th>
        </tr></thead><tbody id="term-body"></tbody></table>
      </div>
    </div>`;
  if (window.applyTerms) applyTerms(body);
  loadTermIndustries();
  loadTermList(currentTermIndustryId);
}

/** 拉取行业列表填充作用域下拉（保留"平台词"选项在最前） */
function loadTermIndustries() {
  request({ url: '/industry/list', method: 'get' })
    .then(list => {
      const sel = document.getElementById('term-scope-select');
      if (!sel) return;
      const keep = sel.options[0];
      sel.innerHTML = '';
      sel.appendChild(keep);
      (list || []).forEach(ind => {
        const o = document.createElement('option');
        o.value = ind.id;
        o.textContent = ind.name + '（' + (ind.code || '') + '）';
        sel.appendChild(o);
      });
      sel.value = currentTermIndustryId === 0 ? '0' : String(currentTermIndustryId);
      sel.options[1].disabled = true; // 分隔行不可选
    })
    .catch(() => {});
}

function switchTermScope(industryId) {
  if (industryId === '-1') return;
  currentTermIndustryId = Number(industryId);
  loadTermList(currentTermIndustryId);
}

/** 列表：industryId=0 平台词；>0 行业词 */
function loadTermList(industryId) {
  request({ url: '/term/list', method: 'get', params: { industryId } })
    .then(list => {
      const tb = document.getElementById('term-body');
      const rows = list || [];
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">暂无词条（行业词未配置时，页面回退显示平台词）</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(t => {
        const e = JSON.stringify(t).replace(/'/g, "\\'");
        return `<tr>
          <td>${escapeHtml(t.termKey || '')}</td>
          <td style="font-weight:600;">${escapeHtml(t.termName || '')}</td>
          <td><span style="display:inline-block;padding:1px 8px;border-radius:10px;background:rgba(59,130,246,.12);color:#3b82f6;font-size:12px;font-weight:600;">${escapeHtml((t.language || 'zh').toUpperCase())}</span></td>
          <td>${escapeHtml(t.termType || 'label')}</td>
          <td>${t.sortOrder == null ? 0 : t.sortOrder}</td>
          <td>${t.status === 1 ? '<span style="color:var(--color-success,#1d9e75);">启用</span>' : '<span style="color:var(--color-danger,#e24b4a);">停用</span>'}</td>
          <td>${escapeHtml(t.remark || '')}</td>
          <td>
            <button class="btn btn-default" onclick="openTermModal(${e})">编辑</button>
            <button class="btn btn-warning" onclick="toggleTermStatus(${t.id},${t.status})">${t.status === 1 ? '停用' : '启用'}</button>
            <button class="btn btn-danger" onclick="deleteTerm(${t.id})">删除</button>
          </td>
        </tr>`;
      }).join('');
    })
    .catch(() => {
      const tb = document.getElementById('term-body');
      if (tb) tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">加载失败</td></tr>';
    });
}

/* ---------- 模态框 ---------- */
function openTermModal(obj) {
  let modal = document.getElementById('termModal');
  if (!modal) modal = createTermModal();
  modal.style.display = 'flex';
  const isEdit = obj && obj.id;
  document.getElementById('termModalTitle').innerText = isEdit ? '编辑词条' : '新增词条';
  // 带前缀的选项词（如 courseType.oneOnOne）：顶部显示同组词汇下拉，快速切换同组编辑
  const grouped = isEdit && obj.termKey && obj.termKey.indexOf('.') > 0;
  const termGroupHtml = grouped ? `
      <div class="form-line"><label>本组词汇</label><select id="termGroupSelect" onchange="switchTermGroup()">
        <option value="">加载中...</option>
      </select>
      <span style="font-size:12px;color:var(--color-text-tertiary,#888);">同前缀选项词快速切换，当前词条在下方编辑框</span></div>` : '';
  const fc = document.getElementById('termFormContainer');
  fc.innerHTML = `
    <form id="termForm" class="form-item">
      <input type="hidden" name="id" value="${isEdit ? obj.id : ''}">
      ${termGroupHtml}
      <div class="form-line"><label>词条编码</label><input name="termKey" value="${isEdit ? escapeHtml(obj.termKey || '') : ''}" ${isEdit ? 'readonly' : ''} placeholder="如 course / teacher；下拉选项词如 courseType.oneOnOne"></div>
      <div class="form-line"><label>显示词</label><input name="termName" value="${isEdit ? escapeHtml(obj.termName || '') : ''}" required></div>
      <div class="form-line"><label>语言</label><select name="language">
        ${TERM_LANG_OPTIONS.map(o => `<option value="${o.code}" ${isEdit && (obj.language || 'zh') === o.code ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--color-text-tertiary,#888);">同一编码可维护多个语言版本，界面按语言取词</span></div>
      <div class="form-line"><label>词条类型</label><select name="termType">
        ${['label','menu','button','tip'].map(x => `<option value="${x}" ${isEdit && obj.termType === x ? 'selected' : ''}>${x === 'label' ? '标签' : x === 'menu' ? '菜单' : x === 'button' ? '按钮' : '提示语'}</option>`).join('')}
      </select></div>
      ${isEdit ? '' : `<div class="form-line"><label>作用域</label>
        <select name="scopeIndustry" id="termScopeIndustry">
          <option value="0">平台词（全系统默认）</option>
        </select>
        <span style="font-size:12px;color:var(--color-text-tertiary,#888);">行业词需先在「行业管理」中创建行业</span>
      </div>`}
      <div class="form-line"><label>排序</label><input name="sortOrder" type="number" value="${isEdit ? (obj.sortOrder || 0) : 0}"></div>
      <div class="form-line"><label>状态</label><select name="status">
        <option value="1" ${isEdit && obj.status === 1 ? 'selected' : ''}>启用</option>
        <option value="0" ${isEdit && obj.status === 0 ? 'selected' : ''}>停用</option>
      </select></div>
      <div class="form-line"><label>备注</label><textarea name="remark">${isEdit ? escapeHtml(obj.remark || '') : ''}</textarea></div>
      <div class="form-error" id="termFormErr"></div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary" onclick="submitTerm()">保存</button>
        <button type="button" class="btn btn-cancel" onclick="closeTermModal()">取消</button>
      </div>
    </form>`;
  // 编辑带前缀的选项词：加载同组词条填充下拉（当前词条选中，切换即换编辑对象）
  if (grouped) {
    const sel = document.getElementById('termGroupSelect');
    loadTermGroupOptions(obj.termKey, group => {
      sel.innerHTML = group.map(g => {
        const j = JSON.stringify(g).replace(/'/g, "\\'");
        return `<option value="${g.id}" data-obj='${j}' ${g.id === obj.id ? 'selected' : ''}>${escapeHtml(g.termName || '')} (${escapeHtml((g.language || 'zh').toUpperCase())})</option>`;
      }).join('') || '<option value="">本组暂无其他词条</option>';
    });
  }
  // 新增时：填充行业下拉并选中当前列表作用域
  if (!isEdit) {
    request({ url: '/industry/list', method: 'get' })
      .then(list => {
        const sel = document.getElementById('termScopeIndustry');
        if (!sel) return;
        (list || []).forEach(ind => {
          const o = document.createElement('option');
          o.value = ind.id;
          o.textContent = ind.name;
          sel.appendChild(o);
        });
        sel.value = currentTermIndustryId > 0 ? String(currentTermIndustryId) : '0';
      })
      .catch(() => {});
  }
}

function createTermModal() {
  const m = document.createElement('div');
  m.className = 'modal-mask'; m.id = 'termModal'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-content">
      <div class="modal-header"><div id="termModalTitle" style="font-weight:600;font-size:16px;"></div>
        <span class="modal-close" id="termCloseBtn">&times;</span></div>
      <div id="termFormContainer"></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target.id === 'termModal') closeTermModal(); });
  document.getElementById('termCloseBtn').addEventListener('click', closeTermModal);
  return m;
}
function closeTermModal() {
  const m = document.getElementById('termModal');
  if (m) m.style.display = 'none';
}

/* ---------- 同组词汇（带前缀选项词）快速切换 ---------- */
/** 加载当前作用域下同前缀的选项词条（如 courseType.*），供本组下拉使用 */
function loadTermGroupOptions(termKey, onLoaded) {
  const prefix = (termKey || '').split('.')[0];
  if (!prefix) { onLoaded([]); return; }
  request({ url: '/term/list', method: 'get', params: { industryId: currentTermIndustryId } })
    .then(list => {
      const group = (list || []).filter(t => t.termKey && t.termKey.indexOf(prefix + '.') === 0);
      group.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      onLoaded(group);
    })
    .catch(() => onLoaded([]));
}

/** 本组下拉切换：以选中词条重新打开编辑框（当前词汇显示在编辑框） */
function switchTermGroup() {
  const sel = document.getElementById('termGroupSelect');
  if (!sel || !sel.selectedIndex) return;
  const opt = sel.options[sel.selectedIndex];
  const raw = opt && opt.getAttribute('data-obj');
  if (!raw) return;
  try { openTermModal(JSON.parse(raw)); } catch (e) {}
}

function submitTerm() {
  const f = document.getElementById('termForm');
  const id = f.id.value ? Number(f.id.value) : null;
  const data = {
    termKey: f.termKey.value.trim(),
    termName: f.termName.value.trim(),
    language: (f.language.value || 'zh').trim(),
    termType: f.termType.value,
    sortOrder: Number(f.sortOrder.value || 0),
    status: Number(f.status.value),
    remark: f.remark.value
  };
  if (!data.termKey) { document.getElementById('termFormErr').innerText = '词条编码必填'; return; }
  if (!data.termName) { document.getElementById('termFormErr').innerText = '显示词必填'; return; }
  if (!id) data.industryId = Number(document.getElementById('termScopeIndustry').value);
  if (id) data.id = id;
  request({ url: id ? '/term/update' : '/term/insert', method: 'POST', data })
    .then(() => { closeTermModal(); loadTermList(currentTermIndustryId); })
    .catch(() => {});
}

function toggleTermStatus(id, cur) {
  const next = cur === 1 ? 0 : 1;
  if (!confirm('确认' + (next === 1 ? '启用' : '停用') + '该词条？停用后该级将回退到下一级词汇。')) return;
  request({ url: `/term/${id}/status`, method: 'POST', params: { status: next } })
    .then(() => loadTermList(currentTermIndustryId))
    .catch(() => {});
}

function deleteTerm(id) {
  if (!confirm('确认删除该词条？')) return;
  request({ url: `/term/${id}`, method: 'DELETE' })
    .then(() => loadTermList(currentTermIndustryId))
    .catch(() => {});
}

/* ---------- 行业词复制 ---------- */
function copyIndustryTerms() {
  const from = prompt('输入【源行业ID】（把哪个行业的词复制出去）：');
  if (!from) return;
  const to = prompt('输入【目标行业ID】（复制到哪个行业）：');
  if (!to) return;
  if (Number(from) === Number(to)) { alert('源与目标行业不能相同'); return; }
  request({ url: '/term/copy', method: 'POST', params: { fromIndustryId: Number(from), toIndustryId: Number(to) } })
    .then(res => { alert('复制完成：新增 ' + (res.copied || 0) + ' 条，跳过 ' + (res.skipped || 0) + ' 条'); loadTermList(currentTermIndustryId); })
    .catch(() => {});
}
