/* ============================================================================
 * admin-dashboard.js —— 平台管理员「运营统计」 + 「平台总览」
 * 接口：/dashboard/*
 * ========================================================================== */
let usagePage = { pageNum: 1, pageSize: 8, total: 0, totalPages: 0 };

/* 平台总览（菜单：平台总览） */
function renderPlatformOverview() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-tachometer-alt"></i> 平台总览</div>
        <button class="btn btn-primary" onclick="renderPlatformOverview()"><i class="fa fa-refresh"></i> 刷新</button>
      </div>
      <div id="pf-ov" class="stats-panel"></div>
      <h3 style="margin:16px 0 8px;">租户趋势</h3>
      <div id="pf-trend" class="trend-chart"></div>
      <h3 style="margin:16px 0 8px;">各租户在线</h3>
      <div id="pf-online" class="online-list"></div>
    </div>`;
  if (window.applyTerms) applyTerms(c);
  request({ url: '/dashboard/overview', method: 'get' })
    .then(m => {
      const el = document.getElementById('pf-ov');
      const oe = document.getElementById('pf-online');
      if (!m || !Object.keys(m).length) {
        if (el) el.innerHTML = '<div style="padding:20px;">暂无数据</div>';
        if (oe) oe.innerHTML = '<div style="padding:12px;color:#888;">暂无在线数据</div>';
        return;
      }
      el.innerHTML = Object.entries(m)
        .filter(([k]) => k !== 'onlineByTenant')
        .map(([k, v]) =>
          `<div class="stats-item"><div class="stats-label">${escapeHtml(k)}</div><div class="stats-value">${escapeHtml('' + v)}</div></div>`
        ).join('');
      renderOnlineList(oe, m.onlineByTenant);
    }).catch(() => {
      const el = document.getElementById('pf-ov'); if (el) el.innerHTML = '<div style="padding:20px;">加载失败</div>';
      const oe = document.getElementById('pf-online'); if (oe) oe.innerHTML = '<div style="padding:12px;color:#888;">加载失败</div>';
    });
  request({ url: '/dashboard/tenant/trend', method: 'get', params: { months: 12 } })
    .then(arr => {
      const el = document.getElementById('pf-trend');
      if (el) renderTrendChart(el, arr || []);
    }).catch(() => { const el = document.getElementById('pf-trend'); if (el) el.innerHTML = '<div style="padding:16px;color:#888;">加载失败</div>'; });
}

/* 运营统计（菜单：运营统计） */
function renderStatisticsPage() {
  const c = document.getElementById('dynamic-content-center');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fa fa-chart-line"></i> 运营统计</div>
        <button class="btn btn-primary" onclick="renderStatisticsPage()"><i class="fa fa-refresh"></i> 刷新</button>
      </div>
      <h3 style="margin:12px 0 8px;">平台汇总</h3>
      <div id="st-ov" class="stats-panel"></div>
      <h3 style="margin:16px 0 8px;">租户用量</h3>
      <div class="filter-bar">
        <div class="filter-item"><input type="text" id="usage-kw" placeholder="机构名/编码"></div>
        <button class="btn" onclick="searchUsage()"><i class="fa fa-search"></i> 搜索</button>
      </div>
      <div class="table-container">
        <table class="data-table"><thead><tr>
          <th>机构</th><th>编码</th><th>套餐等级</th><th><span data-term="course">课程</span></th><th><span data-term="schedule">排期</span></th><th>用户</th><th><span data-term="teacher">教师</span></th><th><span data-term="student">学生</span></th>
        </tr></thead><tbody id="usage-body"></tbody></table>
      </div>
      <div id="usage-pagebar"></div>
      <h3 style="margin:16px 0 8px;">到期预警</h3>
      <div class="table-container">
        <table class="data-table"><thead><tr>
          <th>机构</th><th>联系人</th><th>电话</th><th>到期时间</th>
        </tr></thead><tbody id="expire-body"></tbody></table>
      </div>
    </div>`;
  if (window.applyTerms) applyTerms(c);
  loadStatisticsOverview();
  loadUsageList();
  loadExpireWarning();
}
function loadStatisticsOverview() {
  request({ url: '/dashboard/overview', method: 'get' })
    .then(m => {
      const el = document.getElementById('st-ov');
      if (!el) return;
      if (!m || !Object.keys(m).length) { el.innerHTML = '<div style="padding:16px;">暂无数据</div>'; return; }
      el.innerHTML = Object.entries(m)
        .filter(([k]) => k !== 'onlineByTenant')
        .map(([k, v]) =>
          `<div class="stats-item"><div class="stats-label">${escapeHtml(k)}</div><div class="stats-value">${escapeHtml('' + v)}</div></div>`
        ).join('');
    }).catch(() => { const el = document.getElementById('st-ov'); if (el) el.innerHTML = '<div style="padding:16px;">加载失败</div>'; });
}
function loadUsageList() {
  const kw = (document.getElementById('usage-kw') || {}).value || '';
  request({
    url: '/dashboard/tenant/usage/page', method: 'POST',
    data: { keyword: kw, pageNum: usagePage.pageNum, pageSize: usagePage.pageSize }
  }).then(page => {
    if (page) { usagePage.total = page.total || 0; usagePage.totalPages = page.totalPages || 0; renderUsageRows(page.rows || []); }
    else renderUsageRows([]);
    renderUsagePagebar();
  }).catch(() => { renderUsageRows([]); renderUsagePagebar(); });
}
function renderUsageRows(rows) {
  const tb = document.getElementById('usage-body');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">暂无数据</td></tr>'; return; }
  tb.innerHTML = rows.map((t, i) => `<tr>
    <td>${escapeHtml(t.orgName || '')}</td>
    <td>${escapeHtml(t.tenantCode || '')}</td>
    <td>${escapeHtml(t.quotaLevel || '')}</td>
    <td>${(t.courseCount || 0)}/${lim(t.courseLimit)}</td>
    <td>${(t.scheduleCount || 0)}/${lim(t.scheduleLimit)}</td>
    <td>${(t.userCount || 0)}/${lim(t.userTotalLimit)}</td>
    <td>${(t.teacherCount || 0)}/${lim(t.teacherLimit)}</td>
    <td>${(t.studentCount || 0)}/${lim(t.studentLimit)}</td>
  </tr>`).join('');
}
function lim(v) { return (v == null || v === 0) ? '不限' : v; }
function renderUsagePagebar() {
  const el = document.getElementById('usage-pagebar');
  if (!el) return;
  el.className = 'pagination-bar';
  el.innerHTML = `<span class="pagination-info">共 ${usagePage.total} 条，第 ${usagePage.pageNum}/${Math.max(1, usagePage.totalPages)} 页</span>
    <span class="pagination-btns">
      <button class="pagination-btn" ${usagePage.pageNum <= 1 ? 'disabled' : ''} onclick="usageGoto(${usagePage.pageNum - 1})">上一页</button>
      <button class="pagination-btn" ${usagePage.pageNum >= usagePage.totalPages ? 'disabled' : ''} onclick="usageGoto(${usagePage.pageNum + 1})">下一页</button>
    </span>`;
}
function usageGoto(n) { if (n < 1) n = 1; if (n > usagePage.totalPages) n = usagePage.totalPages; usagePage.pageNum = n; loadUsageList(); }
function searchUsage() { usagePage.pageNum = 1; loadUsageList(); }
function loadExpireWarning() {
  request({ url: '/dashboard/expire-warning', method: 'get' })
    .then(list => {
      const tb = document.getElementById('expire-body');
      const rows = list || [];
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">暂无即将到期租户</td></tr>'; return; }
      tb.innerHTML = rows.map(t => `<tr>
        <td>${escapeHtml(t.orgName || '')}</td>
        <td>${escapeHtml(t.contact || '')}</td>
        <td>${escapeHtml(t.phone || '')}</td>
        <td>${t.expireTime ? ('' + t.expireTime).replace('T', ' ') : '-'}</td>
      </tr>`).join('');
    }).catch(() => { const tb = document.getElementById('expire-body'); if (tb) tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">加载失败</td></tr>'; });
}

/* 各租户在线列表（onlineByTenant: [{tenantId, onlineCount}]） */
function renderOnlineList(el, list) {
  if (!el) return;
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) { el.innerHTML = '<div style="padding:12px;color:#888;">当前无租户在线</div>'; return; }
  el.innerHTML = '<ul style="list-style:none;margin:0;padding:0;">' + rows.map(r => {
    const tid = (r.tenantId == null) ? 0 : r.tenantId;
    const name = r.tenantName ? r.tenantName : (tid === 0 ? '平台' : ('租户#' + tid));
    const cnt = (r.onlineCount == null) ? 0 : r.onlineCount;
    return `<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #eee;">
      <span style="color:#333;">${escapeHtml(name)}</span>
      <span style="font-weight:500;color:#185fa5;">${cnt} 人在线</span>
    </li>`;
  }).join('') + '</ul>';
}

/* 租户趋势：横向柱状图（新增）+ 折线（退租），压缩高度 */
function renderTrendChart(el, rows) {
  if (!el) return;
  if (!rows || !rows.length) { el.innerHTML = '<div style="padding:16px;color:#888;">暂无趋势数据</div>'; return; }
  const W = 720, H = 170, padL = 28, padR = 12, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = rows.length;
  const maxV = Math.max(1, ...rows.map(r => Math.max(Number(r.newCount) || 0, Number(r.offlineCount) || 0)));
  const slot = plotW / n;
  const barW = Math.min(18, slot * 0.5);
  const yOf = v => padT + plotH - (v / maxV) * plotH;
  let bars = '';
  let offlineLabels = '';
  rows.forEach((r, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const v = Number(r.newCount) || 0;
    const h = (v / maxV) * plotH;
    bars += `<rect x="${x.toFixed(1)}" y="${yOf(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="#378ADD" rx="2"></rect>`;
    if (v > 0) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(yOf(v) - 4).toFixed(1)}" font-size="9" fill="#378ADD" text-anchor="middle">${v}</text>`;
    }
    const off = Number(r.offlineCount) || 0;
    if (off > 0) {
      const cx = padL + i * slot + slot / 2;
      offlineLabels += `<text x="${(cx + 6).toFixed(1)}" y="${(yOf(off) - 4).toFixed(1)}" font-size="9" fill="#BA7517" text-anchor="start">${off}</text>`;
    }
  });
  const pts = rows.map((r, i) => {
    const cx = padL + i * slot + slot / 2;
    const v = Number(r.offlineCount) || 0;
    return `${cx.toFixed(1)},${yOf(v).toFixed(1)}`;
  }).join(' ');
  let labels = '';
  rows.forEach((r, i) => {
    const cx = padL + i * slot + slot / 2;
    labels += `<text x="${cx.toFixed(1)}" y="${(H - 9)}" font-size="9" fill="#666" text-anchor="middle">${escapeHtml((r.month || '').slice(2, 7))}</text>`;
  });
  const baseY = (padT + plotH).toFixed(1);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="#ddd" stroke-width="1"></line>
    ${bars}
    <polyline points="${pts}" fill="none" stroke="#BA7517" stroke-width="2"></polyline>
    ${labels}
    ${offlineLabels}
    <text x="${padL}" y="11" font-size="10" fill="#378ADD">■ 新增</text>
    <text x="${padL + 46}" y="11" font-size="10" fill="#BA7517">■ 退租</text>
  </svg>`;
}
