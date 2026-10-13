// 我的推广（2026-10-13）：对标 frontend/promo.html 的推广业绩页。
//
// 功能对齐 Web 端：
//   · 双推广码卡（平台码 pathType=1 / 租户码 pathType=2，平台管理员隐藏租户码）
//   · 业绩汇总 8 项（点击/注册/审批/缴费/新租户/微信注册/转化率/累计奖励）
//   · 转化明细（分页，契约 PageResult.rows——不是 IPage 的 records）
//
// 与 Web 端的差异（本次需求核心）：Web 端分享的是 http://<ip>/login.html?ref= 链接，
// 小程序端改为「小程序码 + 小程序链接 + 转发」三件套，目标统一指向邀请落地页
// /pages/promo-landing/promo-landing?ref=<code>：
//   · 小程序码：wx.createCanvasQRCode 在隐藏 canvas 绘制 → canvasToTempFilePath
//     导出临时图 → 弹窗展示 / 保存到相册（纯前端，无后端依赖）
//   · 小程序链接：wx.generateShortLink 生成 URL Link → 复制发给好友
//   · 转发：onShareAppMessage 带 ref/inviter 的分享卡片
// 两个微信 API 的可用性均做存在性检测与失败降级（基础库版本以官方文档为准）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { storage } from '../../core/storage.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { ROLES } from '../../shared/constants.js';

const PAGE_SIZE = 20;

const STAGE_TEXT = { registered: '已注册', approved: '已审批', paid: '已缴费', expired: '已过期' };

// 邀请落地页路径：ref 必带；path=2 标识租户码；inviter 增强归因（后端仍以 ref 为权威）
function landingPath(code, pathType, userId) {
  let q = 'ref=' + encodeURIComponent(code);
  if (pathType === 2) q += '&path=2';
  if (userId) q += '&inviter=' + encodeURIComponent(userId);
  return '/pages/promo-landing/promo-landing?' + q;
}

Page({
  data: {
    user: {},
    isPlatformAdmin: false,
    loading: true,
    // 双码卡：[{ pathType, title, sub, code, generating }]
    codeCards: [
      { pathType: 1, title: '平台推广码', sub: '好友打开即可自助开通新租户（免费试用）', code: '', generating: false },
      { pathType: 2, title: '租户推广码', sub: '新用户打开直接加入本租户（待审批）', code: '', generating: false }
    ],
    myTenantCode: '',
    myOrgName: '',
    quotaText: '',
    // 业绩汇总（键与后端 achievement 一致）
    achievement: {
      totalClicks: 0, totalRegistered: 0, totalApproved: 0, totalPaid: 0,
      totalTenantsCreated: 0, totalWxRegistered: 0, conversionRate: '0%', totalRewardAmount: 0
    },
    // 转化明细
    conversions: [],
    convTotal: 0,
    convPage: 1,
    convHasMore: false,
    // 小程序码弹窗
    qrModal: false,
    qrTitle: '',
    qrImage: '',
    qrLoading: false,
    qrSaving: false,
    // 小程序链接弹窗
    linkModal: false,
    linkText: '',
    linkGenerating: false
  },

  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ user: u, isPlatformAdmin: u.role === ROLES.PLATFORM_ADMIN });
    this.loadAll();
  },
  onPullDownRefresh() { this.loadAll().then(() => wx.stopPullDownRefresh()); },
  onReachBottom() { if (this.data.convHasMore) this.loadConversions(this.data.convPage + 1); },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const data = await request({ url: ENDPOINTS.PROMO_ACHIEVEMENT, method: 'GET' });
      this.renderAchievement(data || {});
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
    this.setData({ convPage: 1, conversions: [] });
    await this.loadConversions(1);
  },

  renderAchievement(data) {
    const ach = Object.assign({}, this.data.achievement, data.achievement || {});
    const codes = data.referralCodes || [];
    let platformCode = '';
    let tenantCode = '';
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i] || {};
      if (c.pathType === 2) tenantCode = c.referralCode || '';
      else platformCode = c.referralCode || '';
    }
    const cards = this.data.codeCards.map((c) =>
      Object.assign({}, c, { code: c.pathType === 2 ? tenantCode : platformCode }));
    // 租户名额提示（满员后新用户无法加入，推广前先让推广者看到）
    let quotaText = '';
    const q = data.tenantQuota;
    if (q && q.userTotalLimit != null) {
      const limit = q.userTotalLimit;
      const cur = q.userCurrent || 0;
      quotaText = limit > 0
        ? '本租户名额：已用 ' + cur + ' / ' + limit + '，剩余 ' + Math.max(limit - cur, 0) + '（满员后新用户将无法加入）'
        : '本租户名额：不限（已加入 ' + cur + ' 人）';
    }
    this.setData({
      achievement: ach,
      codeCards: cards,
      myTenantCode: data.myTenantCode || '',
      myOrgName: data.myOrgName || '',
      quotaText
    });
  },

  // —— 转化明细（分页契约 PageResult{rows,total}）——
  async loadConversions(pageNum) {
    try {
      const page = await request({
        url: ENDPOINTS.PROMO_CONVERSIONS(pageNum, PAGE_SIZE),
        method: 'GET'
      });
      const records = (page && page.rows) || [];
      const rows = records.map((r) => Object.assign({}, r, {
        stageText: STAGE_TEXT[r.stage] || r.stage || '-',
        pathText: r.pathType === 1 ? '自助建租户' : '加入租户'
      }));
      this.setData({
        conversions: this.data.conversions.concat(rows),
        convTotal: (page && page.total) || 0,
        convPage: pageNum,
        convHasMore: this.data.conversions.length + rows.length < ((page && page.total) || 0)
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '转化明细加载失败', icon: 'none' });
    }
  },

  // —— 生成/获取推广码（targetTenantId 由服务端从令牌派生，只传 pathType）——
  async generateCode(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const cards = this.data.codeCards.map((c) =>
      Object.assign({}, c, { generating: c.pathType === pathType }));
    this.setData({ codeCards: cards });
    try {
      await request({
        url: ENDPOINTS.PROMO_GENERATE_CODE,
        method: 'POST',
        data: { pathType }
      });
      await this.loadAll();
      wx.showToast({ title: '已生成', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' });
      this.setData({ codeCards: this.data.codeCards.map((c) => Object.assign({}, c, { generating: false })) });
    }
  },

  copyCode(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const card = this.data.codeCards.find((c) => c.pathType === pathType);
    if (!card || !card.code) { wx.showToast({ title: '请先生成推广码', icon: 'none' }); return; }
    wx.setClipboardData({
      data: card.code,
      success: () => wx.showToast({ title: '推广码已复制', icon: 'none' })
    });
  },

  // —— 小程序码：隐藏 canvas 绘制 → 导出临时图 → 弹窗展示 ——
  showQr(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const card = this.data.codeCards.find((c) => c.pathType === pathType);
    if (!card || !card.code) { wx.showToast({ title: '请先生成推广码', icon: 'none' }); return; }
    if (typeof wx.createCanvasQRCode !== 'function') {
      wx.showToast({ title: '当前微信版本不支持小程序码，请升级微信或使用转发', icon: 'none' });
      return;
    }
    this.setData({ qrModal: true, qrImage: '', qrLoading: true, qrTitle: card.title });
    wx.createCanvasQRCode({
      canvasId: 'promo-qr-canvas',
      path: landingPath(card.code, pathType, this.data.user.userId),
      width: 240,
      success: () => {
        wx.canvasToTempFilePath({
          canvasId: 'promo-qr-canvas',
          success: (res) => this.setData({ qrImage: res.tempFilePath, qrLoading: false }),
          fail: () => {
            this.setData({ qrLoading: false });
            wx.showToast({ title: '二维码导出失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        this.setData({ qrLoading: false });
        wx.showToast({ title: '小程序码生成失败，请重试', icon: 'none' });
      }
    });
  },
  saveQr() {
    if (!this.data.qrImage) return;
    this.setData({ qrSaving: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.qrImage,
      success: () => {
        this.setData({ qrSaving: false });
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: () => {
        this.setData({ qrSaving: false });
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册，后再试',
          confirmText: '去设置',
          success: (r) => { if (r.confirm) wx.openSetting(); }
        });
      }
    });
  },
  closeQr() { this.setData({ qrModal: false }); },

  // —— 小程序链接（URL Link）：生成后复制；API 缺失/失败时降级为路径文本 + 转发引导 ——
  genLink(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const card = this.data.codeCards.find((c) => c.pathType === pathType);
    if (!card || !card.code) { wx.showToast({ title: '请先生成推广码', icon: 'none' }); return; }
    const path = landingPath(card.code, pathType, this.data.user.userId);
    this.setData({ linkModal: true, linkText: '', linkGenerating: true });
    if (typeof wx.generateShortLink !== 'function') {
      this.setData({ linkGenerating: false, linkText: '【当前微信版本不支持小程序链接，可复制下方路径或改用「转发」】\n' + path });
      return;
    }
    const query = path.indexOf('?') >= 0 ? path.slice(path.indexOf('?') + 1) : '';
    wx.generateShortLink({
      path: '/pages/promo-landing/promo-landing',
      query: query,
      success: (res) => this.setData({ linkGenerating: false, linkText: res.link || '' }),
      fail: () => this.setData({
        linkGenerating: false,
        linkText: '【小程序链接生成失败，可复制下方路径或改用「转发」】\n' + path
      })
    });
  },
  copyLink() {
    if (!this.data.linkText) return;
    wx.setClipboardData({
      data: this.data.linkText,
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    });
  },
  closeLink() { this.setData({ linkModal: false }); },

  noop() {},

  // —— 转发分享卡片（path 带 ref/inviter，与落地页同构）——
  onShareAppMessage() {
    const u = this.data.user || {};
    const cards = this.data.codeCards || [];
    const card = cards.find((c) => c.pathType === 2 && c.code)
      || cards.find((c) => c.pathType === 1 && c.code)
      || null;
    const title = card && card.pathType === 2
      ? ('邀请你加入' + (this.data.myOrgName || '本机构'))
      : '邀请你免费开通新租户';
    return {
      title,
      path: card && card.code
        ? landingPath(card.code, card.pathType, u.userId)
        : '/pages/promo-landing/promo-landing'
    };
  }
});
