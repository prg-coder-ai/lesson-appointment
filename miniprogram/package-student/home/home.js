import { requireAuth } from '../../core/auth.js';
import { roleLabel, homePageForRole, ROLES } from '../../shared/constants.js';
import { withTerms, term } from '../../core/term.js';
import { getUnreadCount } from '../../core/message.js';
import { captureAttribution, reportAttributionOnce } from '../../core/acquisition.js';
import { getCurrentTenant } from '../../core/tenant.js';
import { classroomVisible, ensureClassroomConfig } from '../../core/classroom.js';

Page(withTerms({
  data: {
    user: {}, roleText: '', industryText: '', active: 'home', greeting: '', unreadCount: 0, tenantName: '',
    // 在线课堂入口显隐（租户级开关）。undefined 语义见 core/classroom.js#classroomVisible
    classroomOn: false
  },
  onLoad(options) {
    captureAttribution(options); // 先抓取渠道归因，即便被重定向到登录页也不丢
    const u = requireAuth();
    if (!u) return;
    reportAttributionOnce(); // 登录态就绪后再上报一次
    const h = new Date().getHours();
    const greeting = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    this.setData({
      user: u, roleText: roleLabel(u.role),
      active: 'home', greeting
    });
    this.loadTenantName(u);
    this.applyTitle();
    this.syncClassroomEntry();
  },
  onShow() {
    const u = this.data.user;
    if (u && u.userId) getUnreadCount(u.userId).then(n => this.setData({ unreadCount: n })).catch(() => {});
    this.loadTenantName(u);
    this.applyTitle();
    this.syncClassroomEntry();
  },
  /**
   * 同步「我的课堂」入口显隐。
   * 先按本地缓存给一次（未核对时 classroomVisible 返回 true → 入口先显示），
   * 再向后端核对一次收敛 —— 顺序反过来会让网络慢的用户永远看不到入口。
   */
  syncClassroomEntry() {
    this.setData({ classroomOn: classroomVisible() });
    ensureClassroomConfig().then(() => {
      const on = classroomVisible();
      if (this.data.classroomOn !== on) this.setData({ classroomOn: on });
    }).catch(() => {});
  },
  // 导航栏标题随行业变：学生端 / 客户端 / 来访者端 / 学员端
  applyTitle() {
    wx.setNavigationBarTitle({ title: term('student', '学生') + '端' });
  },
  // 取当前租户的公司名称（orgName）替换顶部的租户编码展示；缺省回退 tenantCode
  loadTenantName(u) {
    getCurrentTenant().then(t => {
      const name = (t && t.orgName) || (u && u.tenantCode) || '';
      if (this.data.tenantName !== name) this.setData({ tenantName: name });
    }).catch(() => {});
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },
  goBooking() { wx.navigateTo({ url: '/package-student/booking/booking' }); },
  goMyBooking() { wx.navigateTo({ url: '/package-student/my-booking/my-booking' }); },
  goMyLesson() { wx.navigateTo({ url: '/package-student/my-lesson/my-lesson' }); },
  goAppointment() { wx.navigateTo({ url: '/package-student/appointment/appointment' }); },
  goTeacherList() { wx.navigateTo({ url: '/package-student/teacher-list/teacher-list' }); },
  goClassroom() { wx.navigateTo({ url: '/package-classroom/my/my' }); },
  goMessage() { wx.navigateTo({ url: '/package-message/inbox/inbox' }); },
  goMine() { wx.navigateTo({ url: '/pages/mine/mine' }); },
  // 分享带邀请人：好友打开后由 captureAttribution 抓取，形成获客闭环
  onShareAppMessage() {
    const u = this.data.user || {};
    const base = u.role ? homePageForRole(u.role) : '/pages/login/login';
    return { title: '邀请你使用预约系统', path: base + '?inviter=' + encodeURIComponent(u.userId || '') + '&source=share' };
  }
}));
