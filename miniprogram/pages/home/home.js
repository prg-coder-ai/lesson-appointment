import { getSession, clearSession } from '../../core/storage.js';
import { term } from '../../core/term.js';

Page({
  data: { role: '', name: '', brandTitle: '' },
  onLoad() {
    const s = getSession();
    if (!s || !s.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    this.setData({ role: s.role, name: s.name || s.account, brandTitle: term('lessonSystem') });
  },
  onLogout() {
    clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },
  goDemo() { wx.navigateTo({ url: '/pages/demo/demo' }); }
});
