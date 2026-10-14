import { login, getBoundTenantCode, goHome, wechatSilentLogin, wechatRegister, bindWechat } from '../../core/auth.js';
import { withTerms } from '../../core/term.js';
import { clearSession, storage, getSession } from '../../core/storage.js';
import { ROLES, PLATFORM_TENANT_CODE } from '../../shared/constants.js';
import { confirm } from '../../core/ui.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const ROLE_OPTIONS = [
  { role: ROLES.STUDENT, termKey: 'student', fallback: '学生' },
  { role: ROLES.TEACHER, termKey: 'teacher', fallback: '教师' },
  { role: ROLES.ADMIN, termKey: null, fallback: '管理' },
  { role: ROLES.PLATFORM_ADMIN, termKey: null, fallback: '平台' }
];

// 场景B 用户级签署留痕（Phase 2）：登录/微信注册成功后 fire-and-forget 调 /api/v1/legal/accept。
// 前置条件：会话已 setSession（request 层自动带 Bearer）；失败静默不阻断主流程；
// 后端按 uk_subject_doc 幂等 upsert，重复签署无副作用。
function recordLegalAccept() {
  (async () => {
    for (const dt of ['user_agreement', 'privacy_policy']) {
      try {
        await request({
          url: ENDPOINTS.LEGAL_ACCEPT,
          method: 'POST',
          data: { docType: dt, channel: 'miniprogram' },
          customErrorMsg: false
        });
      } catch (e) { /* 签署留痕失败不阻断登录/注册 */ }
    }
  })();
}

Page(withTerms({
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
  async onLoad(options) {
    const app = (typeof getApp === 'function') ? getApp() : null;
    if (app && app.globalData) app.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' });
    // 已登录直接进首页。注意：登录页本身不能用 requireAuth() 守卫——
    // 无登录态时 requireAuth() 会 wx.reLaunch('/pages/login/login') 即自身，造成无限自重开。
    const u = getSession();
    if (u && u.token && u.role) { goHome(); return; }
    const bound = getBoundTenantCode();
    // 扫码/分享链接带来的租户编码（推广路径2、微信直接注册都靠它）
    const tcode = (options && (options.tcode || options.tCode)) || '';
    this.setData({
      brandTitle: '预约系统',
      boundTenantCode: bound,
      tenantCode: bound || tcode
    });
    // 微信登录能力已就绪（2026-10-13）：先试静默登录，再按需走微信直接注册。
    // 两步都是静默降级 —— 失败/未绑定都只是继续显示密码登录表单，不报错、不打扰。
    try {
      const wxRes = await wechatSilentLogin();
      if (wxRes) { goHome(); return; }
      if (tcode) {
        const regRes = await wechatRegister({ tenantCode: tcode });
        if (regRes) { recordLegalAccept(); goHome(); return; }
      }
    } catch (e) { /* 静默降级 */ }
  },
  toggleBindWechat() { this.setData({ bindWechat: !this.data.bindWechat }); },
  onAccount(e) { this.setData({ account: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onTenant(e) {
    const raw = e.detail.value || '';
    const trimmed = raw.trim();
    // 输入平台保留字 platform（区分大小写以对齐后端）自动切换为平台管理员入口，
    // 直接命中"填 platform 登录失败"的现场 —— 无需额外选角色即可登录。
    if (trimmed === PLATFORM_TENANT_CODE) {
      this.setData({ tenantCode: PLATFORM_TENANT_CODE, role: ROLES.PLATFORM_ADMIN, isPlatformRole: true });
      return;
    }
    const patch = { tenantCode: raw };
    // 从平台标识改回普通租户编码时，自动退回默认角色，避免卡在平台管理员态
    if (this.data.role === ROLES.PLATFORM_ADMIN) {
      patch.role = ROLES.STUDENT;
      patch.isPlatformRole = false;
    }
    this.setData(patch);
  },
  onPickRole(e) {
    const role = e.currentTarget.dataset.role;
    const patch = { role, isPlatformRole: role === ROLES.PLATFORM_ADMIN || role === ROLES.ADMIN };
    // 平台管理员使用固定租户标识 platform，无需手填；切回其它角色时还原已绑定的租户编码
    if (role === ROLES.PLATFORM_ADMIN) {
      patch.tenantCode = PLATFORM_TENANT_CODE;
    } else if (this.data.tenantCode === PLATFORM_TENANT_CODE) {
      patch.tenantCode = this.data.boundTenantCode || '';
    }
    this.setData(patch);
  },
  clearBinding() {
    confirm('将解绑当前租户（' + this.data.boundTenantCode + '）并返回登录，确定？', { title: '切换租户' }).then((ok) => {
      if (!ok) return;
      const app2 = (typeof getApp === 'function') ? getApp() : null;
      try { if (app2 && app2.globalData) app2.globalData.onAuthFail = () => wx.reLaunch({ url: '/pages/login/login' }); } catch (e) {}
      // 解绑：清登录态 + 清绑定
      clearSession();
      storage.remove('boundTenantCode');
      this.setData({ boundTenantCode: '', tenantCode: '' });
    });
  },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openAgreement() {
    // Phase 2：跳真实协议阅读页（rich-text 渲染 /api/v1/legal/doc，免登录）
    wx.navigateTo({ url: '/pages/legal/legal' });
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
      // 勾选了「允许微信登录」→ 绑定当前微信，下次即可静默登录。
      // 绑定失败不影响已成功的密码登录态（bindWechat 内部静默返回 false）。
      if (this.data.bindWechat) {
        try { await bindWechat(); } catch (e) { /* 静默 */ }
      }
      // 场景B：登录成功落用户级签署留痕（幂等，fire-and-forget）
      recordLegalAccept();
      setTimeout(() => goHome(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
}));
