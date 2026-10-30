// 学生端「浏览教师」——展示本租户**已发布**的教师职业信息
//
// 端点：GET /api/v1/teacher/published/public-list?tenantCode=xxx（免登录白名单，Result<List<TeacherPublishedProfileCardVO>>）
// 返回的是**裁剪后的卡片 VO**，字段固定为 5 个：
//   { publishedProfileId, teacherId, name, title, summary, coverUrl }
//   - name    ← 发布数据里的姓名（draftData.name）
//   - title   ← 实体独立列「职业信息标题」（发布时填写，如"资深执业律师 · 民商事争议解决"）
//   - summary ← 一句话简介（draftData.bioText，缺省回退 subject）
//   - coverUrl← 可直接用于 CSS background 的完整值（形如 url(https://...)），null 时用渐变占位
//
// 历史缺陷（本页原实现）：按 p.id / p.title / p.headline / p.intro 取值 —— 这几个字段**一个都不存在**，
// 于是 name 取到了"职业标题"、点击带入的 id 恒为空 → 详情页报"缺少教师参数"。字段名必须以上面 5 个为准。
//
// 另：tenantCode 是**必填**参数，为空时后端直接返回空数组（不是报错），
// 所以取不到会话里的 tenantCode 时要回退到登录时绑定的 boundTenantCode，否则页面会莫名空白。

import { requireAuth, getBoundTenantCode } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { applyTermsToPage, registerTermUpdate, unregisterTermUpdate } from '../../core/term.js';

function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

const DEFAULT_COVER = 'background:linear-gradient(135deg,#4e6ef2,#7a8cff);';

Page({
  data: { list: [], loading: false, error: '', tCode: '', emptyText: '' },

  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    // 注入行业词表，并注册刷新监听（行业切换 / 服务端词表加载后自动重取词）
    applyTermsToPage(this);
    this.__termListener = () => { applyTermsToPage(this); this.applyTitle(); };
    registerTermUpdate(this.__termListener);
    this.applyTitle();
    // 会话里的 tenantCode 优先，回退登录时持久绑定的 tCode（避免空 tenantCode 拿到空列表）
    const tCode = u.tenantCode || getBoundTenantCode() || '';
    this.setData({ tCode });
    this.load();
  },

  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh()); },

  async load() {
    if (this.data.loading) return;
    if (!this.data.tCode) {
      this.setData({ list: [], error: '未识别租户，请重新登录后再试', emptyText: '未识别租户，请重新登录后再试' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const res = await request({
        url: ENDPOINTS.TEACHER_PUBLIC_LIST(this.data.tCode),
        method: 'GET', tokenOnly: true,   // 公开白名单接口，不带 Bearer 也能取
        customErrorMsg: false
      });
      const list = pickRows(res).map(it => {
        const name = it.name || '';
        const cover = it.coverUrl || '';
        return {
          pid: it.publishedProfileId || '',
          teacherId: it.teacherId || '',
          name: name || this.tr('teacher', '教师'),
          initial: (name || '?').charAt(0),
          title: it.title || '',          // 职业信息标题
          summary: it.summary || '',
          // coverUrl 已是完整 CSS 值；缺失时给渐变占位（与 Web 端 teacherCardCarousel 同口径）
          coverStyle: cover ? ('background:' + cover + ';') : DEFAULT_COVER
        };
      });
      this.setData({ list, emptyText: '暂无可展示的' + this.tr('teacher', '教师') + '信息' });
    } catch (e) {
      const msg = (e && e.message) || '加载失败';
      this.setData({ list: [], error: msg, emptyText: msg });
      wx.showToast({ title: msg, icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  tr(key, fb) { const t = this.data.terms || {}; return t[key] || fb; },

  goProfile(e) {
    const { pid, tid } = e.currentTarget.dataset;
    if (!pid && !tid) { wx.showToast({ title: '该记录缺少标识，无法打开', icon: 'none' }); return; }
    wx.navigateTo({
      url: '/package-student/teacher-profile/teacher-profile'
        + '?pid=' + encodeURIComponent(pid || '') + '&tid=' + encodeURIComponent(tid || '')
    });
  },

  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); },

  // 导航栏标题接行业词（教师列表 / 律师列表 / 咨询师列表 / 教练列表）。
  // 标题**随行业变**，保留运行时 wx.setNavigationBarTitle；json 的 navigationBarTitleText 仅作首帧兜底。
  onShow() { applyTermsToPage(this); this.applyTitle(); },
  applyTitle() { wx.setNavigationBarTitle({ title: this.tr('teacher', '教师') + '列表' }); },
  onUnload() { if (this.__termListener) unregisterTermUpdate(this.__termListener); }
});
