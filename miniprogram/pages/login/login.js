import { request } from '../../core/request.js';
import { setSession, getSession } from '../../core/storage.js';
import { term, loadTermMap, syncIndustryFromTenant } from '../../core/term.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { homePageForRole } from '../../shared/constants.js';

const app = getApp();

Page({
  data: { account: '', password: '', tenantCode: '', submitting: false, brandTitle: '' },
  onLoad() {
    // 登录失效统一回到登录页
    app.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' });
    const s = getSession();
    if (s && s.token) wx.redirectTo({ url: homePageForRole(s.role) });
    this.setData({ brandTitle: term('lessonSystem') });
  },
  onAccount(e) { this.setData({ account: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onTenant(e) { this.setData({ tenantCode: e.detail.value }); },
  async onLogin() {
    const { account, password, tenantCode } = this.data;
    if (!account || !password) { wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      const res = await request({ url: ENDPOINTS.AUTH_LOGIN, method: 'POST', data: { account, password, tenantCode } });
      if (!res || !res.token) throw new Error((res && (res.message || res.msg)) || '登录失败');
      setSession(res);
      await loadTermMap();
      await syncIndustryFromTenant(res.tenantCode);
      wx.redirectTo({ url: homePageForRole(res.role) });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
