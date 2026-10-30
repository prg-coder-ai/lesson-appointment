// 教师排期管理：我的排期列表（listByTeacher）。支持新增/编辑/删除/启停。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { confirm } from '../../core/ui.js';

const STATUS_TEXT = { active: '已发布', frozen: '已冻结', pending: '待发布', inactive: '已下架' };
const REPEAT_TEXT = { 0: '不重复', 1: '每天', 2: '每周', 3: '每月' };

function repeatText(s) {
  const t = REPEAT_TEXT[s.repeatType] || '不重复';
  if (s.repeatType === 2 && s.repeatDays) return '每周 ' + s.repeatDays;
  if (s.repeatType === 3 && s.repeatDays) return '每月 ' + s.repeatDays + ' 日';
  return t;
}

Page({
  data: { uid: '', courseId: '', courseName: '', list: [], loading: true },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    // 支持从「我的课程」点进按课程过滤排期（对齐前端 my_course 点进看排期）
    const courseId = (options && options.courseId) || '';
    this.setData({ uid: u.userId, courseId });
    // 拉一次课程名用于顶部筛选提示；失败静默（只影响提示文案，不阻断列表）
    if (courseId) this.loadCourseName(courseId);
  },
  async loadCourseName(courseId) {
    try {
      const c = await request({ url: ENDPOINTS.COURSE_DETAIL(courseId), method: 'GET', customErrorMsg: false });
      if (c) this.setData({ courseName: c.courseName || c.title || '' });
    } catch (e) { /* 取不到课程名就只显示“已筛选” */ }
  },
  clearFilter() { this.setData({ courseId: '', courseName: '' }); this.load(); },
  onShow() { this.load(); },
  async load() {
    if (!this.data.uid) return;
    this.setData({ loading: true });
    try {
      const rows = await request({ url: ENDPOINTS.SCHEDULE_LIST_BY_TEACHER(this.data.uid), method: 'GET' }) || [];
      const filtered = this.data.courseId
        ? rows.filter(s => String(s.courseId) === String(this.data.courseId))
        : rows;
      const list = filtered.map(s => ({
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
  // 路径必须与 app.json 注册项一致：subPackages[package-teacher].pages 里是
  // "schedule-edit/schedule-edit"（独立分包目录），不是 "schedule/schedule-edit"。
  // 课程带入：正在按某课程筛选时，「新增」直接把该课程带进编辑页并选中，
  // 教师不必在几百门课的下拉里再找一遍。
  goAdd() {
    const cid = this.data.courseId;
    const qs = cid ? '&courseId=' + encodeURIComponent(cid) + '&courseName=' + encodeURIComponent(this.data.courseName || '') : '';
    wx.navigateTo({ url: '/package-teacher/schedule-edit/schedule-edit?mode=add' + qs });
  },
  goEdit(e) { wx.navigateTo({ url: '/package-teacher/schedule-edit/schedule-edit?mode=edit&id=' + e.currentTarget.dataset.id }); },
  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await confirm('确定删除该排期？', { title: '删除排期' });
    if (!ok) return;
    try {
      await request({ url: ENDPOINTS.SCHEDULE_DELETE(id), method: 'DELETE' });
      wx.showToast({ title: '已删除', icon: 'success' });
      this.load();
    } catch (err) { wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }); }
  },
  async onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const next = status === 'active' ? 'frozen' : 'active';
    const ok = await confirm(next === 'frozen' ? '冻结该排期（不再接受预约）？' : '重新发布该排期？', { title: '切换状态' });
    if (!ok) return;
    try {
      await request({ url: ENDPOINTS.SCHEDULE_UPDATE_STATUS, method: 'POST', data: { scheduleId: id, status: next } });
      wx.showToast({ title: '已更新', icon: 'success' });
      this.load();
    } catch (err) { wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }); }
  }
});
