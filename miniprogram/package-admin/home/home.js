// 租户管理端 · 概览（功能枢纽）
// 按网页版 admin.html 的功能分组组织入口，点击进入对应功能页。
// 注意：本页是"租户管理员"视角，仅包含 admin.html 的功能（不含平台管理端的
// 租户管理 / 套餐管理 / 运营统计 / 系统设置 / 后台信息等平台级功能）。

import { requireAuth } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { withTerms } from '../../core/term.js';

const GROUPS = [
  { title: '系统概览', items: [
    { text: '数据总览', page: '/package-admin/dashboard/dashboard' }
  ] },
  { title: '排期与预订', items: [
    { text: '课程排期', page: '/package-admin/schedule/schedule' },
    { text: '预订审核', page: '/package-admin/booking-audit/booking-audit' }
  ] },
  { title: '预约检视', items: [
    { text: '上课通知', page: '/package-admin/lesson-notice/lesson-notice' }
  ] },
  { title: '用户管理', items: [
    { text: '教师管理', page: '/package-admin/user-list/user-list?role=teacher' },
    { text: '学生管理', page: '/package-admin/user-list/user-list?role=student' }
  ] },
  { title: '消息中心', items: [
    { text: '消息中心', page: '/package-message/inbox/inbox' },
    { text: '敏感词管理', page: '/package-admin/sensitive/sensitive' }
  ] },
  { title: '课程管理', items: [
    { text: '课程模板', page: '/package-admin/course-template/course-template' },
    { text: '课程列表', page: '/package-admin/course-list/course-list' }
  ] },
  { title: '系统维护', items: [
    { text: '数据维护', page: '/package-admin/data-maintain/data-maintain' },
    { text: '审计日志', page: '/package-admin/audit-log/audit-log' }
  ] }
];

Page(withTerms({
  data: { user: {}, roleText: '', active: 'home', unreadCount: 0, groups: GROUPS },
  onLoad(options) {
    captureAttribution(options);
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce();
    this.setData({ user: u, roleText: roleLabel(u.role), active: 'home' });
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
  },
  onTapItem(e) {
    const page = e.currentTarget.dataset.page;
    if (!page) return;
    wx.navigateTo({ url: page });
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); },
  onShareAppMessage() {
    const u = this.data.user || {};
    const base = u.role ? '/package-admin/home/home' : '/pages/login/login';
    return { title: '邀请你使用预约系统', path: base + '?inviter=' + encodeURIComponent(u.userId || '') + '&source=share' };
  }
}));
