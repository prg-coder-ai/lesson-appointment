import { requireAuth } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { getUnreadCount } from '../../core/message.js';

Page({
  data: { user: {}, roleText: '', active: 'home', unreadCount: 0 },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
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
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); }
});
