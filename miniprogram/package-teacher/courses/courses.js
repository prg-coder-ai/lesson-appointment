import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { ROLES } from '../../shared/constants.js';
import { withTerms, term } from '../../core/term.js';

// 课程状态：对齐前端 teacher-courseAndScheduleBrowserCards.js（pending/inactive/active/frozen）
const STATUS_TEXT = {
  pending: '待发布',
  inactive: '已收回',
  active: '已发布',
  frozen: '已冻结'
};

// 后端 CourseController#getCourseListByPage 返回 PageResult<Course>，
// 序列化后的字段是 { rows, total, pageNum, pageSize, totalPages }。
// ⚠ 字段名是 rows —— 不是 list / records。取错字段会 fallback 到整个对象，
//    随后 rows.map 抛 "rows.map is not a function" 被 catch 吞掉 → 列表恒空（不是"没课程"）。
// 与 Web 端一致：teacher-courseAndScheduleBrowserCards.js 读的就是 result.rows。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

Page(withTerms({
  data: { list: [], loading: false, error: '', total: 0, active: 'courses' },
  onLoad() { this.applyTitle(); },
  onShow() { this.applyTitle(); this.load(); },
  // 导航栏标题与底部导航「我的{{course}}」同源做行业词转换（教育「我的课程」/ 法律「我的咨询话题」）。
  // courses.json 的 navigationBarTitleText 只作首帧兜底（json 不支持动态），加载后被本方法覆盖。
  applyTitle() { wx.setNavigationBarTitle({ title: '我的' + term('course') }); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ loading: true, error: '' });
    try {
      // 参数与 Web 端 loadAndRenderCoursePage_teacher 对齐：teacherId + 分页
      const params = { pageNum: 1, pageSize: 20 };
      // 仅教师按 teacherId 过滤。管理端（admin）登录后进本页时，
      // 传自己的 userId 会因 course.teacher_id 无匹配而恒空 —— 此时不加该条件，
      // 退回"本租户全部课程"视图（course 表由租户插件自动按 tenant_id 隔离）。
      if (u.role === ROLES.TEACHER) params.teacherId = u.userId;
      const res = await request({
        url: ENDPOINTS.COURSE_PAGE, method: 'GET', params
      });
      const rows = pickRows(res);
      const list = rows.map(r => ({
        courseId: r.courseId,
        name: r.courseName || r.title || '未命名课程',
        content: r.content || '',
        feature: r.feature || '',
        status: r.status || 'pending',
        statusText: STATUS_TEXT[r.status] || r.status || '待发布'
      }));
      this.setData({ list, total: (res && res.total) || list.length });
    } catch (e) {
      // 把错误落到页面上（此前只有 toast，一闪而过后页面仍是"还没有课程"，无法区分
      // "确实没有课程" 与 "接口/解析失败"——这正是本 bug 排查困难的根源）。
      const msg = (e && e.message) || '加载失败';
      this.setData({ list: [], error: msg });
      wx.showToast({ title: msg, icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  // 点课程 → 查看该课程排期（对齐前端 my_course 点进看排期）
  goSchedule(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/package-teacher/schedule/schedule?courseId=' + id });
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
}));
