// 教师排期编辑：新增/编辑排期（create / update）。
// 字段对齐 ScheduleCreateDTO（repeatType: 0不重复/1每天/2每周/3每月）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

const REPEAT_OPTS = [
  { v: 0, label: '不重复' },
  { v: 1, label: '每天' },
  { v: 2, label: '每周' },
  { v: 3, label: '每月' }
];
const WEEK_DAYS = [
  { v: 1, label: '一' }, { v: 2, label: '二' }, { v: 3, label: '三' },
  { v: 4, label: '四' }, { v: 5, label: '五' }, { v: 6, label: '六' }, { v: 7, label: '日' }
];

Page({
  data: {
    mode: 'add', id: '', teacherId: '',
    courses: [], courseIndex: -1,
    form: {
      courseId: '', name: '',
      startDate: '', startTime: '09:00', endDate: '', endTime: '10:00',
      repeatType: 0, repeatInterval: 1, repeatDays: [], monthDay: '',
      availableSites: 1, status: 'active'
    },
    repeatOpts: REPEAT_OPTS, weekDays: WEEK_DAYS,
    submitting: false
  },
  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const mode = options.mode === 'edit' ? 'edit' : 'add';
    this.setData({ mode, id: options.id || '', teacherId: u.userId });
    this.loadCourses();
    if (mode === 'edit') this.loadDetail(options.id);
  },
  async loadCourses() {
    try {
      const c = await request({ url: ENDPOINTS.COURSE_LIST, method: 'GET', customErrorMsg: false });
      const list = Array.isArray(c) ? c : (c && c.list) || [];
      this.setData({ courses: list.map(x => ({ courseId: x.courseId, courseName: x.courseName || x.courseId })) });
    } catch (e) { /* 课程加载失败不阻断 */ }
  },
  async loadDetail(id) {
    try {
      const s = await request({ url: ENDPOINTS.SCHEDULE_DETAIL(id), method: 'GET' });
      const startDate = (s.startTime || '').slice(0, 10);
      const startTime = (s.startTime || '').slice(11, 16);
      const endDate = (s.endTime || '').slice(0, 10);
      const endTime = (s.endTime || '').slice(11, 16);
      const days = s.repeatDays ? String(s.repeatDays).split(',').map(Number).filter(n => !isNaN(n)) : [];
      const ci = this.data.courses.findIndex(c => c.courseId === s.courseId);
      this.setData({
        courseIndex: ci,
        form: {
          courseId: s.courseId || '', name: s.name || '',
          startDate, startTime: startTime || '09:00', endDate, endTime: endTime || '10:00',
          repeatType: s.repeatType || 0, repeatInterval: s.repeatInterval || 1,
          repeatDays: days, monthDay: s.repeatType === 3 ? (days[0] || '') : '',
          availableSites: s.availableSites || 1, status: s.status || 'active'
        }
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
  onCourse(e) { const i = e.detail.value; const c = this.data.courses[i]; this.setData({ courseIndex: i, form: Object.assign({}, this.data.form, { courseId: c.courseId, name: this.data.form.name || c.courseName }) }); },
  onName(e) { this.setData({ 'form.name': e.detail.value }); },
  onStartDate(e) { this.setData({ 'form.startDate': e.detail.value }); },
  onStartTime(e) { this.setData({ 'form.startTime': e.detail.value }); },
  onEndDate(e) { this.setData({ 'form.endDate': e.detail.value }); },
  onEndTime(e) { this.setData({ 'form.endTime': e.detail.value }); },
  onRepeat(e) { const v = REPEAT_OPTS[e.detail.value].v; this.setData({ 'form.repeatType': v, repeatDays: [], monthDay: '' }); },
  onInterval(e) { this.setData({ 'form.repeatInterval': Number(e.detail.value) || 1 }); },
  onSites(e) { this.setData({ 'form.availableSites': Number(e.detail.value) || 1 }); },
  onWeekDay(e) {
    const v = e.currentTarget.dataset.v;
    const set = new Set(this.data.form.repeatDays);
    if (set.has(v)) set.delete(v); else set.add(v);
    this.setData({ 'form.repeatDays': Array.from(set).sort((a, b) => a - b) });
  },
  onMonthDay(e) { this.setData({ 'form.monthDay': e.detail.value, 'form.repeatDays': e.detail.value ? [Number(e.detail.value)] : [] }); },
  onStatus(e) { this.setData({ 'form.status': e.detail.value ? 'active' : 'frozen' }); },
  async save() {
    const f = this.data.form;
    if (!f.courseId) { wx.showToast({ title: '请选择课程', icon: 'none' }); return; }
    if (!f.startDate || !f.startTime || !f.endTime) { wx.showToast({ title: '请填写日期与时段', icon: 'none' }); return; }
    if (f.repeatType === 2 && f.repeatDays.length === 0) { wx.showToast({ title: '请选择每周星期', icon: 'none' }); return; }
    const dto = {
      courseId: f.courseId,
      name: f.name || undefined,
      startDate: f.startDate, startTime: f.startTime,
      endDate: f.endDate || f.startDate, endTime: f.endTime,
      repeatType: f.repeatType, repeatInterval: f.repeatInterval || 1,
      repeatDays: f.repeatType === 0 ? [] : f.repeatDays,
      availableSites: f.availableSites || 1,
      status: f.status
    };
    this.setData({ submitting: true });
    try {
      if (this.data.mode === 'edit') {
        dto.scheduleId = this.data.id;
        await request({ url: ENDPOINTS.SCHEDULE_UPDATE, method: 'POST', data: dto });
      } else {
        await request({ url: ENDPOINTS.SCHEDULE_CREATE, method: 'POST', data: dto });
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
});
