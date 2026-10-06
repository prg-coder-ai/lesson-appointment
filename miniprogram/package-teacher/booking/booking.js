import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { bookingStatusText, normalizeBookingStatus } from '../../shared/domain/bookingState.js';
import { confirm } from '../../core/ui.js';
import { withTerms, term } from '../../core/term.js';

/* ============================================================================
 * 教师端「预订管理」（工作台入口）—— 按排期合并的预约列表
 * ----------------------------------------------------------------------------
 * 需求：列出「当前教师的课程被预约」的列表；显示预约时间；
 *       同一排期的预约合并为一张卡；卡内分别列出每个学生的姓名 + 预约状态。
 *
 * 数据链（与教师端「今日课程」同一套富化思路）：
 *   POST /course/booking/page  （BookingQueryPage: userId + userRole='teacher'
 *                               → SQL 走 b.teacher_id = #{userId} 分支）
 *     ↓ booking.scheduleId
 *   GET  /schedule/detail/{id} → startTime/endTime/name/timeZone/courseId
 *     ↓ schedule.courseId
 *   GET  /course/{id}          → courseName
 *   GET  /user/name/{id}       → 学生姓名
 *
 * 性能：/booking/page 只 `SELECT b.*`（虽 join 了 course 但没取列），课程与学生名必须
 *       客户端富化。为免 N+1，先用 2 次批量请求建映射（教师全部排期 + 教师全部课程），
 *       批量缺失的再用 detail 逐条补齐（排期列表接口只返回 active 排期）。
 *
 * 全部复用既有端点，不动 api。
 * ========================================================================== */

const BATCH = 100;   // 单次翻页条数（教师名下预约量级很小，一次基本拉全）
const MAX_PAGE = 10; // 安全闸：防分页异常死循环

// 预约状态筛选：文案统一取共享领域层 bookingStatusText（单一权威源）
const STATUS_OPTIONS = [
  { v: '', t: '全部' },
  { v: 'booking', t: '待确认' },
  { v: 'waiting', t: '候补' },
  { v: 'booked', t: '已确认' },
  { v: 'canceling', t: '取消待确认' },
  { v: 'cancelled', t: '已取消' },
  { v: 'completed', t: '已完成' }
];

// 后端 XxxController#xxxPage 返回 Result<PageResult<X>>：data 是
// { rows, total, pageNum, pageSize, totalPages }。字段名是 rows，不是 list/records
// （取错会 fallback 到整个对象，随后 rows.map 抛错被 catch 吞掉 → 列表恒空）。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

// 带缓存的并发加载器：同一 key 只发一次请求
function memo(map, key, loader) {
  if (key === null || key === undefined || key === '') return Promise.resolve(null);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = loader().catch(() => null);
  }
  return map[key];
}

function fmtDT(s) {
  if (!s) return '';
  return String(s).replace('T', ' ').slice(0, 16);
}

// 排期信息 → 「预约时间」文案，口径对齐 Web getScheduleInfo(scheduleObject)：
// 排期名称 + 起始日期 ~ 结束日期 + 上课时间（同日则直接给完整时间）。
function scheduleInfo(sc) {
  if (!sc) return '';
  let info = sc.name ? String(sc.name) : '';
  const st = fmtDT(sc.startTime);
  const en = fmtDT(sc.endTime);
  if (st) {
    const sd = st.slice(0, 10);
    const ed = en.slice(0, 10);
    const hm = st.slice(11);
    let dateStr = '';
    if (ed && ed !== sd) dateStr = sd + ' ~ ' + ed + ' ' + hm;
    else dateStr = st;
    info += dateStr ? ' ' + dateStr : '';
  }
  return info.trim();
}

// 状态 → 色调（红=已取消/被拒，橙=待处理，绿=已确认，蓝=已完成）
function toneOf(status) {
  const s = normalizeBookingStatus(status);
  if (s === 'booked') return 'ok';
  if (s === 'completed') return 'done';
  if (s === 'booking' || s === 'waiting' || s === 'canceling') return 'warn';
  return 'bad';
}

// 页面 / 卡片标题固定为「预订管理」——菜单名不参与行业词转换。
// 此前用 {{terms.student}}预约：租户把 student 映射成「客户」时整卡渲染出「客户预约」，
// 与 Web 端 teacher.html 的固定菜单名不一致。
// 注意：不要再在 onLoad/onShow 里调 setNavigationBarTitle 动态改标题，
// 否则会把 booking.json 里的固定标题覆盖回行业词。
Page(withTerms({
  data: {
    list: [],
    loading: false,
    error: '',
    status: '',
    keyword: '',
    statusOptions: STATUS_OPTIONS,
    totalStudents: 0
  },

  // 导航栏标题由 booking.json 的 navigationBarTitleText 固定提供，不再运行时改写。
  // （withTerms 自身会在 onLoad/onShow 注入并刷新 data.terms，本页无需自定义 onShow）
  onLoad() { this.load(); },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },
  onStatusFilter(e) {
    const s = e.currentTarget.dataset.s || '';
    if (s === this.data.status) return;
    this.setData({ status: s });
    this.load();
  },
  onSearchInput(e) { this.setData({ keyword: e.detail.value || '' }); },
  onSearch() { this.load(); },
  onClearSearch() { this.setData({ keyword: '' }); this.load(); },

  /* ---------------- 取数：分页循环取全量（聚合需要全量，故不交给服务端分页） --------------- */
  async fetchAll(u) {
    const all = [];
    for (let p = 1; p <= MAX_PAGE; p++) {
      let pr = null;
      let err = null;
      try {
        pr = await request({
          url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
          data: {
            pageNum: p, pageSize: BATCH,
            userId: u.userId, userRole: u.role
          },
          customErrorMsg: false
        });
      } catch (e) { err = e; pr = null; }
      // 首页就失败 → 抛出去，让空态显示「加载失败 + 重试」；
      // 后续页失败则保留已取到的数据（少显示比整页报错好）。
      if (!pr) {
        if (p === 1 && err) throw err;
        break;
      }
      const rows = pickRows(pr);
      if (!rows.length) break;
      all.push.apply(all, rows);
      if (rows.length < BATCH) break;
    }
    return all;
  },

  /* ---------------- 富化：排期 / 课程批量映射 + 姓名逐条（带缓存） ---------------- */
  async enrich(rows, u) {
    const schMap = {};   // scheduleId  → CourseSchedule
    const crsMap = {};   // courseId    → Course
    const schMemo = {};  // scheduleId  → Promise（批量未命中时逐条补）
    const crsMemo = {};  // courseId    → Promise
    const usMemo = {};   // userId      → Promise

    // 批量①：当前教师全部「生效中」排期（1 次请求代替 N 次 detail）
    try {
      const scs = await request({
        url: ENDPOINTS.SCHEDULE_LIST_BY_TEACHER(u.userId), method: 'GET', customErrorMsg: false
      });
      (Array.isArray(scs) ? scs : []).forEach(s => {
        if (s && s.scheduleId) schMap[s.scheduleId] = s;
      });
    } catch (e) { /* 批量失败：下面逐条兜底 */ }

    // 批量②：当前教师全部课程（1 次请求；不限 status，故 pending/inactive 课程也能显示名）
    try {
      const params = { pageNum: 1, pageSize: 200 };
      if (u.role === 'teacher') params.teacherId = u.userId;
      const pr = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'GET', params, customErrorMsg: false
      });
      pickRows(pr).forEach(c => {
        if (c && c.courseId) crsMap[c.courseId] = c;
      });
    } catch (e) { /* 批量失败：下面逐条兜底 */ }

    const tasks = rows.map(async function (b) {
      const sid = b.scheduleId;
      const schedule = schMap[sid] || await memo(schMemo, sid, () => request({
        url: ENDPOINTS.SCHEDULE_DETAIL(sid), method: 'GET', customErrorMsg: false
      }));
      const cid = schedule && schedule.courseId;
      const course = crsMap[cid] || await memo(crsMemo, cid, () => request({
        url: ENDPOINTS.COURSE_DETAIL(cid), method: 'GET', customErrorMsg: false
      }));
      const name = await memo(usMemo, b.studentId, () => request({
        url: ENDPOINTS.USER_NAME(b.studentId), method: 'GET', customErrorMsg: false
      }));

      return {
        bookingId: b.bookingId,
        scheduleId: sid || '',
        courseId: cid || '',
        className: (course && (course.courseName || course.title)) || term('course'),
        scheduleName: (schedule && schedule.name) || '',
        scheduleText: scheduleInfo(schedule),
        timeZone: (schedule && schedule.timeZone) || '',
        startTime: fmtDT(schedule && schedule.startTime),
        studentId: b.studentId,
        studentName: (typeof name === 'string' && name) ? name : (term('student') + ' ' + String(b.studentId || '').slice(-4)),
        status: b.status,
        statusText: bookingStatusText(b.status),
        tone: toneOf(b.status),
        applyTime: fmtDT(b.createTime)
      };
    });
    return Promise.all(tasks);
  },

  /* ---------------- 分组：同一排期 → 一张卡；卡内每个学生一行 ---------------- */
  group(items) {
    const buckets = {};
    const order = [];
    items.forEach(function (it) {
      const key = it.scheduleId || it.bookingId || 'unknown';
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) { buckets[key] = []; order.push(key); }
      buckets[key].push(it);
    });

    return order.map(function (k) {
      const arr = buckets[k];
      // 卡内按申请时间升序（先来先得，教师据此决定确认顺序）
      arr.sort(function (a, b) {
        const ta = a.applyTime || '', tb = b.applyTime || '';
        return ta < tb ? -1 : (ta > tb ? 1 : 0);
      });
      const first = arr[0] || {};
      return {
        key: k,
        className: first.className,
        scheduleText: first.scheduleText || '排期时间未知',
        timeZone: first.timeZone || '',
        startTime: first.startTime || '',
        courseId: first.courseId || '',
        scheduleId: first.scheduleId || '',
        total: arr.length,
        students: arr.map(function (s) {
          const st = normalizeBookingStatus(s.status);
          return {
            bookingId: s.bookingId,
            name: s.studentName,
            status: s.status,
            statusText: s.statusText,
            tone: s.tone,
            applyTime: s.applyTime,
            // 动作可见性交给共享领域层语义：待确认/候补可确认，已确认/取消待确认可取消
            canConfirm: st === 'booking' || st === 'waiting',
            canCancel: st === 'booked' || st === 'canceling'
          };
        })
      };
    }).sort(function (a, b) {
      // 排期时间升序；无时间的排到最后
      const ta = a.startTime, tb = b.startTime;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });
  },

  /* ---------------- 客户端筛选（服务端 status 过滤会破坏"同排期合并"的完整性，故本地做） --- */
  applyFilters(groups) {
    const st = this.data.status ? normalizeBookingStatus(this.data.status) : '';
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const out = [];
    groups.forEach(function (g) {
      let stu = g.students;
      if (st) stu = stu.filter(s => normalizeBookingStatus(s.status) === st);
      // 关键词命中课程名 → 保留该排期全部学生；否则按学生姓名过滤
      if (kw) {
        const courseHit = (g.className || '').toLowerCase().indexOf(kw) >= 0
          || (g.scheduleText || '').toLowerCase().indexOf(kw) >= 0;
        if (!courseHit) stu = stu.filter(s => (s.name || '').toLowerCase().indexOf(kw) >= 0);
      }
      if (!stu.length) return;
      out.push(Object.assign({}, g, { students: stu, shown: stu.length }));
    });
    return out;
  },

  async load() {
    if (this.data.loading) return;
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true, error: '' });
    try {
      const rows = await this.fetchAll(u);
      const items = await this.enrich(rows, u);
      const list = this.applyFilters(this.group(items));
      let n = 0;
      list.forEach(g => { n += g.students.length; });
      this.setData({ list: list, totalStudents: n });
    } catch (e) {
      // 把错误落到页面上（此前只有 toast，一闪而过后页面仍是"暂无预约"，无法区分
      // "确实没预约" 与 "接口/解析失败"）。
      const msg = (e && e.message) || '加载失败';
      this.setData({ list: [], totalStudents: 0, error: msg });
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /* ---------------- 单条预约状态操作（确认 / 拒绝 / 取消） ---------------- */
  async act(e) {
    const { id, status, label } = e.currentTarget.dataset;
    if (!id) return;
    const ok = await confirm('确定' + label + '该' + term('student') + '的预约？', { title: '确认' });
    if (!ok) return;
    try {
      // 后端 BookingController#updateStatus 收的是 BookingDTO{ id, status }——
      // 字段名必须是 id（小写）！此前传 bookingId 会让 dto.getId() 为 null，
      // 直接抛「预订记录不存在」，表现为按钮点了没反应。
      await request({
        url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST',
        data: { id: id, status: status }
      });
      wx.showToast({ title: label + '成功', icon: 'none' });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
