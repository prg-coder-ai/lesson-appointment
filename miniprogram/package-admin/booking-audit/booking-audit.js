// 租户管理端 · 预订审核（对应 admin.html 的"预订审核"）
// 列表来自 POST /course/booking/page（自动按当前租户隔离；courseName 由后端做 LIKE 筛选）；
// 审核动作走 POST /course/booking/updateStatus（服务端在同一事务内做状态迁移 + 课次级联生成）。
//
// 状态语义（单一权威源 = shared/domain/bookingState.js，文案走小程序档案）：
//   booking=待确认 / waiting=候补 / cancelling=取消待确认 / booked=已确认 /
//   cancelled=已取消 / rej-booking=已拒绝 / rej-cancelling=已拒绝取消 / frozen=已失效
//
// 卡片为什么需要富化：BookingMapper.selectListPage 是 `SELECT b.*`（resultType = Booking 实体），
// 返回体**不含** courseName / 学生名 / 教师名 / 时间 → 必须走 core/enrich.js 按
// booking → schedule → course → user 补（memo 去重 + 并发，不是 N+1）。
//
// 动作范围（**只补审核相关动作**，与用户拍板一致）：
//   booking        → 确认(booked) / 拒绝(rej-booking)
//   cancelling     → 确认取消(cancelled) / 拒绝取消(rej-cancelling)
//   waiting        → 拒绝候补(cancelled)
//   cancelled      → 删除(frozen)
// 刻意**不做**「撤回 / 取消」这类把已生效状态回退的动作（误操作代价高），
// 也不做 waiting 行的「查询递补」（小程序排期页不支持深链定位排期，本期挂账）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { bookingStatusText, normalizeBookingStatus } from '../../shared/domain/bookingState.js';
import { createEnricher } from '../../core/enrich.js';
import { confirm } from '../../core/ui.js';

const PAGE_SIZE = 20;
const MAX_PAGE = 50;

// 状态筛选项（与 Web admin-booking.js 的 #booking-status-select 同值域同顺序；
// 文案取共享领域层的**小程序档案**，与列表列展示保持同一口径）
const STATUS_VALUES = [
  '', 'booking', 'waiting', 'cancelling', 'booked', 'cancelled', 'rej-booking', 'rej-cancelling', 'frozen'
];

function statusOptions() {
  return STATUS_VALUES.map(function (v) {
    return { v: v, t: v === '' ? '全部' : bookingStatusText(v) };
  });
}

// 状态 → 色调：绿=已确认 / 橙=待处理 / 灰=终态 / 红=已取消·被拒·已失效
function toneOf(status) {
  const s = normalizeBookingStatus(status);
  if (s === 'booked') return 'ok';
  if (s === 'booking' || s === 'waiting' || s === 'canceling') return 'warn';
  if (s === 'cancelled' || s === 'rej-booking' || s === 'rej-cancelling' || s === 'frozen') return 'bad';
  return 'done';
}

// 审核动作矩阵（只做审核相关；每个动作 { action: 目标状态, text: 按钮文案, danger: 是否破坏性 }）
function actionsFor(status) {
  const s = normalizeBookingStatus(status);
  if (s === 'booking') {
    return [{ action: 'booked', text: '确认', danger: false },
            { action: 'rej-booking', text: '拒绝', danger: true }];
  }
  if (s === 'canceling') {
    return [{ action: 'cancelled', text: '确认取消', danger: false },
            { action: 'rej-cancelling', text: '拒绝取消', danger: true }];
  }
  if (s === 'waiting') {
    // 候补被拒 = 直接置 cancelled（后端子集里的非占位态），Web 同口径
    return [{ action: 'cancelled', text: '拒绝候补', danger: true }];
  }
  if (s === 'cancelled') {
    // 「删除」在落库语义上由 frozen 承载（BookingStatus.DELETE='delete' 只是动作值、不落库）
    return [{ action: 'frozen', text: '删除', danger: true }];
  }
  return [];
}

// 重复周期文案。Web getRepeatDescription 期待字符串枚举（'day'/'week'…），
// 而 course_schedule.repeat_type 是 int(0/1/2/3)，所以那里对真实数据恒返回空串；这里按数值正确映射。
function repeatText(type, interval, days) {
  const n = Number(type);
  const every = (Number(interval) > 1) ? Number(interval) : '';
  const dayStr = (typeof days === 'string') ? days.trim() : '';
  if (n === 1) return '每' + every + '天一次';
  if (n === 2) return '每' + every + '周' + (dayStr ? '[' + dayStr + ']' : '');
  if (n === 3) return '每' + every + '月' + (dayStr ? '[' + dayStr + ']' : '');
  if (n === 0) return '单次';
  return '';
}

// 排期信息：起始日期 ~ 结束日期 + 上课时刻 + 重复周期（对齐 Web getScheduleInfo(schedule,false) 的口径）
function scheduleInfoOf(it) {
  const parts = [];
  if (it.scheduleName) parts.push(it.scheduleName);
  const st = it.scheduleStart || '';
  const en = it.scheduleEnd || '';
  if (st) {
    const sd = String(st).split(' ')[0] || st;
    const sTime = String(st).split(' ')[1] || '';
    const ed = en ? String(en).split(' ')[0] : '';
    parts.push((ed && ed !== sd) ? (sd + ' ~ ' + ed + ' ' + sTime) : st);
  }
  const rep = repeatText(it.repeatType, it.repeatInterval, it.repeatDays);
  if (rep) parts.push(rep);
  return parts.join(' · ');
}

const ACTION_TIP = {
  booked: '确认该预订？',
  'rej-booking': '拒绝该预订？',
  cancelled: '确认取消？',
  'rej-cancelling': '拒绝取消？',
  frozen: '删除该预订？'
};

Page(withTerms({
  data: {
    list: [],
    // 必须是 false：load() 开头有重入守卫 `if (this.data.loading || ...) return;`，
    // 若首屏初值为 true，onLoad 里的首个 load(true) 会在守卫处直接 return，
    // 而 loading 再没人置回 false → 页面永远停在「加载中…」，下拉刷新也救不回来。
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: 0,
    shown: 0,
    pageNum: 0,
    courseName: '',
    statusOptions: statusOptions(),
    statusIndex: 1,        // 默认「待确认」
    status: 'booking'
  },

  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    this.enricher = createEnricher();
    const f = (options && options.status) || 'booking';
    const idx = STATUS_VALUES.indexOf(f);
    this.setData({
      status: idx >= 0 ? f : 'booking',
      statusIndex: idx >= 0 ? idx : 1
    });
    this.load(true);
  },
  onShow() { this.setData({ statusOptions: statusOptions() }); },

  async load(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const nextPage = reset ? 1 : this.data.pageNum + 1;
    if (!reset && !this.data.hasMore) return;
    if (nextPage > MAX_PAGE) return;

    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST', customErrorMsg: false,
        data: {
          status: this.data.status || undefined,
          courseName: (this.data.courseName || '').trim() || undefined,
          pageNum: nextPage,
          pageSize: PAGE_SIZE
        }
      });
      const rows = (res && (res.rows || (Array.isArray(res) ? res : []))) || [];
      const items = await this.enricher.many(rows);
      const mapped = items.map(function (it, i) {
        const row = rows[i] || {};
        const st = row.status;
        return {
          id: row.bookingId,
          courseName: it.courseName || '',
          scheduleInfo: scheduleInfoOf(it),
          studentName: it.studentName || (it.studentId ? it.studentId : '—'),
          teacherName: it.teacherName || (it.teacherId ? it.teacherId : '—'),
          status: st,
          statusText: bookingStatusText(st),
          tone: toneOf(st),
          // 按钮在 JS 侧算好（WXML 里不能调函数），并带上 dataset 四元组
          actions: actionsFor(st).map(function (a) {
            return {
              action: a.action,
              text: a.text,
              danger: a.danger,
              tip: ACTION_TIP[a.action] || '确定执行该操作？'
            };
          })
        };
      });

      const list = reset ? mapped : this.data.list.concat(mapped);
      const total = (res && res.total) || 0;
      this.setData({
        list: list,
        pageNum: nextPage,
        total: total || list.length,
        shown: list.length,
        hasMore: rows.length >= PAGE_SIZE && (!total || list.length < total),
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false, list: reset ? [] : this.data.list });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  /* ---------------- 检索栏（courseName 由后端 LIKE，无需客户端过滤） ---------------- */
  onCourseNameInput(e) { this.setData({ courseName: e.detail.value || '' }); },
  onSearch() { this.load(true); },
  onStatusChange(e) {
    const idx = Number(e.detail.value);
    const opt = this.data.statusOptions[idx] || { v: '' };
    if (opt.v === this.data.status) return;
    this.setData({ statusIndex: idx, status: opt.v });
    this.load(true);
  },
  onReset() {
    this.setData({ courseName: '', statusIndex: 0, status: '' });
    this.load(true);
  },

  /* ---------------- 审核动作 ---------------- */
  async audit(e) {
    const { id, action, tip } = e.currentTarget.dataset;
    if (!id || !action) return;
    const extra = action === 'frozen'
      ? '\n\n删除后该预订下的课次一并置为「已失效」，会腾出排期席位。'
      : (action === 'booked' ? '\n\n确认后会为预订生成对应课次。' : '');
    const ok = await confirm((tip || '确定执行该操作？') + extra, { title: '预订审核' });
    if (!ok) return;

    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await request({
        url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST', customErrorMsg: false,
        data: { id: id, status: action }
      });
      wx.hideLoading();
      wx.showToast({ title: '已更新', icon: 'success' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { this.load(false); }
}));
