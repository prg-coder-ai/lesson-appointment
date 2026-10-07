// 租户管理端 · 课程列表（对应 admin.html 的"课程列表"）
// 列表来自 /course/page（自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

// 课程状态 → 文案。后端 Course.status 是字符串枚举（active/pending/frozen/inactive）；
// 此前用数字键 { 1:'已发布', 0:'草稿', 2:'已下架' } → STATUS_TEXT['active'] 恒 undefined
// → 列表显示英文 "active"。文案口径与同 package 下 schedule/schedule.js 的 STATUS_TEXT 对齐。
const STATUS_TEXT = { active: '已发布', pending: '待发布', frozen: '已冻结', inactive: '已下架' };

Page(withTerms({
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
}));
