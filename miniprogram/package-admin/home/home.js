// 租户管理端 · 概览（功能枢纽）
// 按网页版 admin.html 的功能分组组织入口，点击进入对应功能页。
// 注意：本页是"租户管理员"视角，仅包含 admin.html 的功能（不含平台管理端的
// 租户管理 / 套餐管理 / 运营统计 / 系统设置 / 后台信息等平台级功能）。

import { requireAuth } from '../../core/auth.js';
import { roleLabel, ROLES } from '../../shared/constants.js';
import { getCurrentTenant } from '../../core/tenant.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { withTerms, getTermMap, registerTermUpdate, unregisterTermUpdate } from '../../core/term.js';

// 菜单文案：含行业词（课程/教师/学生）的用 { t: 词根, s: 后缀 } 表达，运行时按当前行业词表解析；
// 纯文案项保持字符串。t 取值见 shared/domain/term.js 的 TERM_DICT 词根（course/teacher/student…）。
// 租户管理员菜单（admin.html 视角，不含平台级功能）
const TENANT_GROUPS = [
  { title: '系统概览', items: [
    { text: '数据总览', page: '/package-admin/dashboard/dashboard' }
  ] },
  { title: { t: 'course', s: '管理' }, items: [
    { text: { t: 'course', s: '模板' }, page: '/package-admin/course-template/course-template' },
    { text: { t: 'course', s: '列表' }, page: '/package-admin/course-list/course-list' }
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
    { text: { t: 'student', s: '管理' }, page: '/package-admin/user-list/user-list?role=student' },
    // 管理员：职能角色，各行业叫法一致，不进行业词表（与 Web 端 admin.html 菜单同口径）
    { text: '管理员管理', page: '/package-admin/user-list/user-list?role=admin' }
  ] },
  { title: '消息中心', items: [
    { text: '消息中心', page: '/package-message/inbox/inbox' },
    { text: '消息管理', page: '/package-message/inbox/inbox?folder=manage' },
    { text: '租户与套餐', page: '/package-admin/tenant-info/tenant-info' }
  ] },
  { title: '系统维护', items: [
    { text: '数据维护', page: '/package-admin/data-maintain/data-maintain' },
    { text: '审计日志', page: '/package-admin/audit-log/audit-log' },
    { text: '推广统计', page: '/package-admin/promo-stats/promo-stats' }
  ] }
];

// 平台管理员菜单（参考 web platform_admin.html 的三组结构：平台运营 / 系统配置 / 系统维护）
// soon:true 的项仅展示菜单、暂不接通跳转：
//   · 按要求：系统配置全组（消息分类管理 / 敏感词管理 / 系统设置）+ 套餐管理 仅展示；
//   · 其余暂无对应小程序页面的平台级功能（平台总览 / 租户管理 / 用户管理 / 运营统计 / 系统日志 / 后台信息）
//     也以"建设中"展示，避免指向不存在的页面造成坏链。
// 有现成小程序页面的（平台推广统计 / 我的推广 / 消息中心 / 消息管理 / 审计日志）正常跳转。
const PLATFORM_GROUPS = [
  { title: '平台运营', items: [
    { text: '平台总览', soon: true },
    { text: '租户管理', soon: true },
    { text: '用户管理', soon: true },
    { text: '套餐管理', soon: true },
    { text: '运营统计', soon: true },
    { text: '平台推广统计', page: '/package-admin/promo-stats/promo-stats' },
    { text: '我的推广', page: '/pages/promo/promo' },
    { text: '消息中心', page: '/package-message/inbox/inbox' },
    { text: '消息管理', page: '/package-message/inbox/inbox?folder=manage' }
  ] },
  { title: '系统配置', items: [
    { text: '消息分类管理', soon: true },
    { text: '敏感词管理', soon: true },
    { text: '系统设置', soon: true }
  ] },
  { title: '系统维护', items: [
    { text: '系统日志', soon: true },
    { text: '审计日志', page: '/package-admin/audit-log/audit-log' },
    { text: '后台信息', soon: true }
  ] }
];

// 把 { t, s } 词根规格解析成行业词文案；纯字符串原样返回（兜底用词根 key 自身）。
function resolveText(spec, terms) {
  if (typeof spec === 'string') return spec;
  return (terms[spec.t] != null ? terms[spec.t] : spec.t) + (spec.s || '');
}

// 用当前行业词表解析整棵菜单（组标题 + 各入口文本），供 setData 渲染。
// groups 入参区分角色：平台管理员用 PLATFORM_GROUPS，其余用 TENANT_GROUPS。
function buildGroups(groups, terms) {
  return groups.map(g => ({
    title: resolveText(g.title, terms),
    items: g.items.map(it => ({ text: resolveText(it.text, terms), page: it.page || '', soon: !!it.soon }))
  }));
}

// 按角色选取菜单：平台管理员展示参考 web platform_admin.html 的平台级菜单，
// 其余角色（租户管理员等）沿用原有租户级菜单，互不串台。
function groupsForRole(role, terms) {
  return buildGroups(role === ROLES.PLATFORM_ADMIN ? PLATFORM_GROUPS : TENANT_GROUPS, terms);
}

// 角色展示名：租户管理员在顶部统一显示为"管理员"（去掉"租户"前缀）；其余角色沿用 roleLabel。
// 仅作用于小程序端这两个页面顶部的角色文案，不改共享 roleLabel（避免波及 Web）。
function displayRole(role) {
  if (role === ROLES.ADMIN) return '管理员';
  return roleLabel(role);
}

Page(withTerms({
  data: { user: {}, roleText: '', active: 'home', unreadCount: 0, tenantName: '', groups: buildGroups(TENANT_GROUPS, getTermMap()) },
  onLoad(options) {
    captureAttribution(options);
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce();
    this.setData({ user: u, roleText: displayRole(u.role), active: 'home', groups: groupsForRole(u.role, getTermMap()) });
    // 行业词表（含服务端租户自定义词）加载完成 / 切换后，重新解析菜单文案（按角色重选，避免串台）
    this.__groupsListener = () => this.setData({ groups: groupsForRole(u.role, getTermMap()) });
    registerTermUpdate(this.__groupsListener);
    this.loadTenantName(u);
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    // 每次展示也按最新词表刷新（覆盖服务端词表晚于首屏到达的情况）；同时按角色重选菜单
    this.setData({ groups: groupsForRole((u && u.role) || '', getTermMap()) });
    if (u && u.tenantCode) this.loadTenantName(u);
  },
  // 取当前租户的公司名称（orgName）替换顶部的租户编码展示；缺省回退 tenantCode
  loadTenantName(u) {
    getCurrentTenant().then(t => {
      const name = (t && t.orgName) || (u && u.tenantCode) || '';
      if (this.data.tenantName !== name) this.setData({ tenantName: name });
    }).catch(() => {});
  },
  onUnload() {
    if (this.__groupsListener) unregisterTermUpdate(this.__groupsListener);
  },
  onTapItem(e) {
    const ds = e.currentTarget.dataset;
    // 仅展示菜单（soon）：不跳转，提示建设中，避免误导用户以为功能可用
    if (ds.soon) {
      wx.showToast({ title: '功能建设中，敬请期待', icon: 'none' });
      return;
    }
    const page = ds.page;
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
