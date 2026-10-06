import { requireAuth } from '../../core/auth.js';
import { roleLabel, homePageForRole, ROLES } from '../../shared/constants.js';
import { term, withTerms } from '../../core/term.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { getCurrentTenant } from '../../core/tenant.js';

Page(withTerms({
  data: { user: {}, roleText: '', active: 'home', greeting: '', unreadCount: 0, tenantName: '' },
  onLoad(options) {
    captureAttribution(options); // 先抓取渠道归因，即便被重定向到登录页也不丢
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce(); // 登录态就绪后再上报一次
    const h = new Date().getHours();
    const greeting = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    this.setData({ user: u, roleText: roleLabel(u.role), active: 'home', greeting });
    this.loadTenantName(u);
    this.applyTitle();
  },
  // 导航栏标题接行业词（教师端 / 律师端 / 咨询师端 / 教练端）。
  // 标题**需要**随行业变，故保留运行时 wx.setNavigationBarTitle；json 的 navigationBarTitleText 仅作首帧兜底。
  // onShow 每次重设，兜住「行业切换后返回本页」的场景（json 不支持动态，只能运行时改）。
  applyTitle() {
    wx.setNavigationBarTitle({ title: term('teacher', '教师') + '端' });
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    this.loadTenantName(u);
    this.applyTitle();
  },
  // 取当前租户的公司名称（orgName）替换顶部的租户编码展示；缺省回退 tenantCode
  loadTenantName(u) {
    getCurrentTenant().then(t => {
      const name = (t && t.orgName) || (u && u.tenantCode) || '';
      if (this.data.tenantName !== name) this.setData({ tenantName: name });
    }).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goCourses() { wx.navigateTo({ url: '/package-teacher/courses/courses' }); },
  // 「我的简介」「个人中心」两个工作台图标入口已隐藏（wxml 里用注释块屏蔽），
  // 底部导航仍有对应入口，功能不丢；方法保留，恢复入口时无需重写。
  goProfile() { wx.navigateTo({ url: '/package-teacher/profile/profile' }); },
  goSchedule() { wx.navigateTo({ url: '/package-teacher/schedule/schedule' }); },
  goAppointment() { wx.navigateTo({ url: '/package-teacher/appointment/appointment' }); },
  goMyBooking() { wx.navigateTo({ url: '/package-teacher/booking/booking' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  // 个人中心入口同上，已从工作台隐藏（底部导航「我的」即此页）
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); },
  // 分享带邀请人：好友打开后由 captureAttribution 抓取，形成获客闭环
  onShareAppMessage() {
    const u = this.data.user || {};
    const base = u.role ? homePageForRole(u.role) : '/pages/login/login';
    return { title: '邀请你使用预约系统', path: base + '?inviter=' + encodeURIComponent(u.userId || '') + '&source=share' };
  }
}));
