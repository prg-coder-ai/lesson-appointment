// 租户管理端 · 预订审核（对应 admin.html 的"预订审核"）
// 列表来自 /course/booking/page（自动按当前租户隔离）；审核动作调用 /course/booking/updateStatus。
// 状态语义（与网页端一致）：booking=预定待确认 / cancelling=取消待确认 /
//   booked=已确认 / rej-booking=已拒绝预订 / cancelled=已取消 / rej-cancelling=已拒绝取消。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const STATUS_TEXT = {
  booking: '待确认', waiting: '候补', cancelling: '取消待确认',
  booked: '已确认', 'rej-booking': '已拒预订', cancelled: '已取消',
  'rej-cancelling': '已拒取消', frozen: '已冻结', delete: '已删除'
};

const FILTERS = [
  { key: 'booking', text: '待确认' },
  { key: 'cancelling', text: '取消待确认' },
  { key: '', text: '全部' }
];

Page({
  data: { filter: 'booking', filters: FILTERS, list: [], loading: true },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const f = (options && options.status) || 'booking';
    this.setData({ filter: FILTERS.some(x => x.key === f) ? f : 'booking' });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST', customErrorMsg: false,
        data: { status: this.data.filter, pageNum: 1, pageSize: 50 }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const list = rows.map(b => ({
        id: b.bookingId,
        course: b.courseName || '',
        student: b.studentName || b.studentId || '',
        teacher: b.teacherName || '',
        time: b.startTime || '',
        status: b.status,
        statusText: STATUS_TEXT[b.status] || b.status || '-'
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
  onFilter(e) {
    const f = e.currentTarget.dataset.f;
    if (f === this.data.filter) return;
    this.setData({ filter: f });
    this.load();
  },
  async audit(e) {
    const { id, action } = e.currentTarget.dataset;
    const tip = action === 'booked' ? '确认预定' : (action === 'rej-booking' ? '拒绝预定'
      : (action === 'cancelled' ? '确认取消' : '拒绝取消'));
    wx.showModal({ title: tip, content: '确定执行该操作？', success: async (r) => {
      if (!r.confirm) return;
      try {
        await request({ url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST', data: { id, status: action } });
        wx.showToast({ title: '已更新', icon: 'success' });
        this.load();
      } catch (err) { wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }); }
    } });
  }
});
