import { login, getBoundTenantCode, goHome, requireAuth } from '../../core/auth.js';
import { term } from '../../core/term.js';
import { clearSession, storage } from '../../core/storage.js';
import { ROLES, roleLabel } from '../../shared/constants.js';

const ROLE_OPTIONS = [
  { role: ROLES.STUDENT, text: '学生端' },
  { role: ROLES.TEACHER, text: '教师端' },
  { role: ROLES.ADMIN, text: '管理端' }
];

Page({
  data: {
    account: '',
    password: '',
    tenantCode: '',
    role: ROLES.STUDENT,
    roleOptions: ROLE_OPTIONS,
    submitting: false,
    brandTitle: '',
    boundTenantCode: '',
    isPlatformRole: false
  },
  onLoad() {
    const app = (typeof getApp === 'function') ? getApp() : null;
    if (app && app.globalData) app.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' });
    if (requireAuth()) { goHome(); return; }
    const bound = getBoundTenantCode();
    this.setData({
      brandTitle: term('lessonSystem'),
      boundTenantCode: bound,
      tenantCode: bound
    });
  },
  onAccount(e) { this.setData({ account: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onTenant(e) { this.setData({ tenantCode: e.detail.value }); },
  onPickRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ role, isPlatformRole: role === ROLES.PLATFORM_ADMIN || role === ROLES.ADMIN });
  },
  clearBinding() {
    wx.showModal({
      title: '切换租户',
      content: '将解绑当前租户（' + this.data.boundTenantCode + '）并返回登录，确定？',
      success: (r) => {
        if (!r.confirm) return;
        const app2 = (typeof getApp === 'function') ? getApp() : null;
        try { if (app2 && app2.globalData) app2.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' }); } catch (e) {}
        // 解绑：清登录态 + 清绑定
        clearSession();
        storage.remove('boundTenantCode');
        this.setData({ boundTenantCode: '', tenantCode: '' });
      }
    });
  },
  async onLogin() {
    const { account, password, tenantCode, role } = this.data;
    if (!tenantCode) { wx.showToast({ title: '请输入租户编码 tCode', icon: 'none' }); return; }
    if (!account || !password) { wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return; }
    // 管理端：租户管理员需填真实 tCode；平台管理员固定 platform
    const finalTenant = role === ROLES.PLATFORM_ADMIN ? 'platform' : tenantCode;
    this.setData({ submitting: true });
    try {
      const res = await login({ tenantCode: finalTenant, account, password, role });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => goHome(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
