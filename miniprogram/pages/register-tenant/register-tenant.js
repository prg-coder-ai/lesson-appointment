// 路径1 自助建租户 + 首管理员（Phase 2 场景A 原生表单）。
// 提交 POST /api/v1/promo/register-tenant（免登录），成功落「租户级签署」由后端 register-tenant
// 事务内统一写入（SUBJECT_TENANT）；本页再补「首管理员用户级签署」（SUBJECT_USER，复用返回 token）。
// 与 web login.html 免费体验表单同契约（PromoRegisterTenantDTO），仅多 channel=miniprogram。

import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { setSession } from '../../core/storage.js';
import { goHome } from '../../core/auth.js';

Page({
  data: {
    ref: '',
    orgName: '',
    account: '',
    name: '',
    phone: '',
    password: '',
    password2: '',
    industries: [],
    industryIndex: '',     // picker 选中下标；提交时由 industries[industryIndex].id 推导
    agreed: false,
    submitting: false,
    done: false,
    tenantCode: '',
    trialDays: 14
  },

  onLoad(options) {
    const ref = (options && options.ref) || '';
    this.setData({ ref });
    this.loadIndustries();
  },

  async loadIndustries() {
    try {
      // 免登录：行业字典选项（INDUSTRY_OPTIONS）；失败时提交由后端兜底默认行业
      const list = await request({
        url: ENDPOINTS.INDUSTRY_OPTIONS,
        method: 'GET',
        tokenOnly: true,
        customErrorMsg: false
      });
      if (Array.isArray(list) && list.length) {
        this.setData({ industries: list, industryIndex: 0 });
      }
    } catch (e) { /* 下拉失败不打扰，提交时后端兜底 */ }
  },

  onOrg(e) { this.setData({ orgName: e.detail.value }); },
  onAccount(e) { this.setData({ account: e.detail.value }); },
  onName(e) { this.setData({ name: e.detail.value }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onPwd(e) { this.setData({ password: e.detail.value }); },
  onPwd2(e) { this.setData({ password2: e.detail.value }); },
  onIndustry(e) { this.setData({ industryIndex: e.detail.value }); },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openAgreement() { wx.navigateTo({ url: '/pages/legal/legal' }); },

  async onSubmit() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.orgName || !d.account || !d.password) {
      wx.showToast({ title: '机构名称、管理员账号、密码不能为空', icon: 'none' });
      return;
    }
    if (d.password !== d.password2) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }
    if (d.industryIndex === '' || d.industryIndex == null) {
      wx.showToast({ title: '请选择所属行业', icon: 'none' });
      return;
    }
    if (!d.agreed) {
      wx.showToast({ title: '请先阅读并同意用户协议与隐私政策', icon: 'none' });
      return;
    }
    const ind = d.industries[d.industryIndex];
    this.setData({ submitting: true });
    try {
      const data = await request({
        url: ENDPOINTS.PROMO_REGISTER_TENANT,
        method: 'POST',
        data: {
          referralCode: d.ref,
          orgName: d.orgName.trim(),
          industryId: ind ? ind.id : null,
          account: d.account.trim(),
          name: (d.name || '').trim(),
          phone: (d.phone || '').trim(),
          password: d.password,
          source: 'miniprogram',
          channel: 'miniprogram'
        },
        customErrorMsg: false
      });
      // 首管理员用户级签署（场景B，SUBJECT_USER）—— 后端已写租户级（场景A），此处补用户级
      if (data && data.token) {
        try { setSession(data); } catch (e) { /* session 写入失败不阻断 */ }
        try {
          for (const dt of ['user_agreement', 'privacy_policy']) {
            await request({
              url: ENDPOINTS.LEGAL_ACCEPT,
              method: 'POST',
              data: { docType: dt, channel: 'miniprogram' },
              customErrorMsg: false
            });
          }
        } catch (e) { /* 签署留痕失败不影响入驻 */ }
      }
      this.setData({
        done: true,
        tenantCode: data.tenantCode || '',
        trialDays: data.trialDays || 14
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '注册失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  enter() { goHome(); }
});
