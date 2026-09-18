// 租户管理端 · 课程列表（对应 admin.html 的"课程列表"）
// 列表来自 /course/page（自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const STATUS_TEXT = { 1: '已发布', 0: '草稿', 2: '已下架' };

Page({
  data: { list: [], loading: true, total: 0 },
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
        url: ENDPOINTS.COURSE_PAGE, method: 'GET', customErrorMsg: false,
        params: { pageNum: 1, pageSize: 50 }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const list = rows.map(c => ({
        id: c.courseId,
        name: c.courseName || '未命名课程',
        teacher: c.teacherName || '',
        level: c.difficultyLevel || '',
        statusText: STATUS_TEXT[c.status] != null ? STATUS_TEXT[c.status] : (c.status != null ? String(c.status) : '-')
      }));
      this.setData({ list, total: (res && res.total) || list.length, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  }
});
