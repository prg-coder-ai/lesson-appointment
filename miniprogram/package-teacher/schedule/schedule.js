// 教师排期管理：我的排期列表（listByTeacher）。支持新增/编辑/删除/启停。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const STATUS_TEXT = { active: '已发布', frozen: '已冻结', pending: '待发布', inactive: '已下架' };
const REPEAT_TEXT = { 0: '不重复', 1: '每天', 2: '每周', 3: '每月' };

function repeatText(s) {
  const t = REPEAT_TEXT[s.repeatType] || '不重复';
  if (s.repeatType === 2 && s.repeatDays) return '每周 ' + s.repeatDays;
  if (s.repeatType === 3 && s.repeatDays) return '每月 ' + s.repeatDays + ' 日';
  return t;
}

Page({
  data: { uid: '', list: [], loading: true },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ uid: u.userId });
  },
  onShow() { this.load(); },
  async load() {
    if (!this.data.uid) return;
    this.setData({ loading: true });
    try {
      const rows = await request({ url: ENDPOINTS.SCHEDULE_LIST_BY_TEACHER(this.data.uid), method: 'GET' }) || [];
      const list = rows.map(s => ({
        id: s.scheduleId,
        title: s.name || s.courseId || '未命名排期',
        courseId: s.courseId,
        range: (s.startTime || '') + (s.endTime ? ' ~ ' + s.endTime : ''),
        repeat: repeatText(s),
        status: s.status || 'pending',
        statusText: STATUS_TEXT[s.status] || s.status || '待发布',
        sites: s.availableSites,
        full: s.full
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
  goAdd() { wx.navigateTo({ url: '/package-teacher/schedule/schedule-edit?mode=add' }); },
  goEdit(e) { wx.navigateTo({ url: '/package-teacher/schedule/schedule-edit?mode=edit&id=' + e.currentTarget.dataset.id }); },
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '删除排期', content: '确定删除该排期？', success: async (r) => {
      if (!r.confirm) return;
      try {
        await request({ url: ENDPOINTS.SCHEDULE_DELETE(id), method: 'DELETE' });
        wx.showToast({ title: '已删除', icon: 'success' });
        this.load();
      } catch (err) { wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }); }
    } });
  },
  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = status === 'active' ? 'frozen' : 'active';
    wx.showModal({ title: '切换状态', content: next === 'frozen' ? '冻结该排期（不再接受预约）？' : '重新发布该排期？', success: async (r) => {
      if (!r.confirm) return;
      try {
        await request({ url: ENDPOINTS.SCHEDULE_UPDATE_STATUS, method: 'POST', data: { scheduleId: id, status: next } });
        wx.showToast({ title: '已更新', icon: 'success' });
        this.load();
      } catch (err) { wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }); }
    } });
  }
});
