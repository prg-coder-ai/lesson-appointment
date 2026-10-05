// 租户管理端 · 概览（功能枢纽）
// 按网页版 admin.html 的功能分组组织入口，点击进入对应功能页。
// 注意：本页是"租户管理员"视角，仅包含 admin.html 的功能（不含平台管理端的
// 租户管理 / 套餐管理 / 运营统计 / 系统设置 / 后台信息等平台级功能）。

import { requireAuth } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { withTerms, getTermMap, registerTermUpdate, unregisterTermUpdate } from '../../core/term.js';

// 菜单文案：含行业词（课程/教师/学生）的用 { t: 词根, s: 后缀 } 表达，运行时按当前行业词表解析；
// 纯文案项保持字符串。t 取值见 shared/domain/term.js 的 TERM_DICT 词根（course/teacher/student…）。
const GROUPS = [
  { title: '系统概览', items: [
    { text: '数据总览', page: '/package-admin/dashboard/dashboard' }
  ] },
  { title: '租户与套餐', items: [
    { text: '租户信息', page: '/package-admin/tenant-info/tenant-info' }
  ] },
  { title: '排期与预订', items: [
    { text: { t: 'course', s: '排期' }, page: '/package-admin/schedule/schedule' },
    { text: '预订审核', page: '/package-admin/booking-audit/booking-audit' }
  ] },
  { title: '预约检视', items: [
    { text: '上课通知', page: '/package-admin/lesson-notice/lesson-notice' }
  ] },
  { title: '用户管理', items: [
    { text: { t: 'teacher', s: '管理' }, page: '/package-admin/user-list/user-list?role=teacher' },
    { text: { t: 'student', s: '管理' }, page: '/package-admin/user-list/user-list?role=student' }
  ] },
  { title: '消息中心', items: [
    { text: '消息中心', page: '/package-message/inbox/inbox' },
    { text: '消息管理', page: '/package-message/inbox/inbox?folder=manage' },
    { text: '敏感词管理', page: '/package-admin/sensitive/sensitive' }
  ] },
  { title: { t: 'course', s: '管理' }, items: [
    { text: { t: 'course', s: '模板' }, page: '/package-admin/course-template/course-template' },
    { text: { t: 'course', s: '列表' }, page: '/package-admin/course-list/course-list' }
  ] },
  { title: '系统维护', items: [
    { text: '数据维护', page: '/package-admin/data-maintain/data-maintain' },
    { text: '审计日志', page: '/package-admin/audit-log/audit-log' }
  ] }
];

// 把 { t, s } 词根规格解析成行业词文案；纯字符串原样返回（兜底用词根 key 自身）。
function resolveText(spec, terms) {
  if (typeof spec === 'string') return spec;
  return (terms[spec.t] != null ? terms[spec.t] : spec.t) + (spec.s || '');
}

// 用当前行业词表解析整棵菜单（组标题 + 各入口文本），供 setData 渲染。
function buildGroups(terms) {
  return GROUPS.map(g => ({
    title: resolveText(g.title, terms),
    items: g.items.map(it => ({ text: resolveText(it.text, terms), page: it.page }))
  }));
}

Page(withTerms({
  data: { user: {}, roleText: '', active: 'home', unreadCount: 0, groups: buildGroups(getTermMap()) },
  onLoad(options) {
    captureAttribution(options);
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce();
    this.setData({ user: u, roleText: roleLabel(u.role), active: 'home', groups: buildGroups(getTermMap()) });
    // 行业词表（含服务端租户自定义词）加载完成 / 切换后，重新解析菜单文案
    this.__groupsListener = () => this.setData({ groups: buildGroups(getTermMap()) });
    registerTermUpdate(this.__groupsListener);
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    // 每次展示也按最新词表刷新（覆盖服务端词表晚于首屏到达的情况）
    this.setData({ groups: buildGroups(getTermMap()) });
  },
  onUnload() {
    if (this.__groupsListener) unregisterTermUpdate(this.__groupsListener);
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
