/* ============================================================================
 * admin-config.js —— 平台管理员「系统设置」
 * 接口：/sys/config/*
 * ========================================================================== */

/* ---------- 通用前端分页工具（行业 / 行业词汇 / 系统参数 三页共用） ---------- */
/* 对纯前端已加载的全量数组做切片分页，返回当前页数据与分页元数据 */
function paginateRows(rows, pageNum, pageSize) {
  const total = rows ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let p = pageNum || 1;
  if (p < 1) p = 1;
  if (p > totalPages) p = totalPages;
  const start = (p - 1) * pageSize;
  return { pageRows: (rows || []).slice(start, start + pageSize), total, totalPages, pageNum: p };
}
/* 渲染分页条：共 N 条 / 第 x/y 页 + 上/下一页（调用全局 gotoFnName(n)） */
function renderPaginationBar(el, state, gotoFnName) {
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${state.total} 条，第 ${state.pageNum}/${state.totalPages} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${state.pageNum <= 1 ? 'disabled' : ''} onclick="${gotoFnName}(${state.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${state.pageNum >= state.totalPages ? 'disabled' : ''} onclick="${gotoFnName}(${state.pageNum + 1})">下一页</button>
    </span>`;
}

function renderConfigPage() {
  const c = document.getElementById('dynamic-content-center');
  const tpl = document.getElementById('tpl-config-page');
  if (!tpl) { console.error('[config] 缺少 #tpl-config-page'); return; }
  c.replaceChildren(tpl.content.cloneNode(true));
  if (window.applyTerms) applyTerms(c);
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
  on($('tab-industry'), 'click', () => switchConfigTab('industry'));
  on($('tab-term'), 'click', () => switchConfigTab('term'));
  on($('tab-system'), 'click', () => switchConfigTab('system'));
  on($('tab-legal'), 'click', () => switchConfigTab('legal'));
  on($('config-refresh-btn'), 'click', () => switchConfigTab(currentConfigTab));
  // 默认进入本次新增的「行业管理」Tab
  switchConfigTab('industry');
}

// 系统设置页内的 Tab 状态（industry / term / system）
let currentConfigTab = 'industry';
function switchConfigTab(tab) {
  currentConfigTab = tab;
  const b1 = document.getElementById('tab-industry');
  const b2 = document.getElementById('tab-term');
  const b3 = document.getElementById('tab-system');
  const b4 = document.getElementById('tab-legal');
  if (b1) b1.className = 'btn ' + (tab === 'industry' ? 'btn-primary' : 'btn-default');
  if (b2) b2.className = 'btn ' + (tab === 'term' ? 'btn-primary' : 'btn-default');
  if (b3) b3.className = 'btn ' + (tab === 'system' ? 'btn-primary' : 'btn-default');
  if (b4) b4.className = 'btn ' + (tab === 'legal' ? 'btn-primary' : 'btn-default');
  const body = document.getElementById('config-tab-body');
  if (tab === 'industry') {
    if (typeof renderIndustryPage === 'function') renderIndustryPage();
  } else if (tab === 'term') {
    if (typeof renderTermPage === 'function') renderTermPage();
  } else if (tab === 'legal') {
    if (typeof renderLegalPage === 'function') renderLegalPage();
  } else {
    renderSystemConfigInner(body);
  }
}

/* ---------- 系统参数：前端分页 ---------- */
let __configAll = [];
let configPage = { pageNum: 1, pageSize: 10 };

// 系统参数（原 sys_system_config 列表）渲染到指定容器
function renderSystemConfigInner(body) {
  const tpl = document.getElementById('tpl-config-system');
  if (!tpl) { console.error('[config] 缺少 #tpl-config-system'); return; }
  body.replaceChildren(tpl.content.cloneNode(true));
  loadConfigList();
}
function loadConfigList() {
  request({ url: '/sys/config/list', method: 'get' })
    .then(list => { __configAll = list || []; renderConfigRows(); })
    .catch(() => { const tb = document.getElementById('cfg-body'); if (tb) tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">加载失败</td></tr>'; });
}
function renderConfigRows() {
  const tb = document.getElementById('cfg-body');
  const bar = document.getElementById('cfg-pagebar');
  if (!tb) return;
  const pg = paginateRows(__configAll, configPage.pageNum, configPage.pageSize);
  configPage.pageNum = pg.pageNum;
  configPage.totalPages = pg.totalPages;
  configPage.total = pg.total;
  if (!__configAll.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">暂无配置</td></tr>'; if (bar) bar.innerHTML = ''; return; }
  tb.innerHTML = pg.pageRows.map(cf => {
    const e = JSON.stringify(cf).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<tr>
      <td>${escapeHtml(cf.configName || '')}</td>
      <td>${escapeHtml(cf.configKey || '')}</td>
      <td>${escapeHtml(cf.configValue || '')}</td>
      <td>${escapeHtml(cf.configGroup || '')}</td>
      <td>${escapeHtml(cf.valueType || '')}</td>
      <td>${escapeHtml(cf.language || '')}</td>
      <td>${cf.editable === 1 ? '是' : '否'}</td>
      <td>${cf.editable === 1 ? `<button class="btn btn-default" onclick="editConfig(${e})">修改</button>` : '-'}</td>
    </tr>`;
  }).join('');
  renderPaginationBar(bar, configPage, 'configGoto');
}
function configGoto(n) { configPage.pageNum = n; renderConfigRows(); }
function editConfig(cf) {
  const v = prompt('修改配置项 [' + (cf.configName || cf.configKey) + '] 的值：', cf.configValue || '');
  if (v === null) return;
  request({ url: '/sys/config/update', method: 'POST', data: { configKey: cf.configKey, configValue: v } })
    .then(() => loadConfigList()).catch(() => {});
}

/* ---------- 协议与政策（平台级维护，平台管理员 scope=0） ---------- */
// docType 白名单：正式版 + 租户参考模板；服务端 doc_type 为 varchar(32) 无枚举约束，前端加校验防脏
const LEGAL_DOCTYPE_FORMAL = ['user_agreement', 'privacy_policy'];
const LEGAL_DOCTYPE_TEMPLATE = ['user_agreement_template', 'privacy_policy_template'];
const LEGAL_DOCTYPE_ALL = LEGAL_DOCTYPE_FORMAL.concat(LEGAL_DOCTYPE_TEMPLATE);
const LEGAL_HINTS = {
  user_agreement: '平台正式版：租户注册/自动开通时签署；终端用户访问 legal.html（tenant 未指定）时阅读此版本。',
  privacy_policy: '平台正式版：与用户协议配套的隐私政策，租户注册时签署留痕。',
  user_agreement_template: '租户参考模板（场景 B）：租户管理员"采纳模板"后，发布为 tenant_id=N 的本租户用户协议；终端用户看到的是租户发布版本，而非此处。',
  privacy_policy_template: '租户参考模板（场景 B）：同上，租户采纳后发布为租户自己的隐私政策。'
};

function isLegalTemplate(docType) { return LEGAL_DOCTYPE_TEMPLATE.indexOf(docType) >= 0; }

function renderLegalPage() {
  const tpl = document.getElementById('tpl-config-legal');
  if (!tpl) { console.error('[legal] 缺少 #tpl-config-legal'); return; }
  const body = document.getElementById('config-tab-body');
  body.replaceChildren(tpl.content.cloneNode(true));
  const $ = id => document.getElementById(id);
  const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

  // 平台管理员维护平台级文档（后端 resolveScope 由令牌派生 tenantId=0）；
  // 租户级覆盖由租户管理员在 admin.html 维护（本页不做），避免越权。

  function updateHint(docType) {
    const hint = $('legal-hint');
    if (!hint) return;
    hint.style.color = isLegalTemplate(docType) ? '#c56a00' : '#1f2937';
    hint.textContent = LEGAL_HINTS[docType] || '';
  }

  function loadLegal() {
    const docType = $('legal-doc-type').value;
    const lang = $('legal-doc-lang').value;
    if (LEGAL_DOCTYPE_ALL.indexOf(docType) < 0) { alert('不支持的文档类型：' + docType); return; }
    updateHint(docType);
    request({ url: '/sys/legal-doc', method: 'get', params: { docType, lang }, customErrorMsg: false })
      .then(doc => {
        $('legal-title').value = doc && doc.title ? doc.title : '';
        $('legal-content').value = doc && doc.content ? doc.content : '';
        const suffix = isLegalTemplate(docType)
          ? '（租户参考模板 · tenantId=0）'
          : '（平台统一版本 · tenantId=' + (doc ? doc.tenantId : 0) + '）';
        $('legal-hint').textContent = doc
          ? ('当前生效版本 v' + doc.version + suffix + ' — ' + LEGAL_HINTS[docType])
          : ('尚未配置，保存后将创建首个版本' + suffix + ' — ' + LEGAL_HINTS[docType]);
      })
      .catch(() => { $('legal-hint').textContent = '读取失败，请重试'; });
  }

  on($('legal-doc-type'), 'change', loadLegal);
  on($('legal-load-btn'), 'click', loadLegal);
  on($('legal-save-btn'), 'click', () => {
    const docType = $('legal-doc-type').value;
    const lang = $('legal-doc-lang').value;
    const title = $('legal-title').value.trim();
    const content = $('legal-content').value;
    if (LEGAL_DOCTYPE_ALL.indexOf(docType) < 0) { alert('不支持的文档类型'); return; }
    if (!title) { alert('请填写标题'); return; }
    if (isLegalTemplate(docType) && !confirm('当前保存的是「租户参考模板」，不会直接展示给终端用户。确认保存？')) return;
    request({ url: '/sys/legal-doc/update', method: 'POST',
      data: { docType, language: lang, title, content }, customErrorMsg: false })
      .then(doc => { alert('已保存为新版本（v' + (doc && doc.version) + '），旧版本自动停用'); loadLegal(); })
      .catch(() => { $('legal-hint').textContent = '保存失败，请重试'; });
  });

  loadLegal();
}
