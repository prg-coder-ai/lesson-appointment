import { login, getBoundTenantCode, goHome } from '../../core/auth.js';
import { term } from '../../core/term.js';
import { clearSession, storage, getSession } from '../../core/storage.js';
import { ROLES } from '../../shared/constants.js';

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
    isPlatformRole: false,
    agreed: false,
    bindWechat: false
  },
  onLoad() {
    const app = (typeof getApp === 'function') ? getApp() : null;
    if (app && app.globalData) app.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' });
    // 已登录直接进首页。注意：登录页本身不能用 requireAuth() 守卫——
    // 无登录态时 requireAuth() 会 wx.reLaunch('/pages/login/login') 即自身，造成无限自重开。
    const u = getSession();
    if (u && u.token && u.role) { goHome(); return; }
    const bound = getBoundTenantCode();
    this.setData({
      brandTitle: term('lessonSystem'),
      boundTenantCode: bound,
      tenantCode: bound
    });
    // 暂不启用微信静默登录/绑定（用户确认先专注密码登录流程）：
    // 不在此自动调用 wechatSilentLogin，避免无谓的 /auth/wechat-login 请求干扰调试。
    // 待微信登录能力就绪后，可恢复 tryWechatAutoLogin() 调用。
  },
  toggleBindWechat() { this.setData({ bindWechat: !this.data.bindWechat }); },
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
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openAgreement() {
    // 占位：上线前需替换为真实《用户协议》《隐私政策》页面，并在微信公众平台配置隐私协议网址
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '登录即代表你同意我们依据《用户协议》《隐私政策》收集并处理你的账号与租户信息。正式版本请见小程序内隐私政策页。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
  async onLogin() {
    if (!this.data.agreed) { wx.showToast({ title: '请先阅读并同意用户协议', icon: 'none' }); return; }
    const { account, password, tenantCode, role } = this.data;
    if (!tenantCode) { wx.showToast({ title: '请输入租户编码 tCode', icon: 'none' }); return; }
    if (!account || !password) { wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return; }
    // 管理端：租户管理员需填真实 tCode；平台管理员固定 platform
    const finalTenant = role === ROLES.PLATFORM_ADMIN ? 'platform' : tenantCode;
    this.setData({ submitting: true });
    this._loginStarted = true;
    try {
      const res = await login({ tenantCode: finalTenant, account, password, role });
      wx.showToast({ title: '登录成功', icon: 'success' });
      // 暂不启用微信绑定（用户确认先专注密码登录流程）；待微信能力就绪再接回 bindWechat()。
      setTimeout(() => goHome(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
