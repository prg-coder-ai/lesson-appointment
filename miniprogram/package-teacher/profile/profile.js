import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { tid: '', profile: {}, active: 'profile' },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ tid: u.userId });
    this.load();
  },
  async load() {
    try {
      const res = await request({ url: ENDPOINTS.TEACHER_PUBLISHED_LATEST(this.data.tid), method: 'GET', customErrorMsg: false });
      this.setData({ profile: res || {} });
    } catch (e) {
      this.setData({ profile: {} });
    }
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
