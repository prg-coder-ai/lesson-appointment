// 租户管理端 · 上课通知（对应 admin.html 的"预约检视 → 上课通知"）
// 展示本租户已确认（booked）的近期上课清单；批量提醒能力待后续接入消息中心。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

Page(withTerms({
  data: { list: [], loading: true },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST', customErrorMsg: false,
        data: { status: 'booked', pageNum: 1, pageSize: 50 }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const list = rows.map(b => ({
        id: b.bookingId,
        course: b.courseName || '',
        student: b.studentName || b.studentId || '',
        teacher: b.teacherName || '',
        time: b.startTime || ''
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
  onNotify() { wx.showToast({ title: '批量提醒能力建设中', icon: 'none' }); }
}));
