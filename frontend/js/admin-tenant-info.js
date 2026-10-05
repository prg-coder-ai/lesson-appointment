/* ============================================================================
 * admin-tenant-info.js —— 租户管理员「租户信息」（只读）
 * 对标平台管理员"租户管理 / 额度"，但本页只读：展示本租户的
 * tenantCode / 租期 / 套餐 / 各资源额度与余量。无编辑 / 续期 / 变更入口。
 * 接口：/tenant/current、/tenant/package/tenant/{id}、/package/template/{id}
 * 依赖：window.request（utility_request.js）、escapeHtml（api.js）、applyTerms（termsFunction.js）
 * ========================================================================== */

function tenantStatusText(s) {
  return s === 1 ? '正常' : s === 2 ? '停用' : s === 3 ? '退租' : (s == null ? '未知' : '' + s);
}
function fmtDate(s) {
  if (!s) return '—';
  // 后端 LocalDateTime 序列化为 ISO 字符串，如 2026-10-05T00:00:00
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function quotaRowsOf(pkg) {
  if (!pkg) return [];
  const defs = [
    { label: '课程', limitKey: 'courseLimit', curKey: 'courseCurrent' },
    { label: '排期', limitKey: 'scheduleLimit', curKey: 'scheduleCurrent' },
    { label: '注册用户', limitKey: 'userTotalLimit', curKey: 'userCurrent' },
    { label: '教师', limitKey: 'teacherLimit', curKey: 'teacherCurrent' },
    { label: '学生', limitKey: 'studentLimit', curKey: 'studentCurrent' },
    { label: '教师信息发布', limitKey: 'teacherPublishLimit', curKey: 'teacherPublishCurrent' }
  ];
  return defs.map(d => {
    const limit = pkg[d.limitKey] || 0;
    const current = pkg[d.curKey] || 0;
    const unlimited = limit <= 0;
    return { label: d.label, current, unlimited, limit, remain: unlimited ? null : Math.max(0, limit - current) };
  });
}
function infoRow(k, v) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px;border-bottom:1px solid #f0f2f5;font-size:14px;">
    <span style="color:#5a6478;">${escapeHtml(k)}</span>
    <span style="color:#1f2a44;text-align:right;">${v}</span>
  </div>`;
}

function renderTenantInfoPage() {
  const c = document.getElementById('dynamic-content-center');
  if (!c) return;
  c.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:#888;padding:30px;">加载中…</div></div>';

  // 1) 本租户基本信息
  request({ url: '/tenant/current', method: 'get' }).then(tenant => {
    const tenantId = tenant && tenant.id;
    // 2) 套餐 + 3) 套餐模板（均失败降级为 null，不影响主信息展示）
    Promise.all([
      tenantId ? request({ url: '/tenant/package/tenant/' + tenantId, method: 'get' }).catch(() => null) : Promise.resolve(null),
      (tenant && tenant.packageId) ? request({ url: '/package/template/' + tenant.packageId, method: 'get' }).catch(() => null) : Promise.resolve(null)
    ]).then(([pkg, tpl]) => {
      const rows = quotaRowsOf(pkg);
      const packageName = pkg ? (tpl && tpl.templateName ? tpl.templateName : '已配置（未命名模板）') : '未配置套餐';
      const packageCode = (pkg && tpl && tpl.templateCode) ? tpl.templateCode : '';
      c.innerHTML = `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><div class="card-title"><i class="fa fa-building"></i> 基本信息</div></div>
          <div>
            ${infoRow('租户编码', escapeHtml(tenant.tenantCode || '—'))}
            ${infoRow('机构名称', escapeHtml(tenant.orgName || '—'))}
            ${infoRow('状态', escapeHtml(tenantStatusText(tenant.status)))}
            ${infoRow('租期（到期）', escapeHtml(fmtDate(tenant.expireTime)))}
            ${infoRow('联系人', escapeHtml(tenant.contact || '—'))}
            ${infoRow('联系电话', escapeHtml(tenant.phone || '—'))}
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><div class="card-title"><i class="fa fa-box"></i> 套餐</div></div>
          <div>
            ${infoRow('当前套餐', escapeHtml(packageName))}
            ${packageCode ? infoRow('套餐编码', escapeHtml(packageCode)) : ''}
            ${pkg ? '' : infoRow('说明', '未配置套餐，资源不限额')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa fa-chart-pie"></i> 资源额度与余量</div></div>
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>资源</th><th>已用</th><th>限额</th><th>余量</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map(r => `
                  <tr>
                    <td>${escapeHtml(r.label)}</td>
                    <td>${r.current}</td>
                    <td>${r.unlimited ? '不限' : r.limit}</td>
                    <td>${r.unlimited ? '<span style="color:#1677ff;">不限</span>' : r.remain}</td>
                  </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:20px;">未配置套餐，暂无额度数据</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
      if (window.applyTerms) applyTerms(c);
    }).catch(() => {
      c.innerHTML = '<div class="card"><div class="card-body" style="color:#c00;">加载套餐信息失败</div></div>';
    });
  }).catch(() => {
    c.innerHTML = '<div class="card"><div class="card-body" style="color:#c00;">加载租户信息失败，请确认登录状态</div></div>';
  });
}
