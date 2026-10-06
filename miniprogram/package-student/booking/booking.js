import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

// 后端 CourseController#getCourseListByPage 是 GET，且返回 PageResult<Course>
// （字段 rows/total/pageNum/pageSize/totalPages）。POST 会 405，读 list/records 会拿到整个对象。
// 契约对齐 Web 端 student-bookingCards.js#loadAndRenderCourse_student。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

Page({
  data: { list: [], loading: false, page: 1, finished: false, keyword: '' },
  onLoad() { this.load(); },
  onPullDownRefresh() {
    this.setData({ page: 1, list: [], finished: false });
    this.load().then(() => wx.stopPullDownRefresh());
  },
  onReachBottom() { if (!this.data.finished && !this.data.loading) this.load(); },
  onSearch(e) { this.setData({ keyword: e.detail.value }); },
  onConfirmSearch() { this.setData({ page: 1, list: [], finished: false }); this.load(); },
  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'GET',
        // 参数名是 courseName（后端 CourseQueryPage.courseName 模糊匹配），不是 keyword；
        // status=active 只列已发布课程，与 Web 端学生约课一致。
        params: {
          pageNum: this.data.page, pageSize: 10,
          courseName: this.data.keyword || undefined,
          status: 'active'
        }
      });
      const rows = pickRows(res);
      this.setData({
        list: this.data.page === 1 ? rows : this.data.list.concat(rows),
        finished: rows.length < 10, page: this.data.page + 1
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  // 路径必须与 app.json 注册项一致：subPackages[package-student].pages 里是
  // "booking-detail/booking-detail"（独立分包目录），不是 "booking/booking-detail"。
  goDetail(e) { wx.navigateTo({ url: '/package-student/booking-detail/booking-detail?id=' + e.currentTarget.dataset.id }); },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
