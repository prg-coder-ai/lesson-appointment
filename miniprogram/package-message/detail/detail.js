// 消息详情：打开即标记已读；支持收藏/取消、删除。

import { requireAuth } from '../../core/auth.js';
import { getDetail, setRead, toggleStar, deleteMessage, fmtTime } from '../../core/message.js';

Page({
  data: {
    uid: '', mid: '', msg: null, starred: false, unread: true, loading: true
  },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const mid = options && options.mid;
    this.setData({ uid: u.userId, mid });
    this.load(mid);
  },
  async load(mid) {
    this.setData({ loading: true });
    try {
      const d = await getDetail(this.data.uid, mid);
      const msg = {
        title: d.title || '(无标题)',
        content: d.content || d.body || '',
        category: d.categoryName || '',
        priority: d.priority || '',
        sender: d.senderName || d.sender || '',
        time: fmtTime(d.sendTime || d.createTime)
      };
      const unread = !d.isRead;
      const starred = !!d.isStarred;
      this.setData({ msg, unread, starred, loading: false });
      if (unread) {
        try { await setRead(this.data.uid, mid, true); } catch (e) {}
        this.setData({ unread: false });
      }
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
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
  onDelete() {
    wx.showModal({
      title: '删除消息', content: '确定删除这条消息？', success: async (r) => {
        if (!r.confirm) return;
        try {
          await deleteMessage(this.data.uid, this.data.mid);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 400);
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
