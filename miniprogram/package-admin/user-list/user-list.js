// 租户管理端 · 用户管理（教师 / 学生，对应 admin.html 的"教师管理"/"学生管理"）
// 通过 ?role=teacher|student 区分；列表来自 /user/page（自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

// 用户状态 → 文案。后端 User.status 是**字符串枚举**（active/pending/frozen/inactive），
// 不是数字码。此前写成 { 1:'正常', 0:'禁用', 2:'待审核' } 用数字键，
// STATUS_TEXT['active'] 恒为 undefined → 落到下面的 String(r.status) 兜底 → 列表直接显示英文 "active"。
// 文案口径与 Web 端 platform-admin-user.js 的 platformStatusText 对齐。
const STATUS_TEXT = { active: '正常', pending: '待审核', frozen: '已冻结', inactive: '停用' };

Page(withTerms({
  data: { role: 'teacher', roleText: '教师', list: [], loading: true, total: 0 },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const role = (options && options.role) === 'student' ? 'student' : 'teacher';
    const roleText = role === 'student' ? '学生' : '教师';
    this.setData({ role, roleText });
    wx.setNavigationBarTitle({ title: roleText + '管理' });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.USER_PAGE, method: 'GET', customErrorMsg: false,
        params: { role: this.data.role, pageNum: 1, pageSize: 50, status: '' }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const list = rows.map(r => ({
        id: r.userId,
        name: r.name || r.account || '未命名',
        account: r.account || '',
        phone: r.phone || '',
        email: r.email || '',
        status: r.status,
        statusText: STATUS_TEXT[r.status] != null ? STATUS_TEXT[r.status] : (r.status != null ? String(r.status) : '未知')
      }));
      this.setData({ list, total: (res && res.total) || list.length, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  }
}));
