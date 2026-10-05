// 发送通知：复刻 web 端 messages-inbox.js 的发送弹窗
// 接收方式：按范围（scope 自动解析接收人）/ 指定用户ID
// 范围选项随角色变化；平台管理员部分范围需填租户ID；分类编码来自消息分类树。

import { requireAuth } from '../../core/auth.js';
import { getCategories, sendMessage, getRecipients, canSend } from '../../core/message.js';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

// 角色 → 接收范围（对齐 web 端 composeScopes）
function composeScopes(role) {
  if (role === 'student') return [
    { scope: 'tenant_admin', label: '本租户管理员' },
    { scope: 'my_teachers', label: '我的任课教师' }
  ];
  if (role === 'teacher') return [
    { scope: 'tenant_admin', label: '本租户管理员' },
    { scope: 'my_students', label: '我的学生' }
  ];
  if (role === 'admin') return [
    { scope: 'platform_admin', label: '平台管理员' },
    { scope: 'teachers', label: '本租户教师' },
    { scope: 'students', label: '本租户学生' }
  ];
  if (role === 'platform_admin') return [
    { scope: 'platform_admin', label: '平台管理员' },
    { scope: 'tenant_admin', label: '租户管理员', needsTenant: true },
    { scope: 'teachers', label: '教师', needsTenant: true },
    { scope: 'students', label: '学生', needsTenant: true }
  ];
  return [];
}

// 解析「指定用户ID」文本框：兼容纯 ID 与「名称（账号）:ID」格式（截取冒号后真实用户ID）
function parseIds(str) {
  return (str || '').split(/[\s,，;；]+/).map(function (s) {
    s = s.trim();
    if (!s) return '';
    const i = s.lastIndexOf(':');
    if (i > 0) {
      const idPart = s.slice(i + 1).trim();
      if (idPart && !/[\s,，;；]/.test(idPart)) return idPart;
    }
    return s;
  }).filter(Boolean);
}

Page({
  data: {
    role: '',
    mode: 'scope',
    scopes: [],
    scopeIndex: 0,
    needTenant: false,
    tenantId: '',
    recipients: [],
    checkedIds: [],
    idsText: '',
    title: '',
    content: '',
    priorities: PRIORITIES,
    priorityIndex: 1,
    categories: [],   // [{code,name}]；首项为「不分类」(code='')
    catIndex: 0,
    categoryCode: '',
    sending: false
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    if (!canSend(u.role)) {
      wx.showToast({ title: '当前角色无权发送通知', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({ role: u.role, scopes: composeScopes(u.role) });
    this.syncTenant();
    this.loadCategories();
  },
  async loadCategories() {
    // 后端 CategoryController.tree() 返回扁平 List<MessageCategory>（字段 categoryCode/categoryName），非嵌套树
    const cats = await getCategories();
    const flat = [{ code: '', name: '（不分类）' }];
    (cats || []).forEach(c => {
      flat.push({ code: c.categoryCode, name: c.categoryName || c.categoryCode });
    });
    this.setData({ categories: flat, catIndex: 0, categoryCode: '' });
  },
  syncTenant() {
    const sc = this.data.scopes[this.data.scopeIndex] || {};
    this.setData({ needTenant: !!sc.needsTenant });
  },
  onModeChange(e) { this.setData({ mode: e.detail.value }); },
  onScopeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ scopeIndex: idx });
    this.syncTenant();
  },
  onTenantInput(e) { this.setData({ tenantId: e.detail.value }); },
  onIdsInput(e) { this.setData({ idsText: e.detail.value }); },
  onTitleInput(e) { this.setData({ title: e.detail.value }); },
  onContentInput(e) { this.setData({ content: e.detail.value }); },
  onPriorityChange(e) { this.setData({ priorityIndex: Number(e.detail.value) }); },
  onCategoryChange(e) {
    const idx = Number(e.detail.value);
    const cat = this.data.categories[idx] || { code: '' };
    this.setData({ catIndex: idx, categoryCode: cat.code });
  },

  async onLoadRecipients() {
    const sc = this.data.scopes[this.data.scopeIndex] || {};
    if (this.data.needTenant) {
      const tid = (this.data.tenantId || '').trim();
      if (!tid) { wx.showToast({ title: '请先填写租户ID', icon: 'none' }); return; }
    }
    wx.showLoading({ title: '加载接收人…', mask: true });
    try {
      const params = { scope: sc.scope };
      if (this.data.needTenant) params.tenantId = (this.data.tenantId || '').trim();
      const users = await getRecipients(params.scope, params.tenantId);
      const list = (users || []).map(u => ({
        userId: u.userId, name: u.name || u.userId || '未命名', role: u.role || '', checked: true
      }));
      this.setData({
        recipients: list,
        checkedIds: list.map(x => x.userId) // 默认全选
      });
      if (!list.length) wx.showToast({ title: '该范围暂无接收人', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '接收人解析失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  onRecipientChange(e) {
    const checked = e.detail.value || [];
    const map = {};
    checked.forEach(id => { map[id] = true; });
    const recipients = this.data.recipients.map(r => Object.assign({}, r, { checked: !!map[r.userId] }));
    this.setData({ recipients, checkedIds: checked });
  },

  async onSend() {
    const title = (this.data.title || '').trim();
    if (!title) { wx.showToast({ title: '请填写标题', icon: 'none' }); return; }
    let ids = [];
    if (this.data.mode === 'specific') {
      ids = parseIds(this.data.idsText);
    } else {
      ids = this.data.checkedIds.slice();
      if (!ids.length) { wx.showToast({ title: '请先加载并勾选接收人', icon: 'none' }); return; }
    }
    if (!ids.length) { wx.showToast({ title: '请至少选择一个接收人', icon: 'none' }); return; }
    if (this.data.sending) return;
    this.setData({ sending: true });
    wx.showLoading({ title: '发送中…', mask: true });
    const body = {
      title,
      content: this.data.content || '',
      priority: this.data.priorities[this.data.priorityIndex],
      recipientUserIds: ids,
      broadcast: false
    };
    if (this.data.categoryCode) body.categoryCode = this.data.categoryCode;
    try {
      await sendMessage(body);
      wx.hideLoading();
      wx.showToast({ title: '发送成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: (e && e.message) || '发送失败', icon: 'none' });
    } finally {
      this.setData({ sending: false });
    }
  }
});
