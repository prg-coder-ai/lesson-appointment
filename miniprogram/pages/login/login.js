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
    bindWechat: false,
    // 登录人机验证（2026-10-22 P1）
    showCaptcha: false,
    challengeData: null
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
        // 2026-10-24：注册成功 ≠ 可登录。pending 账号后端不再发 token，此处必须停下来提示等待审核，
        // 不能 goHome（没有会话会立刻被 requireAuth 弹回来，表现为"闪一下又回登录页"）。
        if (regRes && regRes.pending) {
          wx.showModal({
            title: '注册成功',
            content: '账号已提交，等待管理员审核通过后即可使用微信登录。',
            showCancel: false
          });
          return;
        }
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
      // 登录风控（P1）：设备标识随请求上报，采集失败按"无标识"处理，不阻断登录
      const dev = this.collectDevice();
      const res = await this.doLoginWithGuard({
        tenantCode: finalTenant,
        account,
        password,
        role,
        deviceId: dev.deviceId,
        emuFlag: dev.emuFlag
      });
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
      const msg = (e && (e.bodyMsg || e.message)) || '登录失败';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 带人机验证的登录（2026-10-22 P1）。
   *
   * 与服务端 code=1002 配对：收到 1002 → 弹滑块 → 带答案重试，最多再试 2 次。
   * 为什么要限次数：答错 → 服务端重新出题 → 答错 会变成无限循环，
   * 用户会觉得"卡死了"，还不如明确失败一次。
   */
  async doLoginWithGuard(base) {
    let attempt = 0;
    let extra = {};
    for (;;) {
      try {
        return await login(Object.assign({}, base, extra));
      } catch (e) {
        const chData = this.challengeOf(e);
        if (!chData || attempt >= 2) throw e;
        attempt++;
        const ans = await this.promptCaptcha(chData);
        if (!ans) throw e;      // 用户取消 → 原样抛出，由 onLogin 提示
        extra = {
          challengeId: chData.challengeId || '',
          moveX: ans.moveX,
          trackPoints: ans.trackPoints,
          costMs: ans.costMs
        };
      }
    }
  },

  /** 从错误对象里识别挑战（request 层对 1002 已挂 code 与 raw）。 */
  challengeOf(e) {
    if (!e) return null;
    if (e.code === 1002) return (e.raw && e.raw.data) || {};
    if (e.raw && e.raw.code === 1002) return e.raw.data || {};
    return null;
  },

  /** 显示滑块并等待作答；取消时 resolve(null)。 */
  promptCaptcha(chData) {
    return new Promise((resolve) => {
      this._captchaResolve = resolve;
      this.setData({ showCaptcha: true, challengeData: chData });
    });
  },

  onCaptchaDone(e) {
    this.setData({ showCaptcha: false });
    const r = this._captchaResolve;
    this._captchaResolve = null;
    if (r) r((e && e.detail) || null);
  },

  onCaptchaCancel() {
    this.setData({ showCaptcha: false });
    const r = this._captchaResolve;
    this._captchaResolve = null;
    if (r) r(null);
  },

  /**
   * 采集设备标识（P1 风险评分的输入）。
   *
   * 说明：这是**降权信号**而非唯一判据——wx.setStorageSync 可清、改机工具能伪造整组环境字段，
   * 所以服务端只把它算进风险分（+20 新设备 / +40 该设备换过身份），不用于黑名单。
   * 新版 API（wx.getDeviceInfo / wx.getAppBaseInfo）优先，旧基础库回退 getSystemInfoSync。
   */
  collectDevice() {
    const out = { deviceId: '', emuFlag: false };
    try {
      let d = {};
      let a = {};
      if (typeof wx.getDeviceInfo === 'function') {
        d = wx.getDeviceInfo() || {};
      }
      if (typeof wx.getAppBaseInfo === 'function') {
        a = wx.getAppBaseInfo() || {};
      }
      if ((!d.brand && !d.model) && typeof wx.getSystemInfoSync === 'function') {
        d = wx.getSystemInfoSync() || {};
      }
      const raw = [d.brand || '', d.model || '', d.system || '', d.platform || '',
                   a.SDKVersion || '', a.language || '', d.pixelRatio || ''].join('|');
      out.deviceId = 'm' + this.hash32(raw);
    } catch (e) { /* 采集失败按"无设备标识"处理（服务端 +10 分），绝不阻断登录 */ }
    return out;
  },

  /** 32 位非加密哈希：只用于"同一台设备是否同一串"，不需要抗碰撞强度。 */
  hash32(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
  }
}));
