import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { bookingStatusText } from '../../shared/domain/bookingState.js';
import { confirm } from '../../core/ui.js';
import { withTerms, term } from '../../core/term.js';

// POST /booking/page 返回 Result<PageResult<Booking>>：data 是
// { rows, total, pageNum, pageSize, totalPages }。字段名是 rows，
// 不是 list/records —— 取错会 fallback 到整个对象，随后 rows.filter/map 抛错被 catch 吞掉，
// 页面表现为「学生预约没有数据」（不是真的没预约）。契约同 Web 端 student-bookingBrowserCards.js。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

// 页面标题 / 标签里的「学生」不做硬编码：本页由工作台的「{{terms.student}}预约」入口进入，
// 入口名已按行业词渲染（如租户把 student 映射成「客户」→「客户预约」），
// 页内文案必须同源，否则出现「客户预约 → 学生预约」的行业词漂移。
Page(withTerms({
  data: { list: [], loading: false, page: 1, finished: false, status: '', keyword: '' },
  onLoad() {
    this.applyTermTitle();
    this.load();
  },
  // 词表在行业切换 / 服务端合并词表到达后会刷新，标题需跟着重设；
  // booking.json 里的 navigationBarTitleText 只作首帧兜底（默认教育行业词）。
  onShow() { this.applyTermTitle(); },
  applyTermTitle() {
    wx.setNavigationBarTitle({ title: term('student') + '预约' });
  },
  onPullDownRefresh() {
    this.setData({ page: 1, list: [], finished: false });
    this.load().then(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { if (!this.data.finished && !this.data.loading) this.load(); },
  onStatusFilter(e) {
    this.setData({ status: e.currentTarget.dataset.s, page: 1, list: [], finished: false });
    this.load();
  },
  onSearchInput(e) { this.setData({ keyword: e.detail.value }); },
  onSearch() {
    this.setData({ page: 1, list: [], finished: false });
    this.load();
  },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const u = requireAuth();
      if (!u) return;
      const kw = this.data.keyword.trim();
      const res = await request({
        url: ENDPOINTS.BOOKING_PAGE, method: 'POST',
        data: {
          pageNum: this.data.page, pageSize: 10,
          status: this.data.status || undefined,
          courseName: kw || undefined,
          userId: u.userId, userRole: u.role
        }
      });
      let rows = pickRows(res);
      // 客户端兜底：若后端未对 courseName 过滤，则本地按课程名/学生名匹配
      if (kw) {
        const lk = kw.toLowerCase();
        rows = rows.filter(r =>
          (r.courseTitle || r.title || '').toLowerCase().includes(lk) ||
          (r.studentName || '').toLowerCase().includes(lk));
      }
      const list = rows.map(r => ({
        bookingId: r.bookingId,
        title: r.courseTitle || r.title || term('course'),
        sub: r.studentName || (term('student') + ' ' + (r.studentId || '')),
        time: r.timeText || '',
        status: r.status,
        statusText: r.statusText || bookingStatusText(r.status)
      }));
      this.setData({
        list: this.data.page === 1 ? list : this.data.list.concat(list),
        finished: rows.length < 10,
        page: this.data.page + 1
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  async act(e) {
    const { id, status, label } = e.currentTarget.dataset;
    const ok = await confirm('确定' + label + '该预约？', { title: '确认' });
    if (!ok) return;
    try {
      await request({ url: ENDPOINTS.BOOKING_UPDATE_STATUS, method: 'POST', data: { bookingId: id, status } });
      wx.showToast({ title: label + '成功', icon: 'none' });
      this.setData({ page: 1, list: [], finished: false });
      this.load();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
