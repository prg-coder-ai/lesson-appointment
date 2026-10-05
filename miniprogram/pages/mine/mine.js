import { requireAuth, logout, switchTenant } from '../../core/auth.js';
import { roleLabel, ROLES } from '../../shared/constants.js';
import { getCurrentTenant } from '../../core/tenant.js';
import { INDUSTRY_NAMES } from '../../shared/terms.js';
import { withTerms, setLang, loadTermMap, getIndustry } from '../../core/term.js';
import { storage } from '../../core/storage.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { getUnreadCount } from '../../core/message.js';
import { confirm } from '../../core/ui.js';

// 角色展示名：租户管理员在顶部统一显示为"管理员"（去掉"租户"前缀）；其余角色沿用 roleLabel。
// 仅作用于小程序端这两个页面顶部的角色文案，不改共享 roleLabel（避免波及 Web）。
function displayRole(role) {
  if (role === ROLES.ADMIN) return '管理员';
  return roleLabel(role);
}

Page(withTerms({
  data: {
    user: {}, roleText: '', industryText: '', lang: 'zh', active: 'mine', unreadCount: 0, tenantName: '',
    showPwd: false, oldPwd: '', newPwd: '', confirmPwd: '', saving: false
  },
  onShow() {
    const u = requireAuth();
    if (!u) return;
    this.setData({
      user: u, roleText: displayRole(u.role),
      industryText: INDUSTRY_NAMES[getIndustry()] || getIndustry(), lang: storage.get('lang') || 'zh', active: 'mine'
    });
    if (u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    this.loadTenantName(u);
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
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); }
}));
