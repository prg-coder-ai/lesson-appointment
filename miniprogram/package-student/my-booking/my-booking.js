import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const STATUS_TEXT = {
  waiting: '候补', booked: '已预约', canceling: '取消中',
  cancelled: '已取消', non_occupying: '已释放'
};

Page({
  data: { list: [], loading: false },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
        data: { pageNum: 1, pageSize: 20, studentId: u.userId }
      });
      const rows = (res && (res.list || res.records)) || res || [];
      this.setData({
        list: rows.map(it => Object.assign({}, it, {
          statusText: STATUS_TEXT[it.status] || it.status || '未知',
          canCancel: it.status === 'booked' || it.status === 'waiting'
        }))
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  cancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消预约', content: '确定取消该预约？', success: async (r) => {
        if (!r.confirm) return;
        try {
          await request({ url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST', data: { id, status: 'cancelled' } });
          wx.showToast({ title: '已取消', icon: 'success' });
          this.load();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
        }
      }
    });
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
