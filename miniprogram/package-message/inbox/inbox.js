// 消息中心：复刻 web 端 messages-inbox.js
// 收件箱 / 收藏 / 回收站 / 已发 四标签页；关键词搜索；仅看未读；分类筛选；
// 选择模式 + 批量已读/批量删除（回收站为彻底删除）；全部已读；单条操作（标已读/未读、收藏、删除移回收站、恢复、彻底删除）；
// 发送通知入口；已发撤回 / 管理员彻底删除。小程序无 SSE，未读以轮询实现即时更新。

import { requireAuth } from '../../core/auth.js';
import {
  getUnreadCount, getInbox, getCategories,
  getSent, toInboxItem, toSentItem,
  batchRead, batchDelete, batchPurge,
  restore, purge, getMessageIds,
  recallMessage, deleteSentGlobal,
  canSend, isManager, setRead, toggleStar, deleteMessage
} from '../../core/message.js';
import { confirm } from '../../core/ui.js';

const POLL_MS = 20000; // 轮询间隔

Page({
  data: {
    uid: '', role: '', canSend: false, isManager: false, showSent: false,
    folder: 'inbox',
    list: [], loading: false, refreshing: false,
    unreadCount: 0,
    onlyUnread: false, categories: [], activeCategory: '',
    keyword: '', pageNum: 1, pageSize: 20, total: 0, finished: false,
    selecting: false, selectedCount: 0
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    const role = u.role;
    this.setData({
      uid: u.userId, role,
      canSend: canSend(role), isManager: isManager(role), showSent: canSend(role)
    });
    this._active = true;
    this._polling = false;
    this.loadCategories();
    this.refresh();
  },
  onShow() {
    this._active = true;
    if (this.data.uid && !this.data.loading) this.refresh(false);
    else if (this.data.uid) this.silentReload();
  },
  onHide() { this._active = false; },
  onUnload() { this._active = false; this.stopPolling(); },
  onPullDownRefresh() { this.refresh(true); },
  onReachBottom() { this.loadMore(); },

  async loadCategories() {
    // 后端 CategoryController.tree() 返回扁平 List<MessageCategory>（字段 categoryCode/categoryName/categoryLevel/parentId），非嵌套树
    const cats = await getCategories();
    const flat = (cats || []).map(c => ({
      code: c.categoryCode,
      name: c.categoryName || c.categoryCode,
      level: c.categoryLevel || 1
    }));
    this.setData({ categories: flat });
  },

  // 拉取当前文件夹列表 + 未读数。pull=true 处理下拉刷新收尾
  async refresh(pull) {
    if (!this.data.uid) return;
    if (this.data.loading) { if (pull) wx.stopPullDownRefresh(); return; }
    this.setData({ loading: true, refreshing: !!pull });
    try {
      if (this.data.folder === 'sent') {
        const box = await getSent(this.data.uid, { pageNum: 1, pageSize: this.data.pageSize });
        const rows = (box && box.rows) || [];
        const list = rows.map(toSentItem);
        const unread = await getUnreadCount(this.data.uid);
        this.setData({
          list, total: (box && box.total) || rows.length, unreadCount: unread, pageNum: 1,
          finished: rows.length < this.data.pageSize
        });
      } else {
        const params = {
          pageNum: 1, pageSize: this.data.pageSize, folder: this.data.folder,
          unreadOnly: this.data.onlyUnread ? 1 : undefined,
          categoryCode: this.data.activeCategory || undefined,
          keyword: this.data.keyword || undefined
        };
        const [box, unread] = await Promise.all([
          getInbox(this.data.uid, params),
          getUnreadCount(this.data.uid)
        ]);
        const rows = (box && box.rows) || [];
        const list = rows.map(toInboxItem);
        this.setData({
          list, total: (box && box.total) || rows.length, unreadCount: unread,
          pageNum: 1, finished: rows.length < this.data.pageSize
        });
      }
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
      if (pull) wx.stopPullDownRefresh();
      this.startPolling();
    }
  },

  async loadMore() {
    if (this.data.loading || this.data.finished) return;
    const next = this.data.pageNum + 1;
    this.setData({ loading: true });
    try {
      let rows = [];
      if (this.data.folder === 'sent') {
        const box = await getSent(this.data.uid, { pageNum: next, pageSize: this.data.pageSize });
        rows = (box && box.rows) || [];
      } else {
        const box = await getInbox(this.data.uid, {
          pageNum: next, pageSize: this.data.pageSize, folder: this.data.folder,
          unreadOnly: this.data.onlyUnread ? 1 : undefined,
          categoryCode: this.data.activeCategory || undefined,
          keyword: this.data.keyword || undefined
        });
        rows = (box && box.rows) || [];
      }
      if (!rows.length) { this.setData({ finished: true }); return; }
      const mapped = this.data.folder === 'sent' ? rows.map(toSentItem) : rows.map(toInboxItem);
      this.setData({
        list: this.data.list.concat(mapped), pageNum: next,
        finished: rows.length < this.data.pageSize
      });
    } catch (e) { /* 忽略加载更多失败 */ } finally {
      this.setData({ loading: false });
    }
  },

  // 定时轮询：未读数变化才重载列表，避免无谓刷新
  startPolling() {
    if (this._timer) return;
    this._timer = setInterval(async () => {
      if (!this._active || !this.data.uid || this.data.loading) return;
      try {
        const unread = await getUnreadCount(this.data.uid);
        if (unread !== this.data.unreadCount) {
          this.setData({ unreadCount: unread });
          if (this.data.folder === 'inbox') this.silentReload();
        }
      } catch (e) { /* 轮询失败静默 */ }
    }, POLL_MS);
  },
  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
  async silentReload() {
    if (this.data.loading) return;
    const params = {
      pageNum: 1, pageSize: this.data.pageSize, folder: this.data.folder,
      unreadOnly: this.data.onlyUnread ? 1 : undefined,
      categoryCode: this.data.activeCategory || undefined,
      keyword: this.data.keyword || undefined
    };
    try {
      const box = await getInbox(this.data.uid, params);
      const rows = (box && box.rows) || [];
      this.setData({
        list: rows.map(toInboxItem), total: (box && box.total) || rows.length,
        pageNum: 1, finished: rows.length < this.data.pageSize
      });
    } catch (e) { /* 静默 */ }
  },

  onRefreshTap() { this.refresh(false); },
  switchFolder(e) {
    const f = e.currentTarget.dataset.folder;
    if (f === this.data.folder) return;
    this.setData({ folder: f, selecting: false, selectedCount: 0, pageNum: 1, finished: false });
    this.refresh(false);
  },
  searchInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() { this.setData({ pageNum: 1 }); this.refresh(false); },
  onToggleUnread(e) {
    const v = e.currentTarget.dataset.val === '1';
    if (v === this.data.onlyUnread) return;
    this.setData({ onlyUnread: v, pageNum: 1 });
    this.refresh(false);
  },
  onPickCategory(e) {
    const code = e.currentTarget.dataset.code;
    this.setData({ activeCategory: this.data.activeCategory === code ? '' : code, pageNum: 1 });
    this.refresh(false);
  },

  // —— 选择模式 ——
  enterSelect() {
    const list = this.data.list.map(i => Object.assign({}, i, { checked: false }));
    this.setData({ selecting: true, selectedCount: 0, list });
  },
  exitSelect() {
    const list = this.data.list.map(i => Object.assign({}, i, { checked: false }));
    this.setData({ selecting: false, selectedCount: 0, list });
  },
  onCheckItem(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.list.slice();
    let count = this.data.selectedCount;
    const idx = list.findIndex(i => i.id === id);
    if (idx < 0) return;
    const item = Object.assign({}, list[idx]);
    item.checked = !item.checked;
    list[idx] = item;
    count += item.checked ? 1 : -1;
    this.setData({ list, selectedCount: count });
  },
  _selectedIds() {
    return this.data.list.filter(i => i.checked).map(i => i.id);
  },
  async batchReadTap() {
    const ids = this._selectedIds();
    if (!ids.length) { wx.showToast({ title: '请先勾选消息', icon: 'none' }); return; }
    try {
      await batchRead(this.data.uid, ids);
      wx.showToast({ title: '已标记已读', icon: 'success' });
      this.exitSelect();
      this.refresh(false);
    } catch (e) { /* 拦截器已提示 */ }
  },
  async batchDeleteTap() {
    const ids = this._selectedIds();
    if (!ids.length) { wx.showToast({ title: '请先勾选消息', icon: 'none' }); return; }
    if (this.data.folder === 'trash') {
      const ok = await confirm('彻底删除后不可恢复，确定永久删除选中的 ' + ids.length + ' 条消息？', { title: '彻底删除' });
      if (!ok) return;
      try { await batchPurge(this.data.uid, ids); } catch (e) { return; }
    } else {
      const ok = await confirm('确定删除选中的 ' + ids.length + ' 条消息？将移入回收站。', { title: '删除' });
      if (!ok) return;
      try { await batchDelete(this.data.uid, ids); } catch (e) { return; }
    }
    wx.showToast({ title: '已删除', icon: 'success' });
    this.exitSelect();
    this.refresh(false);
  },
  async markAllReadTap() {
    try {
      const ids = await getMessageIds(this.data.uid, 0);
      if (ids && ids.length) await batchRead(this.data.uid, ids);
    } catch (e) { /* 忽略 */ }
    wx.showToast({ title: '已全部已读', icon: 'success' });
    this.refresh(false);
  },

  // —— 单条操作（右上角 ⋯）——
  onItemAction(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(i => i.id === id);
    if (!item) return;
    const f = this.data.folder;
    const actions = [];
    const map = {};
    if (f === 'sent') {
      if (item.recallable) { actions.push('收回'); map['收回'] = () => this.doRecall(id); }
      if (this.data.isManager) { actions.push('彻底删除'); map['彻底删除'] = () => this.doDeleteGlobal(id); }
      if (!actions.length) { wx.showToast({ title: '当前消息不可操作', icon: 'none' }); return; }
    } else if (f === 'trash') {
      actions.push('恢复'); map['恢复'] = () => this.doRestore(id);
      actions.push('彻底删除'); map['彻底删除'] = () => this.doPurge(id);
    } else {
      actions.push(item.unread ? '标记已读' : '标记未读');
      map[actions[0]] = () => this.doSetRead(id, item.unread);
      actions.push(item.starred ? '取消收藏' : '收藏');
      map[actions[1]] = () => this.doStar(id, item.starred);
      actions.push('删除(移回收站)'); map['删除(移回收站)'] = () => this.doDelete(id);
    }
    wx.showActionSheet({
      itemList: actions,
      success: (res) => { const fn = map[actions[res.tapIndex]]; if (fn) fn(); },
      fail: () => {}
    });
  },
  async doSetRead(id, wasUnread) {
    try { await setRead(this.data.uid, id, !wasUnread); } catch (e) { return; }
    this.refresh(false);
  },
  async doStar(id, wasStarred) {
    try { await toggleStar(this.data.uid, id, wasStarred); } catch (e) { return; }
    this.refresh(false);
  },
  async doDelete(id) {
    const ok = await confirm('确定删除这条消息？将移入回收站。', { title: '删除消息' });
    if (!ok) return;
    try { await deleteMessage(this.data.uid, id); } catch (e) { return; }
    wx.showToast({ title: '已删除', icon: 'success' });
    this.refresh(false);
  },
  async doRestore(id) {
    try { await restore(this.data.uid, id); } catch (e) { return; }
    wx.showToast({ title: '已恢复', icon: 'success' });
    this.refresh(false);
  },
  async doPurge(id) {
    const ok = await confirm('彻底删除后不可恢复，确定永久删除这条消息？', { title: '彻底删除' });
    if (!ok) return;
    try { await purge(this.data.uid, id); } catch (e) { return; }
    wx.showToast({ title: '已彻底删除', icon: 'success' });
    this.refresh(false);
  },
  async doRecall(id) {
    const ok = await confirm('确定收回该消息？仅对「接收方均未读」的消息可收回。', { title: '收回消息' });
    if (!ok) return;
    try { await recallMessage(id); } catch (e) { return; }
    wx.showToast({ title: '已收回', icon: 'success' });
    this.refresh(false);
  },
  async doDeleteGlobal(id) {
    const ok = await confirm('彻底删除该消息？\n将永久删除主消息、所有收件人的收件箱副本及投递记录，且无法恢复！', { title: '彻底删除' });
    if (!ok) return;
    try { await deleteSentGlobal(id); } catch (e) { return; }
    wx.showToast({ title: '已彻底删除', icon: 'success' });
    this.refresh(false);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/package-message/detail/detail?mid=' + id + '&from=' + this.data.folder });
  },
  goCompose() {
    wx.navigateTo({ url: '/package-message/compose/compose' });
  }
});
