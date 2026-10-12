// 消息详情：复刻 web 端 detail/已发详情
// - 收件箱/收藏（from=inbox/starred）：打开即标记已读；支持标已读/未读、收藏/取消、删除(移回收站)
// - 回收站（from=trash）：支持恢复、彻底删除
// - 已发（from=sent）：拉投递状态，展示接收/已读统计（sender 视角无单条操作，撤回/彻底删除在列表页进行）
// 分类 / 优先级 / 发送者类型一律展示**文案**（编码→文案的映射集中在 core/message.js）：
// 详情接口只回 categoryCode + priority 编码，直接在页面上贴出来就是裸编码，必须过映射。

import { requireAuth } from '../../core/auth.js';
import {
  getDetail, setRead, toggleStar, deleteMessage, fmtTime,
  getDeliveryStatus, restore, purge, isManager, deleteSentGlobal,
  categoryText, priorityCode, priorityText, senderTypeText, resolveSender,
  getMessageRecipients, getUserBriefs, recipientStateText,
  getTenantList, tenantText
} from '../../core/message.js';
import { confirm } from '../../core/ui.js';

Page({
  data: {
    uid: '', mid: '', from: 'inbox', role: '', isManager: false,
    msg: null, starred: false, unread: true, loading: true,
    delivery: null,
    // 「已发 / 消息管理」详情：接收人明细（分页，触底加载更多）
    recipients: [], recTotal: 0, recPage: 1, recLoading: false
  },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const mid = options && options.mid;
    const from = (options && options.from) || 'inbox';
    this.setData({ uid: u.userId, mid, from, role: u.role || '', isManager: isManager(u.role) });
    this.load(mid, from);
  },
  async load(mid, from) {
    this.setData({ loading: true });
    try {
      if (from === 'sent' || from === 'manage') {
        // 已发 / 本租户管理：拉投递追踪（含正文与接收/已读统计）
        const d = await getDeliveryStatus(mid);
        this.setData({
          delivery: {
            title: d.title || '(无标题)',
            content: d.content || '',
            recipientCount: Number(d.recipientCount) || 0,
            readCount: Number(d.readCount) || 0
          },
          loading: false
        });
        // 不 await：接收人明细独立分页加载，不拖住正文与统计的渲染
        this.loadRecipients(mid, 1);
        return;
      }
      const d = await getDetail(this.data.uid, mid);
      const msg = {
        title: d.title || '(无标题)',
        content: d.content || d.body || '',
        // 分类/优先级：编码进映射，界面不出现 categoryCode / HIGH 这类裸编码
        category: categoryText(d.categoryCode, d.categoryName),
        priorityCode: priorityCode(d.priority),
        priority: priorityText(d.priority),
        senderType: d.senderType || '',
        // 发送者：先落「类型」文案兜底（教师/管理员/平台管理员/系统），
        // 姓名与账号异步补齐（见 loadSender），补不到也不会空着
        senderLabel: senderTypeText(d.senderType) || '系统',
        senderAccount: '',
        senderId: d.senderId || '',
        // 发送方租户：后端回的是 tenantId（消息所属租户=发送者租户），公司名要经 /tenant/list 映射，
        // 只有平台管理员需要也才有权限取 → 先留空，见 loadSenderTenant（空则不渲染那一行）
        senderTenantId: d.senderTenantId || 0,
        senderTenantText: '',
        time: fmtTime(d.sendTime || d.createTime)
      };
      const unread = !d.isRead;
      const starred = !!d.isStarred;
      this.setData({ msg, unread, starred, loading: false });
      if (unread) {
        try { await setRead(this.data.uid, mid, true); } catch (e) {}
        this.setData({ unread: false });
      }
      // 不 await：发送者姓名/账号是增强信息，不阻塞正文与已读回执的渲染
      this.loadSender();
      this.loadSenderTenant();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  /**
   * 补齐发送者「姓名 + 账号」。
   * 账号可见范围：管理员走 /user/page?userId=（能拿到 account）；
   * 学生/教师走 /user/name/{id}（只有姓名，拿账号的接口是管理面权限，不对普通角色开放）。
   * 文案形态：张三（教师）+ 账号行；查不到姓名时退化为类型文案（教师/管理员…），不留空白。
   */
  async loadSender() {
    const m = this.data.msg;
    if (!m || !m.senderId || m.senderType === 'system') return;
    const p = await resolveSender(m.senderId, m.senderType, { isAdmin: this.data.isManager });
    const typeText = senderTypeText(m.senderType);
    const cur = this.data.msg;
    // 期间用户可能已经退出/切页，或 msg 已被替换（重新加载）→ 丢弃这次结果
    if (!cur || cur.senderId !== m.senderId) return;
    const name = p.name || p.account || '';
    this.setData({
      'msg.senderName': p.name || '',
      'msg.senderAccount': p.account || '',
      'msg.senderLabel': name ? (name + (typeText ? '（' + typeText + '）' : '')) : (typeText || '系统')
    });
  },

  /**
   * 平台管理员专属：把「发送方租户」的 tenantId 映射成公司名（org_name）。
   *
   * 只在 platform_admin 身份下取数：/tenant/list 是 PLATFORM_ONLY，其他角色调用必 403，
   * 而这个字段对其他角色也没有意义（同租户内消息的发送方租户就是自己）。租户/学生/教师的详情页与改造前一致。
   * 无兜底文案：senderTenantId ≤ 0（平台自身发出）或字典查不到（租户已删 / 名单拉取失败）时
   * 保持空串，WXML 里整行不渲染 ——「没有租户」在平台视角下就是有效语义。
   */
  async loadSenderTenant() {
    if (this.data.role !== 'platform_admin') return;
    const cur = this.data.msg;
    if (!cur || !(Number(cur.senderTenantId) > 0)) return;
    await getTenantList();                       // 会话内只拉一次（模块级缓存）
    const text = tenantText(cur.senderTenantId);
    if (!text) return;
    const now = this.data.msg;                   // 期间可能已切页/重新加载 → 丢弃这次结果
    if (!now || String(now.senderTenantId) !== String(cur.senderTenantId)) return;
    this.setData({ 'msg.senderTenantText': text });
  },

  /**
   * 接收人明细（分页；触底加载更多）。
   * 两段式渲染：先出「userId + 状态」（一次请求，列表立即可用），再把本页 userId 批量送
   * /user/briefs 补姓名/账号（一页一次请求，避免逐人反查），姓名到手后与已有行合并重渲染。
   * 姓名/账号属增强信息，拿不到就退回 userId，不阻断列表。
   * 顺序由后端保证：未读优先，组内按投递顺序。
   */
  async loadRecipients(mid, pageNum) {
    if (!mid || this.data.recLoading) return;
    if (pageNum <= 1) this.setData({ recipients: [], recTotal: 0 });
    this.setData({ recLoading: true });
    let rows = [];
    try {
      const box = await getMessageRecipients(mid, { pageNum: pageNum, pageSize: 20 });
      rows = (box && box.rows) || [];
      this.setData({ recTotal: box ? (Number(box.total) || 0) : 0 });
    } catch (e) {
      this.setData({ recLoading: false });
      wx.showToast({ title: (e && e.message) || '接收人明细加载失败', icon: 'none' });
      return;
    }
    if (!this._recBriefs) this._recBriefs = {};
    // 只补「本页还没解析过」的 id：翻页/重入不重复请求
    const missing = rows.map((r) => r.userId).filter((id) => id && !this._recBriefs[id]);
    if (missing.length) {
      const briefs = await getUserBriefs(missing);   // 任何失败返回 {}，静默降级
      Object.keys(briefs).forEach((id) => { this._recBriefs[id] = briefs[id]; });
    }
    const base = pageNum <= 1 ? [] : this.data.recipients;
    const merged = base.concat(rows.map((r) => this.toRecRow(r, this._recBriefs)));
    this.setData({ recipients: merged, recPage: pageNum, recLoading: false });
  },

  /** 接收人行 → 视图模型（文案与样式类都在 js 里算好：WXML 绑定禁止函数调用） */
  toRecRow(r, briefs) {
    const b = (briefs || {})[r.userId] || {};
    const st = recipientStateText(r);
    // 已读显示阅读时间，未读显示投递/确认时间（看得出「何时送达但未读」）
    const t = (r.isRead && r.readTime) ? r.readTime : (r.deliveryTime || r.ackTime || '');
    return {
      userId: r.userId,
      name: b.name || r.userId || '',   // 姓名拿不到就显示 userId：可核对的线索胜过空白
      account: b.account || '',          // 仅管理员拿得到，空则不渲染括号
      stateText: st.text,
      stateCls: st.cls,
      time: fmtTime(t)
    };
  },

  // 触底加载下一页接收人（仅「已发 / 消息管理」视图有该列表）
  onReachBottom() {
    if (this.data.from !== 'sent' && this.data.from !== 'manage') return;
    if (this.data.recLoading) return;
    if (this.data.recipients.length >= this.data.recTotal) return;
    this.loadRecipients(this.data.mid, this.data.recPage + 1);
  },
  async onToggleStar() {
    const next = !this.data.starred;
    try {
      await toggleStar(this.data.uid, this.data.mid, this.data.starred);
      this.setData({ starred: next });
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
    }
  },
  async onToggleRead() {
    const next = !this.data.unread;
    try {
      await setRead(this.data.uid, this.data.mid, next);
      this.setData({ unread: next });
      wx.showToast({ title: next ? '已标为已读' : '已标为未读', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
    }
  },
  async onDelete() {
    const ok = await confirm('确定删除这条消息？将移入回收站。', { title: '删除消息' });
    if (!ok) return;
    try {
      await deleteMessage(this.data.uid, this.data.mid);
      wx.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
    }
  },
  async onRestore() {
    try {
      await restore(this.data.uid, this.data.mid);
      wx.showToast({ title: '已恢复', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '恢复失败', icon: 'none' });
    }
  },
  async onPurge() {
    const ok = await confirm('彻底删除后不可恢复，确定永久删除这条消息？', { title: '彻底删除' });
    if (!ok) return;
    try {
      await purge(this.data.uid, this.data.mid);
      wx.showToast({ title: '已彻底删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
    }
  },
  async onManageDelete() {
    const ok = await confirm('彻底删除该消息？\n将永久删除主消息、所有收件人的收件箱副本及投递记录，且无法恢复！', { title: '彻底删除' });
    if (!ok) return;
    try {
      await deleteSentGlobal(this.data.mid);
      wx.showToast({ title: '已彻底删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
    }
  }
});
