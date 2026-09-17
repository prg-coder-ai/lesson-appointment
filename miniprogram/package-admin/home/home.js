import { requireAuth } from '../../core/auth.js';
import { roleLabel, homePageForRole } from '../../shared/constants.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';

Page({
  data: { user: {}, roleText: '', active: 'home', unreadCount: 0 },
  onLoad(options) {
    captureAttribution(options); // 先抓取渠道归因，即便被重定向到登录页也不丢
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce(); // 登录态就绪后再上报一次
    this.setData({ user: u, roleText: roleLabel(u.role), active: 'home' });
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goDashboard() { wx.navigateTo({ url: '/package-admin/dashboard/dashboard' }); },
  goSensitive() { wx.showToast({ title: '敏感词管理即将上线', icon: 'none' }); },
  goTeachers() { wx.showToast({ title: '教师管理即将上线', icon: 'none' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); },
  // 分享带邀请人：好友打开后由 captureAttribution 抓取，形成获客闭环
  onShareAppMessage() {
    const u = this.data.user || {};
    const base = u.role ? homePageForRole(u.role) : '/pages/login/login';
    return { title: '邀请你使用预约系统', path: base + '?inviter=' + encodeURIComponent(u.userId || '') + '&source=share' };
  }
});
