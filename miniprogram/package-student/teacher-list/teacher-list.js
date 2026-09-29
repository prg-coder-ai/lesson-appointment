import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { list: [], loading: false },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.tenantCode = u.tenantCode || '';
    this.load();
  },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.TEACHER_PUBLIC_LIST(this.tenantCode),
        method: 'GET', tokenOnly: true
      });
      const rows = (res && (res.list || res)) || [];
      const list = rows.map(p => ({
        id: p.id,
        name: p.title || p.name || '教师',
        headline: p.headline || '',
        summary: p.intro || p.highlights || '暂无介绍'
      }));
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  goProfile(e) { wx.navigateTo({ url: '/package-student/teacher-profile/teacher-profile?id=' + e.currentTarget.dataset.id }); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
