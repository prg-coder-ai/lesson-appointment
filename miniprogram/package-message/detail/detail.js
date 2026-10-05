// 消息详情：复刻 web 端 detail/已发详情
// - 收件箱/收藏（from=inbox/starred）：打开即标记已读；支持标已读/未读、收藏/取消、删除(移回收站)
// - 回收站（from=trash）：支持恢复、彻底删除
// - 已发（from=sent）：拉投递状态，展示接收/已读统计（sender 视角无单条操作，撤回/彻底删除在列表页进行）

import { requireAuth } from '../../core/auth.js';
import {
  getDetail, setRead, toggleStar, deleteMessage, fmtTime,
  getDeliveryStatus, restore, purge, isManager
} from '../../core/message.js';
import { confirm } from '../../core/ui.js';

Page({
  data: {
    uid: '', mid: '', from: 'inbox', isManager: false,
    msg: null, starred: false, unread: true, loading: true,
    delivery: null
  },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const mid = options && options.mid;
    const from = (options && options.from) || 'inbox';
    this.setData({ uid: u.userId, mid, from, isManager: isManager(u.role) });
    this.load(mid, from);
  },
  async load(mid, from) {
    this.setData({ loading: true });
    try {
      if (from === 'sent') {
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
        return;
      }
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
  }
});
