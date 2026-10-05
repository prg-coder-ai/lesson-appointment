import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

function fmtTime(s) {
  if (!s) return '时间待定';
  return String(s).replace('T', ' ').slice(0, 16);
}
function apptStatusText(st) {
  switch (st) {
    case 'active': return '生效';
    case 'noted1': return '已通知';
    case 'noted2': return '已通知';
    case 'completed': return '已完成';
    case 'cancelled': return '已取消';
    case 's-cancelling': return '取消待确认';
    case 't-cancelling': return '教师取消中';
    case 't-cancelled': return '教师已取消';
    case 't-reject': return '已拒绝';
    case 'changed': return '已改期';
    default: return st || '—';
  }
}

// 状态筛选（对齐前端 today_course 状态下拉；客户端过滤，不动 api）
const STATUS_OPTIONS = [
  { v: '', t: '全部' },
  { v: 'active', t: '生效' },
  { v: 'noted1', t: '已通知' },
  { v: 'completed', t: '已完成' },
  { v: 's-cancelling', t: '取消待确认' },
  { v: 'cancelled', t: '已取消' },
  { v: 't-reject', t: '已拒绝' },
  { v: 'changed', t: '已改期' }
];

Page({
  data: { list: [], loading: false, days: 7, status: '', statusOptions: STATUS_OPTIONS },
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
      const all = rows.map(r => {
        const c = cache[r.courseId] || {};
        const title = c.courseName || c.title || ('课程 ' + (r.courseId || ''));
        const sub = isStudent
          ? ('教师 ' + (c.teacherName || r.teacherId || ''))
          : ('学生 ' + (r.studentId || ''));
        return {
          id: r.id, bookingId: r.bookingId, courseId: r.courseId,
          title, sub, time: fmtTime(r.appointmentDatetime),
          status: r.status, statusText: apptStatusText(r.status)
        };
      });
      // 客户端按状态筛选
      const list = this.data.status
        ? all.filter(it => it.status === this.data.status)
        : all;
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
  onStatusChange(e) {
    const status = e.currentTarget.dataset.s;
    if (status === this.data.status) return;
    this.setData({ status });
    this.load();
  },
  // 点课次 → 查看该课程排期（对齐前端 today_course「查看排期」）
  goSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/package-teacher/schedule/schedule?courseId=' + id });
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
