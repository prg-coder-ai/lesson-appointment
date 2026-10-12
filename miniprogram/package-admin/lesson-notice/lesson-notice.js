// 租户管理端 · 上课通知（对应 admin.html 的"预约检视 → 上课通知"）
// 查看近 N 天的**课次**（appointment 维度），与 Web 端 frontend/js/public/appointmentNotes.js
// 的管理员分支同源；不再走预订（booking）维度。
//
// 数据源：POST /course/appointment/statistical/listByDaysByPage
//   —— 入参 days / status / pageNum / pageSize / userTimeZone。
//   —— 出参是 Appointment 实体（只有 id/bookingId/classIndex/appointmentDatetime/status），
//      **不含**课程名、学生名、教师名 → 走 core/enrich.js 做 booking→schedule→course→user 四级
//      富化（memo 去重 + 并发，不会 N+1）。
//
// 行内动作（仅管理员可见；AuthzRules 已限定 PLATFORM_OR_TENANT_ADMIN）：
//   · 发送提醒：GET  /notify-rule/preview?appointmentId=N 试算各档应发时刻与「已发/待发/已过期」
//              → POST /notify-rule/manual-send。由服务端按「当前距上课还有多久」自动选档，
//              不受自动发送的幂等限制，可重复发；已过上课时间会被服务端拒绝。
//   · 确认改期 / 拒绝改期：PUT /course/appointment/updateStatusById
//              学生发起（cancelling / s-cancelling）→ 确认=cancelled，拒绝=reject；
//              教师发起（t-cancelling）→ 确认=t-cancelled，拒绝=t-reject。
//              与 Web 的 confirmCancellingAppointment / teacherConfirmCancellingAppointment 同源。
//
// 与 Web 的一处**有意简化**：Web 的「确认改期」走 adminConfirmCancelWithRule，会先弹退费档位
// 预演再确认；小程序不引退费规则域，改为在确认弹窗里写明「按提交时锁定的档位快照结算」。
// 结算本身仍在服务端 LeaveRefundSettleService 执行，业务结果一致。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms, term as termText } from '../../core/term.js';
import { appointmentStatusText } from '../../shared/domain/appointmentState.js';
import { createEnricher } from '../../core/enrich.js';
import { nowUserTz } from '../../shared/domain/datetime.js';
import { confirm, alert } from '../../core/ui.js';

const PAGE_SIZE = 20;
const MAX_PAGE = 20;   // 安全闸：防后端分页异常导致死循环

// 天数档位（与 Web「近 N 天 / 全部」口径一致；days=0 后端按「全部」处理，边界取 DATETIME 极值）
const DAY_OPTIONS = [
  { v: 1, t: '近 1 天' }, { v: 3, t: '近 3 天' }, { v: 7, t: '近 7 天' },
  { v: 30, t: '近 30 天' }, { v: 0, t: '全部' }
];

// 状态筛选项（服务端 status 精准筛选已支持）；文案取自共享领域层，避免小程序再写一套 switch。
const STATUS_VALUES = [
  '', 'active', 'noted1', 'cancelling', 't-cancelling',
  'completed', 'cancelled', 't-cancelled', 't-reject', 'changed'
];

// 行业词取值（词表未就绪 / key 缺失时退回 fallback，避免渲染空串）
function t(key, fallback) {
  try { return termText(key) || fallback; } catch (e) { return fallback; }
}

function apptText(status) {
  return appointmentStatusText(status, { teacherLabel: t('teacher', '教师') });
}

function statusOptions() {
  return STATUS_VALUES.map(function (v) {
    return { v: v, t: v === '' ? '全部' : apptText(v) };
  });
}

// 「发送提醒」可点性与服务端 NotifyDispatchService.DEAD_APPOINTMENT_STATUS 对齐（含 Web
// isNotifyActionable 的名单）。这里只决定按钮显不显示，真正能不能发由服务端说了算。
const DEAD_STATUS = [
  'completed', 'cancelled', 'canceled', 'changed', 'frozen',
  'cancelling', 'canceling', 's-cancelling', 't-cancelling', 't-cancelled',
  'rej-booking', 'rej-cancelling', 'delete', 'deleted'
];

function canNotify(status) {
  const s = String(status == null ? '' : status).trim();
  return DEAD_STATUS.indexOf(s) < 0;
}

// 状态 → 色调：绿=正常 / 橙=待处理 / 灰=已完成·已改期 / 红=已取消·已拒绝
function toneOf(status) {
  const s = String(status || '').trim();
  if (s === 'cancelled' || s === 'canceled' || s === 't-cancelled'
    || s === 't-reject' || s === 'reject' || s === 'frozen') return 'bad';
  if (s === 'completed' || s === 'changed') return 'done';
  if (s === 'cancelling' || s === 'canceling' || s === 's-cancelling' || s === 't-cancelling') return 'warn';
  return 'ok';
}

// 通知计划 → 弹窗正文（小程序没有富文本弹窗，把档位表压成可读文本）
function notifyPlanText(plan) {
  if (!plan || !plan.points || !plan.points.length) {
    return '未取到该课次的通知计划（可能未配置规则或课次已被处理）。\n'
      + '仍可尝试直接发送：服务端会按「当前距上课还有多久」自动选档。';
  }
  const lines = [];
  if (plan.courseName) lines.push('课程：' + plan.courseName);
  if (plan.lessonTime) lines.push('上课时间：' + plan.lessonTime);
  if (plan.scopeText) lines.push('生效规则：' + plan.scopeText);
  if (plan.fallbackNotice) lines.push('说明：' + plan.fallbackNotice);
  lines.push('');
  plan.points.slice(0, 5).forEach(function (p) {
    lines.push('第' + p.seq + '档 ' + (p.stageText || '')
      + '｜提前 ' + (p.offsetText || '-')
      + '｜' + (p.stateText || '-'));
  });
  if (plan.points.length > 5) lines.push('…共 ' + plan.points.length + ' 档');
  lines.push('');
  lines.push('由服务端按当前提前量自动选档，可重复发送；已过上课时间不再发送（过期档不补发）。');
  return lines.join('\n');
}

Page(withTerms({
  data: {
    list: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: 0,
    shown: 0,
    pageNum: 0,
    // 检索栏
    keyword: '',
    dayLabels: DAY_OPTIONS.map(o => o.t),
    dayIndex: 2,                                       // 默认「近 7 天」
    days: DAY_OPTIONS[2].v,
    statusOptions: statusOptions(),
    statusIndex: 0,
    status: ''
  },

  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.rawList = [];       // 未过滤的原始行（keyword 只在客户端过滤）
    this.enricher = createEnricher();
    this.stageLabels = {};   // { 档位序号: 提前量文案 }，来自租户默认通知规则
    // 先取档位文案再取列表：noted1/noted2 要翻成「已发第 N 档·提前 X」才有排查价值
    // （对齐 Web public/appointmentNotes.js 的 loadNotifyStageLabels）；
    // 拉取失败不阻断列表，标签退化为「已发第 N 档」。
    this.loadStageLabels().then(() => this.load(true)).catch(() => this.load(true));
  },
  onShow() { this.setData({ statusOptions: statusOptions() }); },

  async loadStageLabels() {
    try {
      const rule = await request({
        url: ENDPOINTS.NOTIFY_RULE_DETAIL, method: 'GET', customErrorMsg: false
      });
      const points = (rule && Array.isArray(rule.points)) ? rule.points : [];
      const labels = {};
      points.forEach(function (p, i) {
        const seq = (p.seq === null || p.seq === undefined) ? (i + 1) : Number(p.seq);
        if (seq > 0 && p.offsetText) labels[seq] = p.offsetText;
      });
      this.stageLabels = labels;
    } catch (e) {
      this.stageLabels = {};
    }
  },

  /* ---------------- 取数（分页；reset=从第一页重取） ---------------- */
  async load(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const nextPage = reset ? 1 : this.data.pageNum + 1;
    if (!reset && !this.data.hasMore) return;
    if (nextPage > MAX_PAGE) return;

    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const res = await request({
        url: ENDPOINTS.APPOINTMENT_LIST_BY_DAYS_PAGE,
        method: 'POST',
        customErrorMsg: false,
        data: {
          days: this.data.days,
          status: this.data.status || undefined,
          pageNum: nextPage,
          pageSize: PAGE_SIZE,
          // 课次时间是 UTC 唯一真相源；带 userTimeZone 让后端按用户时区转好，
          // 与 Web appointmentNotes.js:156 的写法一致（不传则后端原样返回 UTC，页面会显示差 8 小时的墙上时间）。
          userTimeZone: nowUserTz()
        }
      });
      const rows = (res && (res.rows || res.list || res.records)) || [];
      const items = await this.enricher.many(rows);
      const courseTerm = t('course', '课程');
      const labels = this.stageLabels || {};
      // noted1/noted2 是「已发第 N 档通知」的历史状态位；管理端需要知道对应第几档、提前多久
      // （判断要不要补发），所以翻成「已发第 N 档·提前 X」而不是笼统的「已通知」。
      function statusTextOf(st) {
        if (st === 'noted1' || st === 'noted2') {
          const seq = st === 'noted1' ? 1 : 2;
          const off = labels[seq];
          return off ? ('已发第' + seq + '档·提前' + off) : ('已发第' + seq + '档');
        }
        return apptText(st);
      }
      const mapped = items.map(function (it, i) {
        const row = rows[i] || {};
        const st = row.status;
        const courseName = it.courseName || courseTerm;
        // classIndex 是「排期下第几次课」（0~N-1，-1 表示默认），对齐 Web 列表的「课程名 + 序号」
        const ci = (row.classIndex === null || row.classIndex === undefined || row.classIndex === -1)
          ? '' : ' · ' + row.classIndex;
        return {
          id: row.id != null ? row.id : '',
          bookingId: it.bookingId,
          courseName: courseName,
          title: courseName + ci,
          studentName: it.studentName || '—',
          teacherName: it.teacherName || '—',
          time: it.time || '',
          status: st,
          statusText: statusTextOf(st),
          tone: toneOf(st),
          canNotify: canNotify(st),
          isStudentCancel: st === 'cancelling' || st === 'canceling' || st === 's-cancelling',
          isTeacherCancel: st === 't-cancelling'
        };
      });

      const raw = reset ? mapped : this.rawList.concat(mapped);
      this.rawList = raw;
      const total = (res && res.total) || 0;
      this.setData({
        pageNum: nextPage,
        total: total,
        // 已取回条数 < total 才认为还有下一页；后端 total 缺失时退回「本页是否满页」判断
        hasMore: rows.length >= PAGE_SIZE && (!total || raw.length < total)
      });
      this.applyKeyword();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  /* ---------------- 检索栏 ---------------- */
  onKeywordInput(e) { this.setData({ keyword: e.detail.value || '' }); },
  onDayChange(e) {
    const idx = Number(e.detail.value);
    const opt = DAY_OPTIONS[idx] || DAY_OPTIONS[2];
    if (opt.v === this.data.days && idx === this.data.dayIndex) return;
    this.setData({ dayIndex: idx, days: opt.v });
    this.load(true);
  },
  onStatusChange(e) {
    const idx = Number(e.detail.value);
    const opt = this.data.statusOptions[idx] || { v: '' };
    if (opt.v === this.data.status) return;
    this.setData({ statusIndex: idx, status: opt.v });
    this.load(true);
  },
  onSearch() { this.load(true); },
  onReset() {
    this.setData({
      keyword: '',
      dayIndex: 2, days: DAY_OPTIONS[2].v,
      statusIndex: 0, status: ''
    });
    this.load(true);
  },

  // 课程名过滤：后端 listByDaysByPage 不吃 courseName（Controller 只传 userId/userRole/时间窗/status），
  // 故按约定在**已取回数据**上过滤，零额外请求；下拉刷新 / 触底加载更多可扩大范围。
  applyKeyword() {
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const raw = this.rawList || [];
    const list = kw
      ? raw.filter(x => String(x.courseName || '').toLowerCase().indexOf(kw) >= 0)
      : raw;
    this.setData({ list: list, shown: list.length });
  },

  /* ---------------- 行内动作 ---------------- */
  async onNotify(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '取通知计划…', mask: true });
    let plan = null;
    try {
      plan = await request({
        url: ENDPOINTS.NOTIFY_RULE_PREVIEW, method: 'GET',
        params: { appointmentId: id }, customErrorMsg: false
      });
    } catch (err) { plan = null; }
    wx.hideLoading();

    const ok = await confirm(notifyPlanText(plan), { title: '发送上课提醒', confirmText: '立即发送' });
    if (!ok) return;

    wx.showLoading({ title: '发送中…', mask: true });
    try {
      const r = await request({
        url: ENDPOINTS.NOTIFY_RULE_MANUAL_SEND, method: 'POST',
        data: { appointmentId: id }, customErrorMsg: false
      });
      wx.hideLoading();
      const stage = (r && r.stageText) ? r.stageText : '提醒';
      const off = (r && r.offsetText) ? '（提前 ' + r.offsetText + '）' : '';
      const aud = (r && r.audienceText) ? '，接收人：' + r.audienceText : '';
      await alert('已发送「' + stage + '」' + off + aud);
      this.load(true);   // 刷新状态位（noted1/noted2）
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
    }
  },

  // 确认/拒绝改期：data-action 直接就是要落库的目标状态
  async onReschedule(e) {
    const { id, action, kind } = e.currentTarget.dataset;
    if (!id || !action) return;
    const isConfirm = (action === 'cancelled' || action === 't-cancelled');
    const who = kind === 'teacher' ? t('teacher', '教师') + '发起' : '学生发起';
    const content = isConfirm
      ? '确认' + who + '的改期申请？\n\n该' + t('lessonNumber', '课次')
        + '将置为「' + apptText(action) + '」，'
        + '并按学生提交申请时锁定的退费档位快照结算（不按确认时刻重算）。'
      : '拒绝' + who + '的改期申请？\n\n该' + t('lessonNumber', '课次')
        + '将置为「' + apptText(action) + '」，原上课时间安排不变。';
    const ok = await confirm(content, { title: isConfirm ? '确认改期' : '拒绝改期' });
    if (!ok) return;

    wx.showLoading({ title: '处理中…', mask: true });
    try {
      await request({
        url: ENDPOINTS.APPOINTMENT_UPDATE_STATUS_BY_ID, method: 'PUT',
        data: { id: id, status: action }, customErrorMsg: false
      });
      wx.hideLoading();
      wx.showToast({ title: isConfirm ? '已确认' : '已拒绝', icon: 'success' });
      this.load(true);
    } catch (err) {
      wx.hideLoading();
      // 409 等业务闸门（如「该课次已开始或已结束」）的真实文案由 request 层从 body 取出
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { this.load(false); }
}));
