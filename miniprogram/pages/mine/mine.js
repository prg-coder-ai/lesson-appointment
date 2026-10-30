import { requireAuth, logout, switchTenant, unbindWechat, getWechatStatus, bindWechat } from '../../core/auth.js';
import { roleLabel, ROLES } from '../../shared/constants.js';
import { getCurrentTenant } from '../../core/tenant.js';
import { INDUSTRY_NAMES } from '../../shared/terms.js';
import { withTerms, setLang, loadTermMap, getIndustry, getTermMap } from '../../core/term.js';
import { storage } from '../../core/storage.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { getUnreadCount } from '../../core/message.js';
import { confirm } from '../../core/ui.js';

// 角色展示名（仅小程序端顶部，不改共享 roleLabel 以免波及 Web）：
// - 平台管理员 → 平台管理员；租户管理员 → 管理员（去掉"租户"前缀）
// - 教师 / 学生 → 走行业词表（terms.teacher / terms.student），随行业切换
function displayRole(role, terms) {
  if (role === ROLES.PLATFORM_ADMIN) return '平台管理员';
  if (role === ROLES.ADMIN) return '管理员';
  if (role === ROLES.TEACHER) return (terms && terms.teacher) || '教师';
  if (role === ROLES.STUDENT) return (terms && terms.student) || '学生';
  return roleLabel(role);
}

Page(withTerms({
  data: {
    user: {}, roleText: '', industryText: '', lang: 'zh', active: 'mine', unreadCount: 0, tenantName: '',
    showPwd: false, oldPwd: '', newPwd: '', confirmPwd: '', saving: false,
    // 微信绑定状态：默认按"未绑定"呈现，避免未查询前就误显「解绑」
    wechatBound: false, wechatAuto: false, wechatStatusText: '绑定'
  },
  onShow() {
    const u = requireAuth();
    if (!u) return;
    this.setData({
      user: u, roleText: displayRole(u.role, getTermMap()),
      industryText: INDUSTRY_NAMES[getIndustry()] || getIndustry(), lang: storage.get('lang') || 'zh', active: 'mine'
    });
    if (u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    this.loadTenantName(u);
    this.loadWechatStatus();
  },
  // 查询微信绑定状态并按状态推导展示文案（对齐 web 端 getWechatBindStatus）：
  // 未绑定 →「绑定」（点击发起绑定）；已绑定 manual →「解绑」；auto_register →「已绑定」（禁止解绑）。
  loadWechatStatus() {
    getWechatStatus().then(({ bound, bindSource }) => {
      const auto = bindSource === 'auto_register';
      this.setData({
        wechatBound: bound,
        wechatAuto: auto,
        wechatStatusText: bound ? (auto ? '已绑定' : '解绑') : '绑定'
      });
    }).catch(() => {
      this.setData({ wechatBound: false, wechatAuto: false, wechatStatusText: '绑定' });
    });
  },
  // 微信绑定行点击：按状态分流 —— 未绑定则发起绑定，已绑定（manual）则解绑，
  // auto_register 账号禁止解绑（该类账号 account=openid、password 随机，解绑即永久失联）。
  async onWechatTap() {
    if (!this.data.wechatBound) {
      const ok = await this.doBindWechat();
      return ok;
    }
    if (this.data.wechatAuto) {
      wx.showToast({ title: '该账号由微信直接注册，无法解绑', icon: 'none' });
      return;
    }
    this.onUnbindWechat();
  },
  // 在小程序侧发起微信绑定（web 端无 wx.login() 故只能查/解，小程序可以绑）。
  async doBindWechat() {
    const ok = await bindWechat();
    if (ok) {
      wx.showToast({ title: '已绑定微信', icon: 'success' });
      this.loadWechatStatus();
    } else {
      wx.showToast({ title: '绑定失败，请稍后重试', icon: 'none' });
    }
    return ok;
  },
  // 取当前租户的公司名称（orgName）替换顶部的租户编码展示；缺省回退 tenantCode
  loadTenantName(u) {
    getCurrentTenant().then(t => {
      const name = (t && t.orgName) || (u && u.tenantCode) || '';
      if (this.data.tenantName !== name) this.setData({ tenantName: name });
    }).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  pickLang(e) {
    const lang = e.currentTarget.dataset.lang;
    setLang(lang);
    loadTermMap();
    this.setData({ lang, industryText: INDUSTRY_NAMES[getIndustry()] || getIndustry() });
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
    confirm('确定退出当前账号？', { title: '退出登录' }).then((ok) => { if (ok) logout(); });
  },
  onSwitch() {
    confirm('将解绑当前租户（' + (this.data.user.tenantCode || '') + '）并返回登录，确定？', { title: '切换租户' }).then((ok) => { if (ok) switchTenant(); });
  },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goPromo() { wx.navigateTo({ url: '/pages/promo/promo' }); },
  // 解绑微信：auto_register（微信直接注册）的账号会被后端拒绝（400），
  // 因为这类账号 account=openid、password 随机，解绑后就再也登不进来了。
  async onUnbindWechat() {
    const ok = await confirm('解绑后将无法用微信免输入登录，确定？', { title: '解绑微信' });
    if (!ok) return;
    const done = await unbindWechat();
    if (done) {
      wx.showToast({ title: '已解绑', icon: 'success' });
      this.loadWechatStatus();
    } else {
      wx.showToast({ title: '解绑失败', icon: 'none' });
    }
  }
}));
