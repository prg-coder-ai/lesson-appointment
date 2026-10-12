// 学生端「课程预订」（原「浏览约课」）——课程浏览 + 排期查询 + 预订/候补
//
// 对齐 Web 端 frontend/js/student-bookingCards.js 的三段式流程，但压进一页完成：
//   ① 课程浏览：GET /course/page?status=active&courseName=…（Result<PageResult<Course>>，字段 rows）
//   ② 排期查询：GET /schedule/selectByCourseId/{courseId}?status=active —— 返回 Result<List<ScheduleCreateDTO>>（数组）
//               剩余名额 = 排期 availableSites − GET /course/booking/countByScheduleId/{id}
//   ③ 预订/候补：POST /course/booking/create（Booking 实体），status='booking' 预订 / 'waiting' 候补
//
// 两个致命坑（都在本页修掉）：
//   1. booking.teacher_id 是 NOT NULL —— 而排期表(course_schedule)根本没有 teacher_id 列，
//      教师只能从课程(Course.teacherId)取。原实现（booking-detail）只传 scheduleId/courseId/studentId，
//      teacher_id 落 NULL 直接 500「Column 'teacher_id' cannot be null」，预订根本存不进去。
//   2. 同一学生同一排期有唯一键 uk_booking_schedule_student —— 历史记录（如已取消）必须复用其 bookingId，
//      否则唯一键冲突；服务端 create 内部也只对「非占位」记录做复用更新。
//
// 按钮组合只看共享领域层状态语义（shared/domain/bookingState.js），本页不另立一套判据：
//   无有效预订 + 未满 → 「预订」；无有效预订 + 满额 → 「候补」；
//   已候补/待确认 → 「撤销」；已确认 → 「取消预订」；取消待确认 → 「撤销取消」。
// 满额时后台会拒绝 booking 并被 BookingSeatService 拦下，故这里先在前端给出可行动提示。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { confirm } from '../../core/ui.js';
import { bookingStatusText, normalizeBookingStatus } from '../../shared/domain/bookingState.js';

const PAGE_SIZE = 10;
// 占位状态：这些状态说明「本人已占据/正在申请该排期」，此时不再放出预订/候补按钮
const ACTIVE_STATUSES = ['waiting', 'booking', 'booked', 'canceling', 'cancelling'];

// 后端 XxxController#xxxPage 返回 Result<PageResult<X>>，data 是 { rows, total, ... }。
// 取错字段（list/records）会 fallback 成整个对象，随后 .map 抛错被 catch 吞掉 → 列表恒空。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

// 带缓存的并发取数：同一 key 只发一次请求（课程列表翻页时教师姓名会重复命中）
function memo(map, key, loader) {
  if (key === null || key === undefined || key === '') return Promise.resolve(null);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = loader().catch(() => null);
  }
  return map[key];
}

function dt(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : ''; }
function hm(s) { const v = dt(s); return v ? v.slice(11, 16) : ''; }

// 排期时间 → 一句话：起止同日给「2026-09-27 16:00 ~ 17:00」，跨日给完整两段
function scheduleTimeText(sc) {
  if (!sc) return '';
  const sd = (sc.startDate || '').toString().slice(0, 10) || dt(sc.startTime).slice(0, 10);
  const ed = (sc.endDate || '').toString().slice(0, 10) || dt(sc.endTime).slice(0, 10);
  const st = (sc.startTime || '').toString().slice(0, 5) || hm(sc.startTime);
  const et = (sc.endTime || '').toString().slice(0, 5) || hm(sc.endTime);
  if (!sd) return '';
  if (ed && ed !== sd) return `${sd} ${st} ~ ${ed} ${et}`.trim();
  return `${sd} ${st} ~ ${et}`.trim();
}

// 排期剩余名额文案 + 是否满额。文案与判定分开：满额显示「满额」，但判定必须拿数值
// （若把「满额」当数值 Number() → NaN → 被当成"未满" → 满员时候补按钮反而不出现）。
function remainOf(sc, booked) {
  const total = Number(sc && sc.availableSites);
  if (!Number.isFinite(total)) {
    return { remain: null, full: false, sitesText: '' };
  }
  const remain = Math.max(0, total - (Number(booked) || 0));
  return {
    remain,
    full: remain <= 0,
    sitesText: remain <= 0 ? `满额（共 ${total}）` : `剩余 ${remain} / 共 ${total}`
  };
}

Page(withTerms({
  data: {
    list: [], loading: false, page: 1, finished: false, keyword: '',
    selectedCourseId: '', schLoading: false,
    submitting: false,
    teacherFilter: false
  },

  onLoad(options) {
    this._nameCache = {};      // teacherId → Promise<string>
    // 从「教师主页 → 查看TA的可预订课程」进来：按 teacherId 过滤课程列表
    this.teacherId = (options && options.tid) ? decodeURIComponent(options.tid) : '';
    if (this.teacherId) this.setData({ teacherFilter: true });
    this.load();
  },

  clearTeacherFilter() {
    this.teacherId = '';
    this.setData({ teacherFilter: false, page: 1, list: [], finished: false, selectedCourseId: '' });
    this.load();
  },

  onShow() { this.applyTitle(); },

  // 导航栏标题走行业词（课程/咨询话题/咨询项目/健身科目 + 预订）。
  // 本页标题**确实**随行业变化，故保留运行时设置；booking.json 里的固定标题只作首帧兜底。
  applyTitle() {
    wx.setNavigationBarTitle({ title: (this.data.terms && this.data.terms.course ? this.data.terms.course : '课程') + '预订' });
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [], finished: false, selectedCourseId: '' });
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() { if (!this.data.finished && !this.data.loading) this.load(); },
  onSearch(e) { this.setData({ keyword: e.detail.value }); },
  onConfirmSearch() { this.setData({ page: 1, list: [], finished: false, selectedCourseId: '' }); this.load(); },

  /* ------------------------------ ① 课程浏览 ------------------------------ */
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'GET',
        // 参数名是 courseName（后端 CourseQueryPage.courseName 模糊匹配），不是 keyword；
        // status=active 只列已发布课程，与 Web 端学生约课一致。
        params: {
          pageNum: this.data.page, pageSize: PAGE_SIZE,
          courseName: this.data.keyword || undefined,
          status: 'active',
          teacherId: this.teacherId || undefined   // 从教师主页进来的过滤条件
        }
      });
      const rows = pickRows(res);
      const base = (this.data.page - 1) * PAGE_SIZE;
      // index：跨页连续序号（与 Web 端 renderCourseCards 一致）
      const list = rows.map((c, i) => ({
        index: base + i + 1,
        courseId: c.courseId,
        courseName: c.courseName || c.title || '(未命名)',
        content: c.content || '',
        teacherId: c.teacherId || '',
        teacherName: '',
        opened: false,
        schLoading: false,
        schedules: []
      }));
      this.setData({
        list: this.data.page === 1 ? list : this.data.list.concat(list),
        finished: rows.length < PAGE_SIZE,
        page: this.data.page + 1
      });
      this.resolveTeacherNames(list);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  // 教师姓名异步补：课程分页接口只给 teacherId，姓名要经 /user/name/{id}。
  // 渲染不阻塞（先出课程名），姓名到了再补（memo 缓存，翻页不重复请求）。
  resolveTeacherNames(list) {
    const tasks = (list || []).filter(c => c.teacherId).map(c =>
      memo(this._nameCache, c.teacherId, () => request({
        url: ENDPOINTS.USER_NAME(c.teacherId), method: 'GET', customErrorMsg: false
      })).then(name => ({ courseId: c.courseId, teacherName: (typeof name === 'string' ? name : '') }))
    );
    if (!tasks.length) return;
    Promise.all(tasks).then(arr => {
      const map = {};
      arr.forEach(x => { map[x.courseId] = x.teacherName; });
      const cur = this.data.list.map(c => map[c.courseId] ? Object.assign({}, c, { teacherName: map[c.courseId] }) : c);
      this.setData({ list: cur });
    }).catch(() => {});
  },

  /* ------------------------- ② 点课程 → 排期 + 名额 ------------------------- */
  onCourse(e) {
    const courseId = e.currentTarget.dataset.id;
    const idx = this.data.list.findIndex(c => String(c.courseId) === String(courseId));
    if (idx < 0) return;
    const course = this.data.list[idx];
    // 再次点击同一课程 = 收起（省掉一次请求也没必要保留大块排期）
    if (course.opened) {
      this.setData({ ['list[' + idx + '].opened']: false, ['list[' + idx + '].schedules']: [] });
      if (String(this.data.selectedCourseId) === String(courseId)) this.setData({ selectedCourseId: '' });
      return;
    }
    this.setData({ selectedCourseId: courseId, ['list[' + idx + '].opened']: true, ['list[' + idx + '].schLoading']: true });
    this.loadSchedules(idx, course);
  },

  async loadSchedules(idx, course) {
    let schedules = [];
    try {
      const raw = await request({
        url: ENDPOINTS.SCHEDULE_SELECT_BY_COURSE(course.courseId, 'active'),
        method: 'GET', customErrorMsg: false
      });
      schedules = (Array.isArray(raw) ? raw : pickRows(raw))
        .filter(s => s && (!s.status || s.status === 'active'))   // 服务端已按 status 过滤，这里再兜一层
        .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
    } catch (e) { schedules = []; }

    if (!schedules.length) {
      this.setData({ ['list[' + idx + '].schLoading']: false, ['list[' + idx + '].schedules']: [] });
      return;
    }

    // 本人全部预约（1 次请求代替 N 次「按排期查预订」）→ 按 scheduleId 建索引。
    // 必须传 userId + userRole='student'：后端 BookingQueryPage 只认这两个字段做学生过滤。
    const myBySchedule = await this.loadMyBookings();

    // 各排期已占席位数（后端只统计占位状态，候补/已取消不算）
    const counts = await Promise.all(schedules.map(s =>
      request({ url: ENDPOINTS.BOOKING_COUNT_BY_SCHEDULE(s.scheduleId), method: 'GET', customErrorMsg: false })
        .then(n => Number(n) || 0).catch(() => 0)
    ));

    const rows = schedules.map((s, i) => this.composeSchedule(s, counts[i], myBySchedule[s.scheduleId]));
    this.setData({ ['list[' + idx + '].schLoading']: false, ['list[' + idx + '].schedules']: rows });
  },

  async loadMyBookings() {
    const u = requireAuth();
    if (!u) return {};
    try {
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
        data: { pageNum: 1, pageSize: 200, userId: u.userId, userRole: 'student' },
        customErrorMsg: false
      });
      const map = {};
      pickRows(res).forEach(b => {
        if (!b || !b.scheduleId) return;
        const prev = map[b.scheduleId];
        // 同一排期可能有多条历史记录（已取消 + 重新预订），优先保留仍生效的那条
        const better = !prev || (ACTIVE_STATUSES.indexOf(normalizeBookingStatus(b.status)) >= 0
          && ACTIVE_STATUSES.indexOf(normalizeBookingStatus(prev.status)) < 0);
        if (better) map[b.scheduleId] = b;
      });
      return map;
    } catch (e) { return {}; }
  },

  // 单个排期 → 渲染行（含按钮组合）。所有文案/可见性都在这里算好，WXML 只做属性读取。
  composeSchedule(sc, booked, myBooking) {
    const status = myBooking ? normalizeBookingStatus(myBooking.status) : '';
    const active = status && ACTIVE_STATUSES.indexOf(status) >= 0;
    const { remain, full, sitesText } = remainOf(sc, booked);

    const row = {
      scheduleId: sc.scheduleId,
      // 排期名兜底文案在 JS 里算好：WXML 表达式不做函数调用、也尽量少写括号嵌套
      name: sc.name || (this.data.terms && this.data.terms.schedule) || '排期',
      timeText: scheduleTimeText(sc),
      timeZone: sc.timeZone || '',
      sitesText,
      remain,
      full,
      // 本人当前状态（无预订则为空，模板据此不显示状态徽标）
      statusText: active ? bookingStatusText(status) : '',
      tone: active ? (status === 'booked' ? 'ok' : 'warn') : '',
      bookingId: (myBooking && myBooking.bookingId) || '',
      primaryLabel: '', primaryStatus: '',
      canCancel: false, cancelLabel: '', cancelStatus: ''
    };

    if (!active) {
      // 未满 → 预订；满额 → 候补（Web 同口径：满额时不给「预订」入口，避免必然失败的操作）
      if (full) {
        row.primaryLabel = '候补';
        row.primaryStatus = 'waiting';
      } else {
        row.primaryLabel = '预订';
        row.primaryStatus = 'booking';
      }
      return row;
    }

    // 已有有效预订：只给「撤销/取消」这一个反向动作
    row.canCancel = true;
    if (status === 'waiting') { row.cancelLabel = '撤销候补'; row.cancelStatus = 'cancelled'; }
    else if (status === 'booking') { row.cancelLabel = '撤销申请'; row.cancelStatus = 'cancelled'; }
    else if (status === 'booked') { row.cancelLabel = '取消预订'; row.cancelStatus = 'canceling'; }
    else { row.cancelLabel = '撤销取消'; row.cancelStatus = 'booked'; }   // canceling：管理员确认前可撤回
    return row;
  },

  /* --------------------------- ③ 预订 / 候补 / 撤销 --------------------------- */
  onBook(e) {
    const { sid, status } = e.currentTarget.dataset;
    const row = this.findSchedule(sid);
    if (!row) return;
    this.submit(row, status);
  },

  onCancel(e) {
    const { sid, status, label } = e.currentTarget.dataset;
    const row = this.findSchedule(sid);
    if (!row) return;
    this.submit(row, status, label);
  },

  findSchedule(scheduleId) {
    for (const c of this.data.list) {
      const hit = (c.schedules || []).find(s => String(s.scheduleId) === String(scheduleId));
      if (hit) return hit;
    }
    return null;
  },

  async submit(row, status, label) {
    if (this.data.submitting) return;
    const u = requireAuth();
    if (!u) return;

    const course = this.data.list.find(c => (c.schedules || []).some(s => String(s.scheduleId) === String(row.scheduleId)));
    if (!course) return;

    // 名额先拦：满额点「预订」不进入提交（后端也会拦，但那样只能看到一句失败原因）
    if (status === 'booking' && row.full) {
      wx.showToast({ title: '该排期名额已满，可点「候补」排队', icon: 'none' });
      return;
    }
    if (status === 'waiting' && !row.full) {
      wx.showToast({ title: '该排期尚有余位，请直接点「预订」', icon: 'none' });
      return;
    }

    const isCancel = !!label;
    const tip = isCancel ? ('确定' + label + '？')
      : (status === 'waiting' ? '确认加入候补队列？' : '确认预订该时段？');
    const ok = await confirm(tip, { title: isCancel ? '请确认' : '确认预订' });
    if (!ok) return;

    // 教师只能从课程取（排期表无 teacher_id 列），缺失时再查一次课程详情兜底
    let teacherId = course.teacherId || '';
    if (!teacherId) {
      try {
        const c = await request({ url: ENDPOINTS.COURSE_DETAIL(course.courseId), method: 'GET', customErrorMsg: false });
        teacherId = (c && c.teacherId) || '';
      } catch (e2) { /* 下面统一拦 */ }
    }
    if (!teacherId) {
      wx.showToast({ title: '课程未关联' + (this.data.terms && this.data.terms.teacher || '教师') + '，请联系管理员', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (isCancel) {
        // 撤销/取消走 updateStatus（BookingDTO{id,status}，字段名必须是 id）
        await request({
          url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST',
          data: { id: row.bookingId, status: status }
        });
      } else {
        // 预订/候补走 create。同一学生同一排期有唯一键 uk_booking_schedule_student，
        // 服务端 create 内部会用 selectLatestByScheduleAndStudent 找到历史（如已取消）记录并复用更新，
        // 所以这里**不要**自己传 bookingId —— 传了反而可能撞上"占位记录"分支被拒。
        await request({
          url: ENDPOINTS.BOOKING_CREATE, method: 'POST',
          data: {
            scheduleId: row.scheduleId,
            studentId: u.userId,
            teacherId: teacherId,   // NOT NULL：排期表没有该列，只能从课程带过来
            status: status
          }
        });
      }
      wx.showToast({
        title: isCancel ? (label + '成功')
          : (status === 'waiting' ? '候补成功，等待名额释放' : '预订成功，等待管理员确认'),
        icon: 'none'
      });
      // 就地刷新该课程的排期（名额与本人状态都可能已变）
      const idx = this.data.list.findIndex(c => c.courseId === course.courseId);
      if (idx >= 0) await this.loadSchedules(idx, course);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || (isCancel ? '操作失败' : '预订失败'), icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  },

  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
