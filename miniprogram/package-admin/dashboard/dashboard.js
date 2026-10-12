// 租户管理端 · 数据总览（对应网页版 admin.html 的"数据总览"）
// 关键：以下统计均经租户插件按当前登录租户自动隔离，返回的为本租户数据，
// 不再像旧版那样显示平台级 tenantCount/userCount 等跨租户汇总。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

function safeNum(v) { return (typeof v === 'number') ? v : null; }

Page(withTerms({
  data: {
    active: 'dashboard',
    loading: true,
    stat: {
      teacher: null, student: null, course: null, booking: null, appoint: null
    },
    pending: { booking: 0, cancelling: 0, today: 0, rescheduleStudent: 0, rescheduleTeacher: 0 }
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },

  async load() {
    this.setData({ loading: true });
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    // 5 个统计接口互相独立，并行拉取；任一对账失败都不影响其余展示
    const [userStat, courseStat, bookingStat, appointStat, today] = await Promise.all([
      request({ url: ENDPOINTS.STAT_USER_BY_MONTH(y, m), method: 'GET', customErrorMsg: false }).catch(() => null),
      request({ url: ENDPOINTS.STAT_COURSE_BY_MONTH(y, m), method: 'GET', customErrorMsg: false }).catch(() => null),
      request({ url: ENDPOINTS.STAT_BOOKING_BY_MONTH(y, m), method: 'GET', customErrorMsg: false }).catch(() => null),
      request({ url: ENDPOINTS.STAT_APPOINT_BY_MONTH(y, m), method: 'GET', customErrorMsg: false }).catch(() => null),
      request({ url: ENDPOINTS.STAT_APPOINT_ON_DAYS(1), method: 'GET', customErrorMsg: false }).catch(() => null)
    ]);

    const stat = {
      teacher: userStat ? safeNum(userStat.teacherMonthEnd) : null,
      student: userStat ? safeNum(userStat.studentMonthEnd) : null,
      course: courseStat ? safeNum(courseStat.courseMonthEnd) : null,
      booking: bookingStat ? safeNum(bookingStat.bookingMonth) : null,
      appoint: appointStat ? safeNum(appointStat.appMonth) : null
    };

    // 待审核计数：booking 整单级（预订/取消）+ appointment 课次级改期申请（学生 cancelling / 教师 t-cancelling）。
    // 与网页版「数据总览 → 待审核」卡片同口径（2026-10-12 对齐）；均用分页接口取 total，不拉全量。
    const [bk, cn, rs, rt] = await Promise.all([
      this.countBooking('booking').catch(() => 0),
      this.countBooking('cancelling').catch(() => 0),
      this.countAppointment('cancelling').catch(() => 0),
      this.countAppointment('t-cancelling').catch(() => 0)
    ]);

    this.setData({
      loading: false,
      stat,
      pending: {
        booking: bk,
        cancelling: cn,
        rescheduleStudent: rs,
        rescheduleTeacher: rt,
        today: Array.isArray(today) ? today.length : (today && typeof today.count === 'number' ? today.count : (today && typeof today === 'number' ? today : 0))
      }
    });
  },

  async countBooking(status) {
    const res = await request({
      url: ENDPOINTS.BOOKING_PAGE, method: 'POST', customErrorMsg: false,
      data: { status, pageNum: 1, pageSize: 1 }
    });
    if (!res) return 0;
    if (typeof res.total === 'number') return res.total;
    if (Array.isArray(res)) return res.length;
    if (res.rows && Array.isArray(res.rows)) return res.rows.length;
    return 0;
  },

  // 课次级改期申请计数：POST /course/appointment/listByPage 取 PageResult.total
  // 学生请假/改期申请 = 'cancelling'；教师发起改期申请 = 't-cancelling'（与 booking 整单级 cancelling 正交）
  async countAppointment(status) {
    const res = await request({
      url: ENDPOINTS.APPOINTMENT_PAGE, method: 'POST', customErrorMsg: false,
      data: { status, pageNum: 1, pageSize: 1 }
    });
    if (!res) return 0;
    if (typeof res.total === 'number') return res.total;
    if (Array.isArray(res)) return res.length;
    if (res.rows && Array.isArray(res.rows)) return res.rows.length;
    return 0;
  },

  // 跳到预订审核页（按状态预筛）
  goAudit(e) {
    const status = e.currentTarget.dataset.status || '';
    wx.navigateTo({ url: '/package-admin/booking-audit/booking-audit?status=' + encodeURIComponent(status) });
  },

  // 跳到上课通知页（课次维度）。
  //   data-status：按课次状态预筛（学生改期待确认=cancelling / 教师改期待确认=t-cancelling）；
  //   data-days  ：时间窗档位，0=全部（后端按 MySQL DATETIME 极值处理）；
  //   两者都不带 → 缺省页面（全部状态 + 近 7 天），供「今日课程」行使用。
  //
  // 为什么改期待确认要带 days=0：该角标由 countAppointment(status) 统计，
  // 走 APPOINTMENT_PAGE 只按 status 过滤、**不设时间窗**（全时段口径）；
  // 而上课通知页缺省是「近 7 天」，days 窗口作用在 appointment_datetime（上课时间）上，
  // 会把「上课时间在 7 天之外」的待处理申请整条挡掉（角标 3 条、点进去 0 条）。
  // 带 days=0 后与角标口径逐条对齐。
  goLessonNotice(e) {
    const ds = (e.currentTarget && e.currentTarget.dataset) || {};
    const qs = [];
    if (ds.status) qs.push('status=' + encodeURIComponent(ds.status));
    if (ds.days !== undefined && ds.days !== null && ds.days !== '') {
      qs.push('days=' + encodeURIComponent(ds.days));
    }
    const base = '/package-admin/lesson-notice/lesson-notice';
    wx.navigateTo({ url: qs.length ? (base + '?' + qs.join('&')) : base });
  }
}));
