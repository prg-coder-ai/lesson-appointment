import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { appointmentStatusText } from '../../shared/domain/appointmentState.js';
import { bookingStatusText, normalizeBookingStatus } from '../../shared/domain/bookingState.js';
import { term as termText, withTerms } from '../../core/term.js';

/* ============================================================================
 * 教师端「今日{课程}」—— 展示对齐 Web（frontend/js/public/appointmentNotes.js）
 * ----------------------------------------------------------------------------
 * 前端 teacher 分支的做法（formAppointmentGroupTr）：
 *   ① 数据源：POST /course/appointment/statistical/listByDaysByPage 循环翻页取全量
 *      （服务端逐条分页会把同一排期拆到不同页，聚合行数与分页总数对不上）；
 *   ② 依赖链：appointment → booking（studentId/teacherId/scheduleId）
 *             → schedule（courseId/timeZone）→ course（courseName）
 *             + 学生/教师姓名经 /user/name/{id} 解析，全程带缓存；
 *   ③ 分组：同一 scheduleId + 同一上课日期 的课次聚合为一行；
 *   ④ 行内容（本页对齐目标）：序号 / {课程}名称 / 学生列表 / {教师} / {时间}(+时区) / 状态
 *      + 操作「申请改期 / 取消改期」（前端 teacherRescheduleTodayGroup）。
 *
 * 本页两处**超出前端**的增强（用户要求）：
 *   · 所有标签 / 输入框 placeholder 的行业词化（{{terms.*}}，页面用 withTerms 包装）；
 *   · 学生列表**逐人**展示各自的「预约(booking)」状态 —— 前端只拼姓名字符串。
 *     故状态必须取 booking.status（appointment.status 是课次状态，不是预约状态）。
 * 全部复用既有端点，不动 api。
 * ========================================================================== */

const BATCH = 200;   // 单次翻页条数（与前端 teacher 分支一致）
const MAX_PAGE = 20; // 安全闸：防后端分页异常导致死循环

function fmtTime(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').slice(0, 16);
}
function datePart(s) {
  if (!s) return '';
  return String(s).slice(0, 10);
}

// 行业词取值（词表未就绪 / key 缺失时退回 fallback，避免渲染空串）
function t(key, fallback) {
  try { return termText(key) || fallback; } catch (e) { return fallback; }
}

function statusLabel(st) {
  return appointmentStatusText(st, { teacherLabel: t('teacher', '教师') });
}

// 预约(booking)状态 → 色调：绿=已确认 / 黄=已完成 / 橙=待处理(待确认·候补·取消待确认) / 红=已取消·被拒
// 语义与共享领域层 normalizeBookingStatus 对齐（与学生预约页同一套口径）
function toneOfBooking(status) {
  const s = normalizeBookingStatus(status);
  if (s === 'booked') return 'ok';
  if (s === 'completed') return 'done';
  if (s === 'booking' || s === 'waiting' || s === 'canceling') return 'warn';
  return 'bad';
}

// 状态筛选：文案统一取共享领域层（单一权威源），避免小程序再写一套 switch
const STATUS_OPTIONS = [
  { v: '', t: '全部' },
  { v: 'active', t: '生效' },
  { v: 'noted1', t: '已通知' },
  { v: 'completed', t: '已完成' },
  { v: 't-cancelling', t: '取消中' },
  { v: 'cancelled', t: '已取消' },
  { v: 't-reject', t: '已拒绝' },
  { v: 'changed', t: '已改期' }
];

// 带缓存的并发加载器：同一 key 只发一次请求，多个调用方共享同一个 Promise
function memo(map, key, loader) {
  if (key === null || key === undefined || key === '') return Promise.resolve(null);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = loader().catch(() => null);
  }
  return map[key];
}

Page(withTerms({
  data: {
    list: [],
    loading: false,
    days: 7,
    status: '',
    keyword: '',
    statusOptions: STATUS_OPTIONS,
    total: 0
  },

  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.user = u;
    this.applyTitle();
    this.load();
  },
  // 导航栏标题也接行业词（今日课程 / 今日咨询话题 / 今日咨询项目）。
  // 注意与「预订管理」那类**固定**标题页面的区别：这里标题**需要**随行业变，
  // 所以必须保留运行时 wx.setNavigationBarTitle；json 的 navigationBarTitleText 仅作首帧兜底。
  // onShow 每次重设，兜住「行业切换后返回本页」的场景（json 不支持动态，只能运行时改）。
  onShow() { this.applyTitle(); },
  applyTitle() {
    wx.setNavigationBarTitle({ title: '今日' + t('course', '课程') });
  },

  /* ---------------- 取数：分页循环取全量（前端 teacher 分支同款） ---------------- */
  async fetchAllRows() {
    const u = this.user;
    const body = () => ({
      pageNum: 1,
      pageSize: BATCH,
      userId: u.userId,
      userRole: u.role || 'teacher',
      days: this.data.days,
      status: this.data.status || undefined,
      courseName: (this.data.keyword || '').trim() || undefined
    });
    const all = [];
    for (let p = 1; p <= MAX_PAGE; p++) {
      const q = body();
      q.pageNum = p;
      let pr = null;
      try {
        pr = await request({
          url: ENDPOINTS.APPOINTMENT_LIST_BY_DAYS_PAGE,
          method: 'POST',
          data: q,
          customErrorMsg: false
        });
      } catch (e) {
        pr = null;
      }
      // 兜底：分页版不可用（老版本后端/路由未覆盖）时退回 GET listByDays（days<=0 已由后端修为全量）
      if (pr === null && p === 1) {
        try {
          const fb = await request({
            url: ENDPOINTS.APPOINTMENT_LIST_BY_DAYS(this.data.days, u.userId, u.role),
            method: 'GET',
            customErrorMsg: false
          });
          return Array.isArray(fb) ? fb : ((fb && (fb.list || fb.rows)) || []);
        } catch (e2) {
          return [];
        }
      }
      if (!pr) break;
      const rows = pr.rows || pr.list || pr.records || [];
      if (!rows.length) break;
      all.push.apply(all, rows);
      if (rows.length < BATCH) break;
    }
    return all;
  },

  /* ---------------- 富化：booking → schedule → course + 姓名 ---------------- */
  enrich(rows) {
    const bk = {}, sc = {}, cs = {}, us = {};
    const tasks = rows.map(async function (a) {
      const booking = await memo(bk, a.bookingId, () => request({
        url: ENDPOINTS.BOOKING_DETAIL(a.bookingId), method: 'GET', customErrorMsg: false
      }));
      const schedule = booking
        ? await memo(sc, booking.scheduleId, () => request({
            url: ENDPOINTS.SCHEDULE_DETAIL(booking.scheduleId), method: 'GET', customErrorMsg: false
          }))
        : null;
      const course = schedule
        ? await memo(cs, schedule.courseId, () => request({
            url: ENDPOINTS.COURSE_DETAIL(schedule.courseId), method: 'GET', customErrorMsg: false
          }))
        : null;
      const studentName = booking
        ? await memo(us, booking.studentId, () => request({
            url: ENDPOINTS.USER_NAME(booking.studentId), method: 'GET', customErrorMsg: false
          }))
        : null;
      const teacherName = booking
        ? await memo(us, booking.teacherId, () => request({
            url: ENDPOINTS.USER_NAME(booking.teacherId), method: 'GET', customErrorMsg: false
          }))
        : null;

      const tm = fmtTime(a.appointmentDatetime);
      return {
        appointmentId: a.id,
        bookingId: a.bookingId,
        scheduleId: (schedule && schedule.scheduleId) || (booking && booking.scheduleId) || '',
        courseId: (schedule && schedule.courseId) || (course && course.courseId) || '',
        className: (course && (course.courseName || course.title)) || t('course', '课程'),
        classIndex: a.classIndex,
        studentName: (typeof studentName === 'string' && studentName) ? studentName : '—',
        teacherName: (typeof teacherName === 'string' && teacherName) ? teacherName : '',
        time: tm,
        date: datePart(tm),
        tz: (schedule && schedule.timeZone) || '',
        // 课次状态（聚合后展示在卡头）
        status: a.status,
        statusText: statusLabel(a.status),
        // 该学生「预约(booking)」状态 —— 逐人展示，故取 booking.status；appointment.status 是课次状态
        bkStatus: booking ? booking.status : '',
        bkStatusText: booking ? bookingStatusText(booking.status) : '',
        bkTone: toneOfBooking(booking && booking.status)
      };
    });
    return Promise.all(tasks);
  },

  /* ---------------- 分组：同一排期 + 同一日期 → 一行 ---------------- */
  group(items) {
    const buckets = {};
    const order = [];
    items.forEach(function (it) {
      const key = (it.scheduleId || it.bookingId || 'unknown') + '|' + it.date;
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) { buckets[key] = []; order.push(key); }
      buckets[key].push(it);
    });

    const groups = order.map(function (k) {
      const arr = buckets[k];
      const stSet = [];
      const stList = [];
      const stuSeen = {};
      const students = [];
      let minTime = '';
      arr.forEach(function (it) {
        // 逐学生一行：姓名 + 各自的「预约」状态。
        // 同一学生在该 排期+日期 下若有多条课次，状态并列展示而不重复成行。
        const name = it.studentName || '—';
        let row = stuSeen[name];
        if (!row) {
          row = { name: name, statusTexts: [], tone: it.bkTone || 'bad' };
          stuSeen[name] = row;
          students.push(row);
        }
        if (it.bkStatusText && row.statusTexts.indexOf(it.bkStatusText) < 0) {
          row.statusTexts.push(it.bkStatusText);
        }
        if (stSet.indexOf(it.statusText) < 0) stSet.push(it.statusText);
        stList.push(it.status);
        if (it.time && (!minTime || it.time < minTime)) minTime = it.time;
      });
      // 收尾：把累积的状态文案拼成展示串
      students.forEach(function (s) {
        s.statusText = s.statusTexts.join('、') || '—';
        delete s.statusTexts;
      });

      const first = arr[0] || {};
      // 组内任一课次处于「取消中」→ 按钮变为「取消改期」（回退为 active）
      const pending = stList.some(function (s) {
        return s === 't-cancelling' || s === 'cancelling' || s === 's-cancelling';
      });
      // 状态色调：红=已取消/已拒绝，橙=取消中，黄=已完成，绿=正常/已通知
      let tone = 'ok';
      if (stList.some(s => s === 'cancelled' || s === 't-cancelled' || s === 't-reject')) tone = 'bad';
      else if (pending) tone = 'warn';
      else if (stList.some(s => s === 'completed')) tone = 'done';

      return {
        key: k,
        className: first.className || t('course', '课程'),
        classIndex: first.classIndex,
        count: arr.length,
        students: students,
        studentCount: students.length,
        teacherName: first.teacherName || '',
        time: minTime || first.time || '',
        tz: first.tz || '',
        courseId: first.courseId || '',
        scheduleId: first.scheduleId || '',
        statusList: stList,
        statusText: stSet.join('、'),
        tone: tone,
        pending: pending,
        aptIds: arr.map(it => it.appointmentId).filter(x => x !== null && x !== undefined)
      };
    });

    groups.sort(function (a, b) {
      const ta = a.time || '', tb = b.time || '';
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });
    return groups;
  },

  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const rows = await this.fetchAllRows();
      const items = await this.enrich(rows);
      let groups = this.group(items);

      // 服务端未必实现 courseName / status 过滤（前端传的 name 后端其实不认），
      // 这里在客户端再兜一层，保证筛选一定有反馈。
      if (this.data.status) {
        groups = groups.filter(g => g.statusList.indexOf(this.data.status) >= 0);
      }
      const kw = (this.data.keyword || '').trim();
      if (kw) {
        groups = groups.filter(g => (g.className || '').indexOf(kw) >= 0);
      }
      // 序号：聚合后按预约时间升序编 1..N（对齐前端「序号」列）
      const list = groups.map((g, i) => Object.assign({}, g, { index: i + 1 }));
      this.setData({ list: list, total: list.length });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onDayChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.days) return;
    this.setData({ days: days });
    this.load();
  },
  onStatusChange(e) {
    const status = e.currentTarget.dataset.s;
    if (status === this.data.status) return;
    this.setData({ status: status });
    this.load();
  },
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },
  onSearch() {
    this.load();
  },
  onClearSearch() {
    this.setData({ keyword: '' });
    this.load();
  },

  // 点「查看排期」→ 下钻到该课程排期页（对齐前端「查看排期」）
  goSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: '该' + t('lessonNumber', '课次') + '未关联' + t('course', '课程'), icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/package-teacher/schedule/schedule?courseId=' + id });
  },

  // 「申请改期 / 取消改期」：整组课次批量置 t-cancelling / active（前端 teacherRescheduleTodayGroup）
  async onReschedule(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const g = this.data.list[idx];
    if (!g || !g.aptIds || !g.aptIds.length) return;
    const apply = !g.pending;
    const target = apply ? 't-cancelling' : 'active';
    const ok = await new Promise(function (resolve) {
      wx.showModal({
        title: apply ? '申请改期' : '取消改期',
        content: apply
          ? '将把「' + g.className + '」本组 ' + g.count + ' 个' + t('lessonNumber', '课次')
            + '标记为「' + statusLabel('t-cancelling') + '」，需管理员确认。'
          : '将把「' + g.className + '」本组 ' + g.count + ' 个' + t('lessonNumber', '课次')
            + '恢复为「' + statusLabel('active') + '」。',
        success: function (r) { resolve(!!r.confirm); },
        fail: function () { resolve(false); }
      });
    });
    if (!ok) return;

    wx.showLoading({ title: '处理中…', mask: true });
    try {
      for (let i = 0; i < g.aptIds.length; i++) {
        await request({
          url: ENDPOINTS.APPOINTMENT_UPDATE_STATUS_BY_ID,
          method: 'PUT',
          data: { id: g.aptIds[i], status: target },
          customErrorMsg: false
        });
      }
      wx.hideLoading();
      wx.showToast({ title: apply ? '已提交改期申请' : '已取消改期', icon: 'none' });
      this.load();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
