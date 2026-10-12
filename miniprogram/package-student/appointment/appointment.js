import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { appointmentStatusText } from '../../shared/domain/appointmentState.js';
import { formatDateTime } from '../../shared/domain/datetime.js';
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
  data: { list: [], loading: false, days: 7 },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.user = u;
    // 行业词注入（等价于 withTerms 包装：注入 data.terms + 注册刷新监听）
    this.__termListener = () => applyTermsToPage(this);
    registerTermUpdate(this.__termListener);
    applyTermsToPage(this);
    this.applyTitle();
    this.load();
  },
  // 导航栏标题也接行业词（今日课程 / 今日咨询话题 / 今日咨询项目）。
  // 标题**需要**随行业变，故保留运行时 wx.setNavigationBarTitle；json 的 navigationBarTitleText 仅作首帧兜底。
  // onShow 每次重设，兜住「行业切换后返回本页」的场景（json 不支持动态，只能运行时改）。
  onShow() { applyTermsToPage(this); this.applyTitle(); },
  onUnload() { if (this.__termListener) unregisterTermUpdate(this.__termListener); },
  applyTitle() {
    wx.setNavigationBarTitle({ title: '今日' + t('course', '课程') });
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
      const list = rows.map(r => {
        const c = cache[r.courseId] || {};
        const title = c.courseName || c.title || (t('course', '课程') + ' ' + (r.courseId || ''));
        const sub = isStudent
          ? ('教师 ' + (c.teacherName || r.teacherId || ''))
          : ('学生 ' + (r.studentId || ''));
        return {
          id: r.id, bookingId: r.bookingId, courseId: r.courseId,
          title, sub, time: fmtTime(r.appointmentDatetime),
          status: r.status, statusText: appointmentStatusText(r.status)
        };
      });
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  onDayChange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.days) return;
    this.setData({ days });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
