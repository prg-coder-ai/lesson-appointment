// 推广统计（2026-10-13）：对标 frontend/js/admin-promo-stats.js（租户）+ platform-promo-stats.js（平台）。
//
// 角色分流（小程序端两页合一，按登录角色裁剪）：
//   · platform_admin → GET /api/v1/promo/achievement/platform：全平台合计 8 项
//     + 推广者排行 Top20 + 最近转化 10 条
//   · admin → GET /api/v1/promo/achievement/tenant：本租户「租户码」加入漏斗 6 项
//     + 名额提示 + 推广人明细（租户从令牌派生，服务端强校验）
// 其他角色（student/teacher）不该到达本页：入口只在管理端首页，页面内再兜底拦一次。
//
// 口径说明（与 Web 端一致）：点击只计数不落明细，故两视图都只呈现注册之后的真实转化。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { ROLES } from '../../shared/constants.js';

const STAGE_TEXT = { registered: '已注册', approved: '已审批', paid: '已缴费', expired: '已过期' };
const PATH_TEXT = { 1: '自助建租户', 2: '加入租户' };
const ROLE_TEXT = { admin: '租户管理员', teacher: '教师', student: '学生', platform_admin: '平台管理员' };

function num(v) { return v == null ? 0 : v; }

Page({
  data: {
    isPlatform: false,
    loading: true,
    // 平台统计
    totals: {},
    ranking: [],
    recent: [],
    // 租户统计
    orgName: '',
    tenantCode: '',
    quotaText: '',
    tenantTotals: {},
    promoters: []
  },

  onLoad() {
    const u = requireAuth();
    if (!u) return;
    if (u.role !== ROLES.ADMIN && u.role !== ROLES.PLATFORM_ADMIN) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const isPlatform = u.role === ROLES.PLATFORM_ADMIN;
    this.setData({ isPlatform });
    wx.setNavigationBarTitle({ title: isPlatform ? '平台推广统计' : '租户推广统计' });
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    this.setData({ loading: true });
    try {
      if (this.data.isPlatform) await this.loadPlatform();
      else await this.loadTenant();
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // —— 平台统计：合计 + Top20 + 最近 10 条 ——
  async loadPlatform() {
    const data = (await request({ url: ENDPOINTS.PROMO_PLATFORM_STATS, method: 'GET' })) || {};
    this.setData({
      totals: data.totals || {},
      ranking: (data.ranking || []).map((r) => Object.assign({}, r, {
        pathText: PATH_TEXT[r.pathType] || '-'
      })),
      recent: (data.recent || []).map((r) => Object.assign({}, r, {
        stageText: STAGE_TEXT[r.stage] || r.stage || '-',
        pathText: PATH_TEXT[r.pathType] || '-'
      }))
    });
  },

  // —— 租户统计：加入漏斗 + 名额 + 推广人明细 ——
  async loadTenant() {
    const data = (await request({ url: ENDPOINTS.PROMO_TENANT_STATS, method: 'GET' })) || {};
    const quota = data.tenantQuota;
    let quotaText = '';
    if (quota && quota.userTotalLimit != null) {
      const cur = quota.userCurrent || 0;
      quotaText = quota.userTotalLimit > 0
        ? '（名额 ' + cur + '/' + quota.userTotalLimit + '，剩余 ' + Math.max(quota.userTotalLimit - cur, 0) + '）'
        : '（名额不限，已加入 ' + cur + ' 人）';
    }
    this.setData({
      orgName: data.orgName || '-',
      tenantCode: data.tenantCode || '-',
      quotaText,
      tenantTotals: data.totals || {},
      promoters: (data.promoters || []).map((p) => Object.assign({}, p, {
        roleText: ROLE_TEXT[p.promoterRole] || p.promoterRole || '-'
      }))
    });
  },

  noop() {}
});
