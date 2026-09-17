import { requireAuth } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { term } from '../../core/term.js';
import { getUnreadCount } from '../../core/message.js';

Page({
  data: {
    user: {}, roleText: '', industryText: '', active: 'home', greeting: '', unreadCount: 0
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    const h = new Date().getHours();
    const greeting = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    this.setData({
      user: u, roleText: roleLabel(u.role),
      industryText: term('industryName'), active: 'home', greeting
    });
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goBooking() { wx.navigateTo({ url: '/package-student/booking/booking' }); },
  goMyBooking() { wx.navigateTo({ url: '/package-student/my-booking/my-booking' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); }
});
