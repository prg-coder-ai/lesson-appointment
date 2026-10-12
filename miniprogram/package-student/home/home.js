import { requireAuth } from '../../core/auth.js';
import { roleLabel, homePageForRole, ROLES } from '../../shared/constants.js';
import { withTerms, term } from '../../core/term.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { getCurrentTenant } from '../../core/tenant.js';

Page(withTerms({
  data: {
    user: {}, roleText: '', industryText: '', active: 'home', greeting: '', unreadCount: 0, tenantName: ''
  },
  onLoad(options) {
    captureAttribution(options); // 先抓取渠道归因，即便被重定向到登录页也不丢
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce(); // 登录态就绪后再上报一次
    const h = new Date().getHours();
    const greeting = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    this.setData({
      user: u, roleText: roleLabel(u.role),
      active: 'home', greeting
    });
    this.loadTenantName(u);
    this.applyTitle();
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    this.loadTenantName(u);
    this.applyTitle();
  },
  // 导航栏标题随行业变：学生端 / 客户端 / 来访者端 / 学员端
  applyTitle() {
    wx.setNavigationBarTitle({ title: term('student', '学生') + '端' });
  },
  // 取当前租户的公司名称（orgName）替换顶部的租户编码展示；缺省回退 tenantCode
  loadTenantName(u) {
    getCurrentTenant().then(t => {
      const name = (t && t.orgName) || (u && u.tenantCode) || '';
      if (this.data.tenantName !== name) this.setData({ tenantName: name });
    }).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goBooking() { wx.navigateTo({ url: '/package-student/booking/booking' }); },
  goMyBooking() { wx.navigateTo({ url: '/package-student/my-booking/my-booking' }); },
  goAppointment() { wx.navigateTo({ url: '/package-student/appointment/appointment' }); },
  goTeacherList() { wx.navigateTo({ url: '/package-student/teacher-list/teacher-list' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); },
  // 分享带邀请人：好友打开后由 captureAttribution 抓取，形成获客闭环
  onShareAppMessage() {
    const u = this.data.user || {};
    const base = u.role ? homePageForRole(u.role) : '/pages/login/login';
    return { title: '邀请你使用预约系统', path: base + '?inviter=' + encodeURIComponent(u.userId || '') + '&source=share' };
  }
}));
