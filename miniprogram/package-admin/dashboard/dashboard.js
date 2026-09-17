import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { tid: '', overview: {}, usage: {}, active: 'dashboard' },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ tid: u.tenantId });
    this.load();
  },
  async load() {
    try {
      const ov = await request({ url: ENDPOINTS.DASHBOARD_OVERVIEW, method: 'GET', customErrorMsg: false });
      this.setData({ overview: ov || {} });
    } catch (e) { this.setData({ overview: {} }); }
    if (this.data.tid) {
      try {
        const usage = await request({ url: ENDPOINTS.DASHBOARD_TENANT_USAGE(this.data.tid), method: 'GET', customErrorMsg: false });
        this.setData({ usage: usage || {} });
      } catch (e) { this.setData({ usage: {} }); }
    }
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
