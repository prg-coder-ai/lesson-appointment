import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { confirm } from '../../core/ui.js';

Page({
  data: { id: '', course: {}, loading: false },
  onLoad(query) {
    this.setData({ id: query.id || '' });
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({ url: ENDPOINTS.COURSE_DETAIL(this.data.id), method: 'GET' });
      this.setData({ course: res || {} });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  // 注意：本页已被「课程预订」(package-student/booking) 的展开式流程取代，应用内不再有入口。
  // 保留可用的预订能力仅用于外部深链/历史入口，故这里必须与 booking.js 同口径传参：
  //   teacherId 必填（booking.teacher_id NOT NULL，而排期表没有该列，只能从课程取）
  //   status='booking'（待管理员确认），而不是让后端落默认 booked
  async book(e) {
    const scheduleId = e.currentTarget.dataset.sid;
    const c = this.data.course || {};
    const courseId = c.courseId || c.id || '';
    const u = requireAuth();
    if (!u) return;
    if (!c.teacherId) { wx.showToast({ title: '课程未关联教师，请联系管理员', icon: 'none' }); return; }
    const ok = await confirm('确认预订该时段？', { title: '确认预订' });
    if (!ok) return;
    try {
      await request({
        url: ENDPOINTS.BOOKING_CREATE, method: 'POST',
        data: { scheduleId, courseId, studentId: u.userId, teacherId: c.teacherId, status: 'booking' }
      });
      wx.showToast({ title: '预订成功，等待管理员确认', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '预订失败', icon: 'none' });
    }
  },
  goTeacher() {
    const tid = this.data.course && this.data.course.teacherId;
    if (!tid) { wx.showToast({ title: '暂无教师信息', icon: 'none' }); return; }
    wx.navigateTo({ url: '/package-student/teacher-profile/teacher-profile?tid=' + tid });
  }
});
