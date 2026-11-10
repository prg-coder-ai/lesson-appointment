// 租户管理端 · 数据总览（对应网页版 admin.html 的"数据总览"）
// 关键：以下统计均经租户插件按当前登录租户自动隔离，返回的为本租户数据，
// 不再像旧版那样显示平台级 tenantCount/userCount 等跨租户汇总。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { ROLES } from '../../shared/constants.js';
import { withTerms } from '../../core/term.js';

function safeNum(v) { return (typeof v === 'number') ? v : null; }

// 平台管理员「待审核」的 admin 账号分页参数：/user/page 的 mapper SQL 无 tenantId 条件，
// 只能拉 rows 后本地归属过滤，故每页取大一些减少请求数；20 页 = 2000 个账号上限，防异常数据拖死页面。
const PLATFORM_ADMIN_PAGE_SIZE = 100;
const PLATFORM_ADMIN_MAX_PAGE = 20;

Page(withTerms({
  data: {
    active: 'dashboard',
    loading: true,
    stat: {
      teacher: null, student: null, course: null, booking: null, appoint: null
    },
    pending: { booking: 0, cancelling: 0, today: 0, rescheduleStudent: 0, rescheduleTeacher: 0 },
    // 平台管理员与租户管理员共用本页（tabGroupForRole 把 platform_admin 归到 admin 组）。
    // isPlatform 由 onLoad 按登录角色确定，驱动「待审核」卡片两套渲染。
    isPlatform: false,
    platformPending: { newTenants: 0, admins: 0 }
  },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    // 用实例字段而非依赖 setData 的异步视图更新：load() 紧接着就会读它
    this._isPlatform = (u.role === ROLES.PLATFORM_ADMIN);
    this.setData({ isPlatform: this._isPlatform });
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
      // 「今日课程」角标只服务于租户管理员的待审核卡片；平台版不显示，省掉一次请求
      this._isPlatform ? Promise.resolve(null)
        : request({ url: ENDPOINTS.STAT_APPOINT_ON_DAYS(1), method: 'GET', customErrorMsg: false }).catch(() => null)
    ]);

    const stat = {
      teacher: userStat ? safeNum(userStat.teacherMonthEnd) : null,
      student: userStat ? safeNum(userStat.studentMonthEnd) : null,
      course: courseStat ? safeNum(courseStat.courseMonthEnd) : null,
      booking: bookingStat ? safeNum(bookingStat.bookingMonth) : null,
      appoint: appointStat ? safeNum(appointStat.appMonth) : null
    };

    // 平台管理员（2026-11-05 定案方案一）：待审核只保留「新自注册租户 / 其管理员账号」两项。
    // 原 5 行是单租户运营待办，平台管理员 tenantId=0 查到的是全平台汇总，既无归属口径
    // 也没有对应的平台审批入口；这里直接跳过 4 个 booking/appointment 计数请求。
    // 顶部 5 张统计卡片本次不动（保持全平台汇总）。
    if (this._isPlatform) {
      const platformPending = await this.loadPlatformPending()
        .catch(() => ({ newTenants: 0, admins: 0 }));
      this.setData({ loading: false, stat, platformPending });
      return;
    }

    // 租户管理员：待审核计数 = booking 整单级（预订/取消）+ appointment 课次级改期申请
    // （学生 cancelling / 教师 t-cancelling）。与网页版「数据总览 → 待审核」卡片同口径
    // （2026-10-12 对齐）；均用分页接口取 total，不拉全量。
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

  // 平台管理员「待审核」口径（方案一 A/A）：
  //   新自注册租户 = trial_status='trial'（PromoService.registerTenant 打标；转正 converted /
  //   过期 expired 后自动不再计入）。老数据无该字段时用 referredBy 推广归因兜底；平台管理员
  //   手工新建的租户两者皆空 → 天然排除。/tenant/list 后端已按 deleted=0 过滤，这里再兜一层。
  //   其管理员个数 = 这些租户名下 role='admin' 的账号总数（首管理员 active + 后续 pending 都算）。
  // ⚠ 不能靠给 /user/page 传 tenantId 过滤：UserMapper.listByConditionPage 的 SQL 根本没有
  //   tenantId 条件，且平台管理员 tenantId=0 时租户插件 ignoreTable 返回 true、不拼租户条件，
  //   传了也不生效；只能拉回 rows 后按 tenantId 本地归属过滤。
  async loadPlatformPending() {
    const tenantsRaw = await request({
      url: ENDPOINTS.TENANT_LIST, method: 'GET', customErrorMsg: false
    });
    const tenants = Array.isArray(tenantsRaw) ? tenantsRaw
      : ((tenantsRaw && Array.isArray(tenantsRaw.rows)) ? tenantsRaw.rows : []);

    const trialIds = Object.create(null);
    let newTenants = 0;
    tenants.forEach(t => {
      if (!t || t.id == null || Number(t.deleted) === 1) return;
      const isSelfRegistered = t.trialStatus === 'trial'
        || (!t.trialStatus && String(t.referredBy || '').trim() !== '');
      if (!isSelfRegistered) return;
      newTenants++;
      trialIds[String(t.id)] = true;
    });

    let admins = 0;
    for (let pageNum = 1; pageNum <= PLATFORM_ADMIN_MAX_PAGE; pageNum++) {
      const res = await request({
        url: ENDPOINTS.USER_PAGE, method: 'GET', customErrorMsg: false,
        params: { role: 'admin', pageNum, pageSize: PLATFORM_ADMIN_PAGE_SIZE }
      });
      const rows = (res && Array.isArray(res.rows)) ? res.rows : (Array.isArray(res) ? res : []);
      rows.forEach(u => {
        if (u && trialIds[String(u.tenantId)]) admins++;
      });
      const total = (res && typeof res.total === 'number') ? res.total : null;
      if (rows.length < PLATFORM_ADMIN_PAGE_SIZE) break;
      if (total !== null && pageNum * PLATFORM_ADMIN_PAGE_SIZE >= total) break;
    }
    return { newTenants, admins };
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
  //   两者都不带 → 缺省页面（全部状态 + 近 1 天），供「今日课程」行使用
  //   （近 1 天与该行角标 STAT_APPOINT_ON_DAYS(1) 同口径，进去条数即对齐）。
  //
  // 为什么改期待确认要带 days=0：该角标由 countAppointment(status) 统计，
  // 走 APPOINTMENT_PAGE 只按 status 过滤、**不设时间窗**（全时段口径）；
  // 而上一天数窗口（默认「近 1 天」）作用在 appointment_datetime（上课时间）上，
  // 会把「上课时间在窗口之外」的待处理申请整条挡掉（角标 3 条、点进去 0 条）。
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
