import { requireAuth, logout, switchTenant } from '../../core/auth.js';
import { roleLabel } from '../../shared/constants.js';
import { term, setLang, loadTermMap } from '../../core/term.js';
import { storage } from '../../core/storage.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { getUnreadCount } from '../../core/message.js';

Page({
  data: {
    user: {}, roleText: '', industryText: '', lang: 'zh', active: 'mine', unreadCount: 0,
    showPwd: false, oldPwd: '', newPwd: '', confirmPwd: '', saving: false
  },
  onShow() {
    const u = requireAuth();
    if (!u) return;
    this.setData({
      user: u, roleText: roleLabel(u.role),
      industryText: term('industryName'), lang: storage.get('lang') || 'zh', active: 'mine'
    });
    if (u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  pickLang(e) {
    const lang = e.currentTarget.dataset.lang;
    setLang(lang);
    loadTermMap();
    this.setData({ lang, industryText: term('industryName') });
    wx.showToast({ title: '已切换语言', icon: 'none' });
  },
  togglePwd() { this.setData({ showPwd: !this.data.showPwd }); },
  onOld(e) { this.setData({ oldPwd: e.detail.value }); },
  onNew(e) { this.setData({ newPwd: e.detail.value }); },
  onConfirm(e) { this.setData({ confirmPwd: e.detail.value }); },
  async savePwd() {
    const { oldPwd, newPwd, confirmPwd } = this.data;
    if (!oldPwd || !newPwd) { wx.showToast({ title: '请输入密码', icon: 'none' }); return; }
    if (newPwd !== confirmPwd) { wx.showToast({ title: '两次新密码不一致', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      await request({ url: ENDPOINTS.CHANGE_PWD, method: 'POST', data: { oldPassword: oldPwd, newPassword: newPwd } });
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.setData({ showPwd: false, oldPwd: '', newPwd: '', confirmPwd: '' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '修改失败', icon: 'none' });
    } finally { this.setData({ saving: false }); }
  },
  onLogout() {
    wx.showModal({ title: '退出登录', content: '确定退出当前账号？', success: (r) => { if (r.confirm) logout(); } });
  },
  onSwitch() {
    wx.showModal({ title: '切换租户', content: '将解绑当前租户（' + (this.data.user.tenantCode || '') + '）并返回登录，确定？', success: (r) => { if (r.confirm) switchTenant(); } });
  },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); }
});
