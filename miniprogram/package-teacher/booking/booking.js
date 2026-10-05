import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { bookingStatusText } from '../../shared/domain/bookingState.js';
import { confirm } from '../../core/ui.js';

Page({
  data: { list: [], loading: false, page: 1, finished: false, status: '', keyword: '' },
  onLoad() { this.load(); },
  onPullDownRefresh() {
    this.setData({ page: 1, list: [], finished: false });
    this.load().then(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { if (!this.data.finished && !this.data.loading) this.load(); },
  onStatusFilter(e) {
    this.setData({ status: e.currentTarget.dataset.s, page: 1, list: [], finished: false });
    this.load();
  },
  onSearchInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() {
    this.setData({ page: 1, list: [], finished: false });
    this.load();
  },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const u = requireAuth();
      if (!u) return;
      const kw = this.data.keyword.trim();
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
        data: {
          pageNum: this.data.page, pageSize: 10,
          status: this.data.status || undefined,
          courseName: kw || undefined,
          userId: u.userId, userRole: u.role
        }
      });
      let rows = (res && (res.list || res.records)) || res || [];
      // 客户端兜底：若后端未对 courseName 过滤，则本地按课程名/学生名匹配
      if (kw) {
        const lk = kw.toLowerCase();
        rows = rows.filter(r =>
          (r.courseTitle || r.title || '').toLowerCase().includes(lk) ||
          (r.studentName || '').toLowerCase().includes(lk));
      }
      const list = rows.map(r => ({
        bookingId: r.bookingId,
        title: r.courseTitle || r.title || '课程',
        sub: r.studentName || ('学生 ' + (r.studentId || '')),
        time: r.timeText || '',
        status: r.status,
        statusText: r.statusText || bookingStatusText(r.status)
      }));
      this.setData({
        list: this.data.page === 1 ? list : this.data.list.concat(list),
        finished: rows.length < 10,
        page: this.data.page + 1
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  async act(e) {
    const { id, status, label } = e.currentTarget.dataset;
    const ok = await confirm('确定' + label + '该预约？', { title: '确认' });
    if (!ok) return;
    try {
      await request({ url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST', data: { bookingId: id, status } });
      wx.showToast({ title: label + '成功', icon: 'none' });
      this.setData({ page: 1, list: [], finished: false });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
