import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { appointmentStatusText } from '../../shared/domain/appointmentState.js';
import { formatDateTime } from '../../shared/domain/datetime.js';
import { classroomEntryActions, classroomPhaseOf, classroomKeyOf, CLASSROOM_ACTION }
  from '../../shared/domain/classroom.js';
import { classroomVisible, ensureClassroomConfig, enterClassroomPrompt }
  from '../../core/classroom.js';
import { term as termText, applyTermsToPage, registerTermUpdate, unregisterTermUpdate } from '../../core/term.js';

function fmtTime(s) {
  if (!s) return '时间待定';
  return formatDateTime(s, false);
}

// 行业词取值（词表未就绪 / key 缺失时退回 fallback，避免渲染空串）
function t(key, fallback) {
  try { return termText(key) || fallback; } catch (e) { return fallback; }
}

Page({
  data: {
    list: [], loading: false, days: 7,
    // 在线课堂入口（租户级开关）：false 时整列按钮都不渲染
    classroomOn: false
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.user = u;
    // 行业词注入（等价于 withTerms 包装：注入 data.terms + 注册刷新监听）
    this.__termListener = () => applyTermsToPage(this);
    registerTermUpdate(this.__termListener);
    applyTermsToPage(this);
    this.applyTitle();
    this.syncClassroomEntry();
    this.load();
  },
  // 导航栏标题也接行业词（今日课程 / 今日咨询话题 / 今日咨询项目）。
  // 标题**需要**随行业变，故保留运行时 wx.setNavigationBarTitle；json 的 navigationBarTitleText 仅作首帧兜底。
  // onShow 每次重设，兜住「行业切换后返回本页」的场景（json 不支持动态，只能运行时改）。
  onShow() { applyTermsToPage(this); this.applyTitle(); this.syncClassroomEntry(); },
  onUnload() { if (this.__termListener) unregisterTermUpdate(this.__termListener); },
  applyTitle() {
    wx.setNavigationBarTitle({ title: '今日' + t('course', '课程') });
  },
  /**
   * 课堂开关：先按本地缓存给一次（未核对时先显示 —— 宁可见一次，也不让入口无声消失），
   * 再向后端核对一次收敛。顺序反过来会让网络慢的用户永远看不到入口。
   * 开关状态变化后要重载列表，否则按钮要等下次刷新才出现。
   */
  syncClassroomEntry() {
    const before = this.data.classroomOn;
    const now = classroomVisible();
    if (before !== now) this.setData({ classroomOn: now });
    ensureClassroomConfig().then(() => {
      const on = classroomVisible();
      if (this.data.classroomOn !== on) {
        this.setData({ classroomOn: on });
        if (on && !this.data.loading) this.load();
      }
    }).catch(() => {});
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
      // 课堂入口只在租户开通 + 学生角色时装配（教师端本页也有，但教师从「我的课堂」进）
      const withClassroom = this.data.classroomOn && isStudent;

      // appointment 实体**没有 scheduleId**（只有 bookingId + classIndex），
      // 必须按 bookingId 补查 booking 才能拿到排期 id —— 这是本页加课堂按钮的主要增量。
      const bCache = {};
      if (withClassroom) {
        const bids = [...new Set(rows.map(r => r.bookingId).filter(Boolean))];
        await Promise.all(bids.map(async (bid) => {
          try {
            bCache[bid] = await request({
              url: ENDPOINTS.BOOKING_DETAIL(bid), method: 'GET', customErrorMsg: false
            }) || null;
          } catch (e) { bCache[bid] = null; }
        }));
      }

      const list = rows.map(r => {
        const c = cache[r.courseId] || {};
        const title = c.courseName || c.title || (t('course', '课程') + ' ' + (r.courseId || ''));
        const sub = isStudent
          ? ('教师 ' + (c.teacherName || r.teacherId || ''))
          : ('学生 ' + (r.studentId || ''));
        return {
          id: r.id, bookingId: r.bookingId, courseId: r.courseId,
          title, sub, time: fmtTime(r.appointmentDatetime),
          status: r.status, statusText: appointmentStatusText(r.status),
          classroom: withClassroom ? this.buildClassroomEntry(r, bCache[r.bookingId]) : null
        };
      });
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  /**
   * 装配某条预约的课堂入口。
   *
   * 课次阶段按 appointmentDatetime（**UTC 裸串**）+ 课时算，与 Web 端同口径；
   * 课时这里取不到排期 classDuration，按 60 分钟兜底（共享层内部同样兜 60）——
   * 影响仅限「最后一小时」的判定精度，且服务端课堂状态才是最终裁判。
   *
   * 预约状态用 **booking.status**（不是 appointment.status）：后者是课次状态，
   * 已取消/候补要按预约状态才能筛掉。
   */
  buildClassroomEntry(row, booking) {
    const sid = booking && booking.scheduleId;
    if (!sid) return null;
    const phase = classroomPhaseOf(row.appointmentDatetime, 60);
    const actions = classroomEntryActions({
      phase,
      role: 'student',
      status: (booking && booking.status) || row.status,
      enabled: true,
      includePrep: false       // 小程序无设备检测，不给「课前准备」
    });
    if (!actions.length) return null;
    // 服务端没下发 classroomKey（本页只有 appointment + booking），按后端同规则拼：
    // classIndex 为 1-based，≤1 → 裸 scheduleId
    return { key: classroomKeyOf(sid, row.classIndex), actions };
  },

  onDayChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.days) return;
    this.setData({ days });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },

  /** 课堂按钮统一入口：进入课堂 = 说明 + 复制链接；回放 = 到「我的课堂」查录制 */
  onClassroom(e) {
    const { action, key, name } = e.currentTarget.dataset;
    if (!key) return;
    if (action === CLASSROOM_ACTION.ENTER) {
      enterClassroomPrompt(key, name);
      return;
    }
    if (action === CLASSROOM_ACTION.REPLAY) {
      wx.navigateTo({ url: '/package-classroom/my/my' });
    }
  }
});
