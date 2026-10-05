import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

// 课程状态：对齐前端 teacher-courseAndScheduleBrowserCards.js（pending/inactive/active/frozen）
const STATUS_TEXT = {
  pending: '待发布',
  inactive: '已收回',
  active: '已发布',
  frozen: '已冻结'
};

Page({
  data: { list: [], loading: false, active: 'courses' },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'GET',
        params: { pageNum: 1, pageSize: 20, teacherId: u.userId }
      });
      const rows = (res && (res.list || res.records)) || res || [];
      const list = rows.map(r => ({
        courseId: r.courseId,
        name: r.courseName || r.title || '未命名课程',
        content: r.content || '',
        feature: r.feature || '',
        status: r.status || 'pending',
        statusText: STATUS_TEXT[r.status] || r.status || '待发布'
      }));
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  // 点课程 → 查看该课程排期（对齐前端 my_course 点进看排期）
  goSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/package-teacher/schedule/schedule?courseId=' + id });
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
