import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { list: [], loading: false, active: 'courses' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'POST',
        data: { pageNum: 1, pageSize: 20, teacherId: u.userId }
      });
      const rows = (res && (res.list || res.records)) || res || [];
      this.setData({ list: rows });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
