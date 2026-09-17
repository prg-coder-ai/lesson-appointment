import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { list: [], loading: false, page: 1, finished: false, keyword: '' },
  onLoad() { this.load(); },
  onPullDownRefresh() {
    this.setData({ page: 1, list: [], finished: false });
    this.load().then(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { if (!this.data.finished && !this.data.loading) this.load(); },
  onSearch(e) { this.setData({ keyword: e.detail.value }); },
  onConfirmSearch() { this.setData({ page: 1, list: [], finished: false }); this.load(); },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'POST',
        data: { pageNum: this.data.page, pageSize: 10, keyword: this.data.keyword }
      });
      const rows = (res && (res.list || res.records)) || res || [];
      this.setData({
        list: this.data.page === 1 ? rows : this.data.list.concat(rows),
        finished: rows.length < 10, page: this.data.page + 1
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  goDetail(e) { wx.navigateTo({ url: '/package-student/booking/booking-detail?id=' + e.currentTarget.dataset.id }); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
