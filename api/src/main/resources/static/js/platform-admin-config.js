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
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-cog"></i> 系统设置</div>
        <div class="tab-bar">
          <button class="btn ${currentConfigTab==='industry'?'btn-primary':'btn-default'}" id="tab-industry" onclick="switchConfigTab('industry')">行业管理</button>
          <button class="btn ${currentConfigTab==='term'?'btn-primary':'btn-default'}" id="tab-term" onclick="switchConfigTab('term')">行业词汇</button>
          <button class="btn ${currentConfigTab==='system'?'btn-primary':'btn-default'}" id="tab-system" onclick="switchConfigTab('system')">系统参数</button>
        </div>
        <button class="btn btn-primary" onclick="switchConfigTab(currentConfigTab)"><i class="fa fa-refresh"></i> 刷新</button>
      </div>
      <div id="config-tab-body"></div>
    </div>`;
  if (window.applyTerms) applyTerms(c);
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
  if (b1) b1.className = 'btn ' + (tab === 'industry' ? 'btn-primary' : 'btn-default');
  if (b2) b2.className = 'btn ' + (tab === 'term' ? 'btn-primary' : 'btn-default');
  if (b3) b3.className = 'btn ' + (tab === 'system' ? 'btn-primary' : 'btn-default');
  const body = document.getElementById('config-tab-body');
  if (tab === 'industry') {
    if (typeof renderIndustryPage === 'function') renderIndustryPage();
  } else if (tab === 'term') {
    if (typeof renderTermPage === 'function') renderTermPage();
  } else {
    renderSystemConfigInner(body);
  }
}

/* ---------- 系统参数：前端分页 ---------- */
let __configAll = [];
let configPage = { pageNum: 1, pageSize: 10 };

// 系统参数（原 sys_system_config 列表）渲染到指定容器
function renderSystemConfigInner(body) {
  body.innerHTML = `
    <div class="table-container">
      <table class="data-table"><thead><tr>
        <th>名称</th><th>键</th><th>值</th><th>分组</th><th>类型</th><th>语言</th><th>可编辑</th><th>操作</th>
      </tr></thead><tbody id="cfg-body"></tbody></table>
    </div>
    <div id="cfg-pagebar"></div>`;
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
