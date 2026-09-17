import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { id: '', course: {}, loading: false },
  onLoad(query) {
    this.setData({ id: query.id || '' });
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({ url: ENDPOINTS.COURSE_DETAIL(this.data.id), method: 'GET' });
      this.setData({ course: res || {} });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  book(e) {
    const scheduleId = e.currentTarget.dataset.sid;
    const courseId = e.currentTarget.dataset.cid;
    const u = requireAuth();
    if (!u) return;
    wx.showModal({
      title: '确认预约', content: '确认预约该时段？', success: async (r) => {
        if (!r.confirm) return;
        try {
          await request({
            url: ENDPOINTS.BOOKING_CREATE, method: 'POST',
            data: { scheduleId, courseId, studentId: u.userId, studentName: u.name }
          });
          wx.showToast({ title: '预约成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '预约失败', icon: 'none' });
        }
      }
    });
  }
});
