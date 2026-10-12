// 租户管理端 · 租户信息（只读，对标平台管理员"租户管理 / 额度"）
// 展示本租户的 tenantCode / 租期 / 套餐 / 各资源额度与余量；全部只读，无编辑 / 续期 / 变更入口。

import { requireAuth } from '../../core/auth.js';
import { withTerms } from '../../core/term.js';
import {
  getCurrentTenant, getTenantPackage, getPackageTemplate,
  tenantStatusText, toQuotaRows
} from '../../core/tenant.js';

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

Page(withTerms({
  data: {
    loading: true,
    tenant: null,      // 基本信息
    packageName: '',
    packageCode: '',
    hasPackage: false,
    quotaRows: []      // 资源额度与余量
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    this.setData({ loading: true });
    try {
      const tenant = await getCurrentTenant();
      const tenantId = tenant && tenant.id;
      const [pkg, tpl] = await Promise.all([
        getTenantPackage(tenantId),
        (tenant && tenant.packageId) ? getPackageTemplate(tenant.packageId) : Promise.resolve(null)
      ]);
      this.setData({
        loading: false,
        tenant: {
          tenantCode: tenant.tenantCode || '—',
          orgName: tenant.orgName || '—',
          statusText: tenantStatusText(tenant.status),
          expireTime: fmtDate(tenant.expireTime),
          contact: tenant.contact || '—',
          phone: tenant.phone || '—'
        },
        packageName: pkg ? (tpl && tpl.templateName ? tpl.templateName : '已配置（未命名模板）') : '未配置套餐',
        packageCode: (pkg && tpl && tpl.templateCode) ? tpl.templateCode : '',
        hasPackage: !!pkg,
        quotaRows: toQuotaRows(pkg)
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  }
}));
