// 学生端「我的预订」——每条预订卡片展示 课程 / 时间 / 教师，并按课次提供延期(请假)与取消延期
//
// 数据链（全部复用既有端点，不动 api）：
//   POST /course/booking/page  { userId, userRole:'student' } → 本人预约（Result<PageResult<Booking>>，字段 rows）
//     ↓ booking.scheduleId → GET /schedule/detail/{id} → 排期名称/起止时间/时区/courseId
//     ↓ schedule.courseId   → GET /course/{id}         → 课程名 + teacherId
//     ↓ course.teacherId    → GET /user/name/{id}      → 教师姓名
//     ↓ booking.bookingId   → GET /course/appointment/getByBookingId?bookingId= → 课次（每节课的日期时间与状态）
//
// 两个必须守住的点：
//   1. **学生过滤参数是 userId + userRole='student'**（后端 BookingQueryPage/BookingMapper 的 choose 分支
//      只认这两个字段）。原实现传的是 studentId —— 后端没有这个字段，整个 where 分支不生效，
//      接口会把**本租户全部学生的预约**返回给这个学生。这不是显示问题，是越权读。
//   2. 「延期/请假」是**课次级**动作（appointment 一行 = 一节课），不是整单动作：
//      申请 = PUT /course/appointment/updateStatusById { id, status:'cancelling' }（等管理员确认）
//      取消延期 = 同接口置回 'active'。已上完/已取消/已改期的课次不放出这两个按钮。
//      文案走行业词：教育「请假」/ 法律·心理·健身「改期」。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { confirm } from '../../core/ui.js';
import { withTerms } from '../../core/term.js';
import { bookingStatusText, normalizeBookingStatus } from '../../shared/domain/bookingState.js';
import { appointmentStatusText, isAppointmentClosed } from '../../shared/domain/appointmentState.js';

const BATCH = 200;
const MAX_PAGE = 5;

// 预约状态里「仍然有效」的一组：这些状态下才可能有课次、才谈得上取消
const ACTIVE_STATUSES = ['waiting', 'booking', 'booked', 'canceling', 'cancelling'];
// 有课次的预约状态（booked 已确认 / completed 已完成），其余（候补、待确认、已取消）没有 appointment 行
const HAS_APPOINTMENT_STATUSES = ['booked', 'completed'];

// 课次上不能再申请请假的额外状态：本人/教师的取消申请已在途，或已被改期
const LEAVE_BLOCKED_EXTRA = ['canceling', 'cancelling', 's-cancelling', 't-cancelling', 'changed'];
// 可以「取消延期」的状态：本人提出的取消申请在途（教师端的 t-cancelling 学生不可撤回）
const WITHDRAWABLE = ['canceling', 'cancelling', 's-cancelling'];

// PageResult 字段名是 rows（不是 list/records），取错会 fallback 成整个对象 → .map 抛错 → 列表恒空
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

// 同一 key 只发一次请求（同一排期/课程会被多条预约复用）
function memo(map, key, loader) {
  if (key === null || key === undefined || key === '') return Promise.resolve(null);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = loader().catch(() => null);
  }
  return map[key];
}

function dt(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : ''; }

// 排期时间 → 「2026-09-27 16:00 ~ 2026-10-04 17:00」；起止同日则后一段只留时间
function scheduleText(sc) {
  if (!sc) return '';
  const st = dt(sc.startTime);
  const en = dt(sc.endTime);
  if (!st) return sc.name || '';
  const sd = st.slice(0, 10), ed = en.slice(0, 10);
  if (!en) return st;
  return (ed && ed !== sd) ? (st + ' ~ ' + en) : (st + ' ~ ' + en.slice(11, 16));
}

// 课次（appointment.datetime → 日期 + 时间 + 星期）
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function splitApt(datetime) {
  const v = dt(datetime);            // 2026-10-04 16:00
  if (!v) return { dateText: '', timeText: '', weekText: '' };
  const d = v.slice(0, 10), t = v.slice(11, 16);
  let weekText = '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) {
    const dd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(dd.getTime())) weekText = WEEK[dd.getDay()];
  }
  return { dateText: d, timeText: t, weekText };
}

// 状态 → 色调（绿=已确认，橙=在处理，灰=已结束）
function toneOf(status) {
  const s = normalizeBookingStatus(status);
  if (s === 'booked') return 'ok';
  if (s === 'completed') return 'done';
  if (s === 'booking' || s === 'waiting' || s === 'canceling') return 'warn';
  return 'bad';
}

Page(withTerms({
  data: { list: [], loading: false, error: '' },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh()); },

  tr(key, fb) { const t = this.data.terms || {}; return t[key] || fb; },

  async load() {
    if (this.data.loading) return;
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true, error: '' });
    try {
      const rows = await this.fetchAll(u);
      const list = await this.enrich(rows, u);
      this.setData({ list });
    } catch (e) {
      // 错误落到页面上：否则"接口失败"和"确实没有预约"在界面上长得一模一样
      const msg = (e && e.message) || '加载失败';
      this.setData({ list: [], error: msg });
      wx.showToast({ title: msg, icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  async fetchAll(u) {
    const all = [];
    for (let p = 1; p <= MAX_PAGE; p++) {
      let res = null, err = null;
      try {
        res = await request({
          url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
          // ⚠ 必须是 userId + userRole：后端只按这两个字段做"只看本人"的过滤
          data: { pageNum: p, pageSize: BATCH, userId: u.userId, userRole: 'student' },
          customErrorMsg: false
        });
      } catch (e) { err = e; }
      if (!res) { if (p === 1 && err) throw err; break; }
      const rows = pickRows(res);
      if (!rows.length) break;
      all.push.apply(all, rows);
      if (rows.length < BATCH) break;
    }
    return all;
  },

  async enrich(rows, u) {
    const schMemo = {}, crsMemo = {}, usrMemo = {}, aptMemo = {};

    const tasks = (rows || []).map(async (b) => {
      const st = normalizeBookingStatus(b.status);
      // 排期（名称/时间/时区/courseId）
      const sc = await memo(schMemo, b.scheduleId, () => request({
        url: ENDPOINTS.SCHEDULE_DETAIL(b.scheduleId), method: 'GET', customErrorMsg: false
      }));
      const cid = sc && sc.courseId;
      const course = await memo(crsMemo, cid, () => request({
        url: ENDPOINTS.COURSE_DETAIL(cid), method: 'GET', customErrorMsg: false
      }));
      const teacherName = await memo(usrMemo, course && course.teacherId, () => request({
        url: ENDPOINTS.USER_NAME(course.teacherId), method: 'GET', customErrorMsg: false
      }));

      // 课次（只有已确认/已完成才有 appointment 行；候补与待确认去查必然是空表）
      let apts = [];
      if (HAS_APPOINTMENT_STATUSES.indexOf(st) >= 0) {
        const raw = await memo(aptMemo, b.bookingId, () => request({
          url: ENDPOINTS.APPOINTMENT_LIST_BY_BOOKING(b.bookingId), method: 'GET', customErrorMsg: false
        }));
        apts = (Array.isArray(raw) ? raw : pickRows(raw))
          .sort((x, y) => String(x.appointmentDatetime || '').localeCompare(String(y.appointmentDatetime || '')))
          .map(a => this.composeAppointment(a));
      }

      const cancel = this.cancelAction(st);
      return {
        bookingId: b.bookingId,
        courseId: cid || '',
        courseName: (course && (course.courseName || course.title)) || this.tr('course', '课程'),
        teacherName: (typeof teacherName === 'string' && teacherName) ? teacherName : '',
        scheduleName: (sc && sc.name) || '',
        scheduleText: scheduleText(sc),
        timeZone: (sc && sc.timeZone) || '',
        status: b.status,
        statusText: bookingStatusText(b.status),
        tone: toneOf(b.status),
        applyTime: dt(b.createTime),
        appointments: apts,
        aptTotal: apts.length,
        // 未完成的课次数：卡片上直接告诉学生"还有几节要上"
        pendingApts: apts.filter(a => !isAppointmentClosed(a.status)).length,
        canCancel: !!cancel,
        cancelLabel: cancel ? cancel.label : '',
        cancelStatus: cancel ? cancel.status : ''
      };
    });
    return Promise.all(tasks);
  },

  // 课次 → 渲染行。按钮文案/可见性都在这里定，WXML 只读属性（模板不能调函数）
  composeAppointment(a) {
    const status = a.status || 'active';
    const closed = isAppointmentClosed(status);
    const leaveWord = this.tr('leave', '请假');
    const canWithdraw = WITHDRAWABLE.indexOf(status) >= 0;
    const canApply = !closed && LEAVE_BLOCKED_EXTRA.indexOf(status) < 0;
    const when = splitApt(a.appointmentDatetime);
    return {
      id: a.id,
      dateText: when.dateText,
      timeText: when.timeText,
      weekText: when.weekText,
      status: status,
      statusText: appointmentStatusText(status, { teacherLabel: this.tr('teacher', '教师') }),
      tone: closed ? 'done' : (status === 'active' || status === 'noted1' || status === 'noted2' ? 'ok' : 'warn'),
      canApply: canApply,
      applyLabel: leaveWord,
      canWithdraw: canWithdraw,
      withdrawLabel: '取消' + leaveWord
    };
  },

  // 预约级「撤销/取消」的文案与目标状态（与 Web applyBookingButtons 同口径）
  cancelAction(st) {
    if (ACTIVE_STATUSES.indexOf(st) < 0) return null;   // 已取消/已完成等：没有可撤销的动作
    if (st === 'waiting') return { label: '撤销候补', status: 'cancelled' };
    if (st === 'booking') return { label: '撤销申请', status: 'cancelled' };
    if (st === 'booked') return { label: '取消预订', status: 'canceling' };
    return { label: '撤销取消', status: 'booked' };      // canceling：管理员确认前可撤回
  },

  /* ------------------------- 预约级：撤销 / 取消预订 ------------------------- */
  async cancel(e) {
    const { id, status, label } = e.currentTarget.dataset;
    if (!id) return;
    const ok = await confirm('确定' + (label || '取消') + '？', { title: '请确认' });
    if (!ok) return;
    try {
      // BookingController#updateStatus 收 BookingDTO{ id, status }——字段名必须是 id
      await request({
        url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST',
        data: { id: id, status: status }
      });
      wx.showToast({ title: (label || '操作') + '成功', icon: 'none' });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  /* ------------------------- 课次级：延期(请假) / 取消延期 ------------------------- */
  async leaveApply(e) {
    const id = e.currentTarget.dataset.id;
    const leaveWord = this.tr('leave', '请假');
    if (!id) return;
    const ok = await confirm(
      '确定对这节课提交' + leaveWord + '申请？提交后需管理员确认，期间该课次保持占用。',
      { title: leaveWord + '申请' }
    );
    if (!ok) return;
    await this.setAptStatus(id, 'cancelling', leaveWord + '申请已提交，等待确认');
  },

  async leaveWithdraw(e) {
    const id = e.currentTarget.dataset.id;
    const leaveWord = this.tr('leave', '请假');
    if (!id) return;
    const ok = await confirm('确定取消本次' + leaveWord + '申请，把课次恢复为生效？', { title: '取消' + leaveWord });
    if (!ok) return;
    await this.setAptStatus(id, 'active', '已取消' + leaveWord + '申请');
  },

  async setAptStatus(id, status, successTip) {
    try {
      // AppointmentController#updateStatusById：PUT，body { id, status }，id 内部 Integer.parseInt
      await request({
        url: ENDPOINTS.APPOINTMENT_UPDATE_STATUS_BY_ID, method: 'PUT',
        data: { id: String(id), status: status }
      });
      wx.showToast({ title: successTip, icon: 'none' });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
