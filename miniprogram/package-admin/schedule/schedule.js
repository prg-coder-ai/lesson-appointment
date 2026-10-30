// 租户管理端 · 课程排期（对应 admin.html 的"课程排期"）
// 列表来自 /course/schedule/list（自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

const STATUS_TEXT = { active: '已发布', frozen: '已冻结', pending: '待发布', inactive: '已下架' };

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
      const res = await request({ url: ENDPOINTS.SCHEDULE_LIST, method: 'GET', customErrorMsg: false }) || [];
      const rows = Array.isArray(res) ? res : (res && res.rows) || [];
      const list = rows.map(s => ({
        id: s.scheduleId,
        title: s.courseName || s.name || '未命名排期',
        teacher: s.teacherName || '',
        range: (s.startTime || '') + (s.endTime ? ' ~ ' + s.endTime : ''),
        status: s.status || 'pending',
        statusText: STATUS_TEXT[s.status] || s.status || '待发布'
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  }
}));
