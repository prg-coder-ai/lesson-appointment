/* ============================================================================
 * admin-config.js —— 平台管理员「系统设置」
 * 接口：/sys/config/*
 * ========================================================================== */
function renderConfigPage() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-cog"></i> 系统设置</div>
        <div class="tab-bar">
          <button class="tab-btn active" id="tab-industry" onclick="switchConfigTab('industry')">行业管理</button>
          <button class="tab-btn" id="tab-term" onclick="switchConfigTab('term')">行业词汇</button>
          <button class="tab-btn" id="tab-system" onclick="switchConfigTab('system')">系统参数</button>
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
  if (b1) b1.classList.toggle('active', tab === 'industry');
  if (b2) b2.classList.toggle('active', tab === 'term');
  if (b3) b3.classList.toggle('active', tab === 'system');
  const body = document.getElementById('config-tab-body');
  if (tab === 'industry') {
    if (typeof renderIndustryPage === 'function') renderIndustryPage();
  } else if (tab === 'term') {
    if (typeof renderTermPage === 'function') renderTermPage();
  } else {
    renderSystemConfigInner(body);
  }
}

// 系统参数（原 sys_system_config 列表）渲染到指定容器
function renderSystemConfigInner(body) {
  body.innerHTML = `
    <div class="table-container">
      <table class="data-table"><thead><tr>
        <th>名称</th><th>键</th><th>值</th><th>分组</th><th>类型</th><th>语言</th><th>可编辑</th><th>操作</th>
      </tr></thead><tbody id="cfg-body"></tbody></table>
    </div>`;
  loadConfigList();
}
function loadConfigList() {
  request({ url: '/sys/config/list', method: 'get' })
    .then(list => {
      const tb = document.getElementById('cfg-body');
      const rows = list || [];
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无配置</td></tr>'; return; }
      tb.innerHTML = rows.map(cf => {
        const e = JSON.stringify(cf).replace(/'/g, "\\'");
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
    }).catch(() => { const tb = document.getElementById('cfg-body'); if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">加载失败</td></tr>'; });
}
function editConfig(cf) {
  const v = prompt('修改配置项 [' + (cf.configName || cf.configKey) + '] 的值：', cf.configValue || '');
  if (v === null) return;
  request({ url: '/sys/config/update', method: 'POST', data: { configKey: cf.configKey, configValue: v } })
    .then(() => loadConfigList()).catch(() => {});
}
