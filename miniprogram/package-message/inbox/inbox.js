// 消息收件箱：轮询 + 手动刷新 + 下拉刷新 + 分类/未读筛选。
// 小程序无 SSE，靠定时轮询实现「即时更新」；同时提供刷新按钮与下拉刷新。

import { requireAuth } from '../../core/auth.js';
import {
  getUnreadCount, getInbox, getCategories, fmtTime, previewText
} from '../../core/message.js';

const POLL_MS = 20000; // 轮询间隔

Page({
  data: {
    uid: '',
    list: [],
    loading: false,
    refreshing: false,
    unreadCount: 0,
    onlyUnread: false,
    categories: [],
    activeCategory: '',
    total: 0,
    pageNum: 1,
    pageSize: 20,
    finished: false
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ uid: u.userId });
    this._active = true;
    this._polling = false;
    this.loadCategories();
    this.refresh();
  },
  onShow() {
    this._active = true;
    // 从详情返回后刷新（已读状态可能变化）
    if (this.data.uid) this.refresh(false);
  },
  onHide() { this._active = false; },
  onUnload() { this._active = false; this.stopPolling(); },
  onPullDownRefresh() { this.refresh(true); },

  async loadCategories() {
    const cats = await getCategories();
    // 展平为可选项：全部 + 各级 code（用 code 作为 categoryCode 查询）
    const flat = [];
    const walk = (arr, depth) => {
      (arr || []).forEach(c => {
        flat.push({ code: c.code, name: (depth ? '　'.repeat(depth) : '') + (c.name || c.code), depth });
        if (c.children && c.children.length) walk(c.children, depth + 1);
      });
    };
    walk(cats, 0);
    this.setData({ categories: flat });
  },

  // 拉取列表 + 未读数。pull=true 时处理下拉刷新收尾
  async refresh(pull) {
    if (!this.data.uid) return;
    if (this.data.loading) { if (pull) wx.stopPullDownRefresh(); return; }
    this.setData({ loading: true, refreshing: !!pull });
    try {
      const params = {
        pageNum: 1, pageSize: this.data.pageSize,
        unreadOnly: this.data.onlyUnread ? 1 : undefined,
        categoryCode: this.data.activeCategory || undefined
      };
      const [box, unread] = await Promise.all([
        getInbox(this.data.uid, params),
        getUnreadCount(this.data.uid)
      ]);
      const rows = (box && box.list) || [];
      const list = rows.map(m => ({
        id: m.messageId,
        title: m.title || '(无标题)',
        preview: previewText(m),
        time: fmtTime(m.sendTime || m.createTime),
        unread: !m.isRead,
        starred: !!m.isStarred,
        category: m.categoryName || '',
        priority: m.priority || ''
      }));
      this.setData({
        list, total: (box && box.total) || rows.length,
        unreadCount: unread, pageNum: 1,
        finished: rows.length < this.data.pageSize
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
      if (pull) wx.stopPullDownRefresh();
      this.startPolling();
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
          // 未读数变化，轻量重载列表
          this.silentReload();
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
      pageNum: 1, pageSize: this.data.pageSize,
      unreadOnly: this.data.onlyUnread ? 1 : undefined,
      categoryCode: this.data.activeCategory || undefined
    };
    try {
      const box = await getInbox(this.data.uid, params);
      const rows = (box && box.list) || [];
      this.setData({
        list: rows.map(m => ({
          id: m.messageId, title: m.title || '(无标题)', preview: previewText(m),
          time: fmtTime(m.sendTime || m.createTime), unread: !m.isRead,
          starred: !!m.isStarred, category: m.categoryName || '', priority: m.priority || ''
        })),
        total: (box && box.total) || rows.length, pageNum: 1,
        finished: rows.length < this.data.pageSize
      });
    } catch (e) { /* 静默 */ }
  },

  onRefreshTap() { this.refresh(false); },
  onToggleUnread(e) {
    const v = e.currentTarget.dataset.val === '1';
    if (v === this.data.onlyUnread) return;
    this.setData({ onlyUnread: v });
    this.refresh(false);
  },
  onPickCategory(e) {
    const code = e.currentTarget.dataset.code;
    this.setData({ activeCategory: this.data.activeCategory === code ? '' : code });
    this.refresh(false);
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/package-message/detail/detail?mid=' + id });
  }
});
