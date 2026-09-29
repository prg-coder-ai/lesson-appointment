import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { appointmentStatusText } from '../../shared/domain/appointmentState.js';

function fmtTime(s) {
  if (!s) return '时间待定';
  return String(s).replace('T', ' ').slice(0, 16);
}

Page({
  data: { list: [], loading: false, days: 7 },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.user = u;
    this.load();
  },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const u = this.user;
      const res = await request({
        url: ENDPOINTS.APPOINTMENT_LIST_BY_DAYS(this.data.days, u.userId, u.role),
        method: 'GET'
      });
      const rows = (res && (res.list || res)) || [];
      const ids = [...new Set(rows.map(r => r.courseId).filter(Boolean))];
      const cache = {};
      await Promise.all(ids.map(async (id) => {
        try {
          cache[id] = await request({ url: ENDPOINTS.COURSE_DETAIL(id), method: 'GET' }) || {};
        } catch (e) { cache[id] = {}; }
      }));
      const isStudent = u.role === 'student';
      const list = rows.map(r => {
        const c = cache[r.courseId] || {};
        const title = c.courseName || c.title || ('课程 ' + (r.courseId || ''));
        const sub = isStudent
          ? ('教师 ' + (c.teacherName || r.teacherId || ''))
          : ('学生 ' + (r.studentId || ''));
        return {
          id: r.id, bookingId: r.bookingId, courseId: r.courseId,
          title, sub, time: fmtTime(r.appointmentDatetime),
          status: r.status, statusText: appointmentStatusText(r.status)
        };
      });
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  onDayChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.days) return;
    this.setData({ days });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
