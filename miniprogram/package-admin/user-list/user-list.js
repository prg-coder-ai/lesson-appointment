// 租户管理端 · 用户管理（教师 / 学生，对应 admin.html 的"教师管理"/"学生管理"）
// 通过 ?role=teacher|student 区分；列表来自 /user/page（自动按当前租户隔离）。
//
// 本页在只读列表之上补三类操作（对齐 Web 端管理页的按钮）：
//   · 禁用 / 启用：POST /user/updateStatus { userId, status }
//       禁用 = frozen（**不是** pending）：登录校验只在登录时查状态，
//       且 UserService.login 只对 frozen（"账号已冻结，请联系管理员"）与 inactive 拦登录，
//       pending 照常放行 —— 用 pending 当"禁用"等于按钮点了没生效。
//       同时**必须**追加 DELETE /auth/kick/{userId}，否则已签发的 token 在有效期内仍可继续操作。
//   · 重置密码：POST /user/account/changePassword?userId=&password=
//       管理员代管免原密码（Service 侧校验同租户），重置为固定默认密码。
//       刻意不用 /auth/password/reset —— 那个端点硬编码 "12345678"，与两端页面显示的口径不一致。
//   · 发消息：跳消息中心发送页，预填「指定用户ID」模式与接收人。
//
// 已知取舍（P2）：新密码经 **query string** 传给后端（与 Web 端 resetUserPasswd 完全同源），
// 会落到 Nginx access log。要消掉需要后端支持 JSON body 形态，属于接口变更，本期不动。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { confirm } from '../../core/ui.js';

// 用户状态 → 文案。后端 User.status 是**字符串枚举**（active/pending/frozen/inactive），
// 不是数字码。此前写成 { 1:'正常', 0:'禁用', 2:'待审核' } 用数字键，
// STATUS_TEXT['active'] 恒为 undefined → 落到下面的 String(r.status) 兜底 → 列表直接显示英文 "active"。
// 文案口径与 Web 端 platform-admin-user.js 的 platformStatusText 对齐。
const STATUS_TEXT = { active: '正常', pending: '待审核', frozen: '已冻结', inactive: '停用' };

// 状态筛选项（服务端 /user/page 的 status 是精准筛选）
const STATUS_OPTIONS = [
  { v: '', t: '全部' },
  { v: 'active', t: '正常' },
  { v: 'pending', t: '待审核' },
  { v: 'frozen', t: '已冻结' },
  { v: 'inactive', t: '停用' }
];

// 重置密码的目标值（与 Web 端 admin-user.js 的 resetUserPasswd / platform-admin-user.js 同口径）
const DEFAULT_PASSWORD = '123456';

const PAGE_SIZE = 20;
const MAX_PAGE = 50;

Page(withTerms({
  data: {
    role: 'teacher',
    roleText: '教师',
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    total: 0,
    pageNum: 0,
    statusOptions: STATUS_OPTIONS,
    statusIndex: 0,
    status: '',
    selfId: '',
    defaultPassword: DEFAULT_PASSWORD
  },

  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const role = (options && options.role) === 'student' ? 'student' : 'teacher';
    const roleText = role === 'student' ? '学生' : '教师';
    this.setData({ role, roleText, selfId: u.userId || '' });
    wx.setNavigationBarTitle({ title: roleText + '管理' });
    this.load(true);
  },

  async load(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const nextPage = reset ? 1 : this.data.pageNum + 1;
    if (!reset && !this.data.hasMore) return;
    if (nextPage > MAX_PAGE) return;

    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const res = await request({
        url: ENDPOINTS.USER_PAGE, method: 'GET', customErrorMsg: false,
        params: {
          role: this.data.role,
          pageNum: nextPage,
          pageSize: PAGE_SIZE,
          status: this.data.status || ''
        }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const mapped = rows.map(r => ({
        id: r.userId,
        name: r.name || r.account || '未命名',
        account: r.account || '',
        phone: r.phone || '',
        email: r.email || '',
        status: r.status,
        statusText: STATUS_TEXT[r.status] != null ? STATUS_TEXT[r.status] : (r.status != null ? String(r.status) : '未知'),
        // 状态决定按钮呈现：frozen → 可「启用」；其余 → 可「禁用」
        isFrozen: r.status === 'frozen',
        nextStatus: r.status === 'frozen' ? 'active' : 'frozen',
        nextText: r.status === 'frozen' ? '启用' : '禁用',
        tone: r.status === 'active' ? 'ok' : (r.status === 'frozen' ? 'bad' : 'warn'),
        // 不允许操作自己：禁用自己会把自己踢下线（Web 平台端同样屏蔽当前登录账号）
        isSelf: !!r.userId && r.userId === this.data.selfId
      }));

      const list = reset ? mapped : this.data.list.concat(mapped);
      const total = (res && res.total) || 0;
      this.setData({
        list,
        pageNum: nextPage,
        total: total || list.length,
        hasMore: rows.length >= PAGE_SIZE && (!total || list.length < total),
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false, list: reset ? [] : this.data.list });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value);
    const opt = STATUS_OPTIONS[idx] || { v: '' };
    if (opt.v === this.data.status) return;
    this.setData({ statusIndex: idx, status: opt.v });
    this.load(true);
  },
  onReset() {
    if (!this.data.status && this.data.statusIndex === 0) { this.load(true); return; }
    this.setData({ statusIndex: 0, status: '' });
    this.load(true);
  },

  /* ---------------- 禁用 / 启用 ---------------- */
  async onToggleStatus(e) {
    const { id, status, name } = e.currentTarget.dataset;
    if (!id || !status) return;
    const isDisable = status === 'frozen';
    const content = isDisable
      ? '禁用「' + name + '」？\n\n'
        + '· 该账号将无法登录（登录时提示"账号已冻结，请联系管理员"）；\n'
        + '· 其当前登录会话会被强制下线；\n'
        + '· 需要恢复时点同位置的「启用」。'
      : '启用「' + name + '」？\n\n启用后该账号可正常登录。';
    const ok = await confirm(content, { title: isDisable ? '禁用账号' : '启用账号' });
    if (!ok) return;

    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await request({
        url: ENDPOINTS.USER_UPDATE_STATUS, method: 'POST', customErrorMsg: false,
        data: { userId: id, status: status }
      });
      if (isDisable) {
        // 登录校验只在登录时查状态：不踢会话的话，已签发 token 在有效期内仍可继续操作。
        // 踢失败不阻塞主流程（状态已改成功，下次登录必被拦）。
        try {
          await request({ url: ENDPOINTS.AUTH_KICK(id), method: 'DELETE', customErrorMsg: false });
        } catch (ignore) { /* 无在线会话时后端返回 kick failed，忽略 */ }
      }
      wx.hideLoading();
      wx.showToast({ title: isDisable ? '已禁用' : '已启用', icon: 'success' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  /* ---------------- 重置密码 ---------------- */
  async onResetPwd(e) {
    const { id, name, account } = e.currentTarget.dataset;
    if (!id) return;
    const ok = await confirm(
      '将「' + name + '」（账号 ' + (account || '-') + '）的密码重置为默认密码 '
        + DEFAULT_PASSWORD + '？\n\n请重置后告知本人，并建议其登录后立即修改密码。',
      { title: '重置密码' }
    );
    if (!ok) return;

    wx.showLoading({ title: '重置中…', mask: true });
    try {
      await request({
        url: ENDPOINTS.CHANGE_PWD, method: 'POST', customErrorMsg: false,
        params: { userId: id, password: DEFAULT_PASSWORD }
      });
      wx.hideLoading();
      wx.showToast({ title: '密码已重置', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '重置失败', icon: 'none' });
    }
  },

  /* ---------------- 发消息 ---------------- */
  onSendMsg(e) {
    const { id, name, account } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: '/package-message/compose/compose?toUserId=' + encodeURIComponent(id)
        + '&toName=' + encodeURIComponent(name || account || '')
    });
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { this.load(false); }
}));
