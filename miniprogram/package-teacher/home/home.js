import { requireAuth } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { term } from '../../core/term.js';
import { getUnreadCount } from '../../core/message.js';

Page({
  data: { user: {}, roleText: '', active: 'home', greeting: '', unreadCount: 0 },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    const h = new Date().getHours();
    const greeting = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    this.setData({ user: u, roleText: roleLabel(u.role), active: 'home', greeting });
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goCourses() { wx.navigateTo({ url: '/package-teacher/courses/courses' }); },
  goProfile() { wx.navigateTo({ url: '/package-teacher/profile/profile' }); },
  goSchedule() { wx.navigateTo({ url: '/package-teacher/schedule/schedule' }); },
  goMyBooking() { wx.showToast({ title: '学生预约查看即将上线', icon: 'none' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); }
});
