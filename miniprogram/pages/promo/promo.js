// 我的推广（2026-10-13）：对标 frontend/promo.html 的推广业绩页。
//
// 功能对齐 Web 端：
//   · 双推广码卡（平台码 pathType=1 / 租户码 pathType=2，平台管理员隐藏租户码）
//   · 业绩汇总 8 项（点击/注册/审批/缴费/新租户/微信注册/转化率/累计奖励）
//   · 转化明细（分页，契约 PageResult.rows——不是 IPage 的 records）
//
// 与 Web 端的差异：Web 端分享的是 http://<ip>/login.html?ref= 链接，
// 小程序端改为「二维码 + 路径文本 + 转发」三件套，目标统一指向邀请落地页
// /pages/promo-landing/promo-landing?ref=<code>：
//   · 二维码：引入 weapp-qrcode（utils/weapp-qrcode.js）在 canvas 上绘制
//     推广路径文本 → wx.canvasToTempFilePath 导出临时图 → 弹窗展示 / 保存相册
//   · 路径文本：直接展示 + 复制（wx.createShortLink 需要后端配合，暂时降级为路径）
//   · 转发：onShareAppMessage 带 ref/inviter 的分享卡片
//
// weapp-qrcode 来源：https://gitee.com/nur/weapp-qrcode （MIT，基于 davidshimjs/qrcodejs）

var QRCode = require('../../utils/weapp-qrcode.js');

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { storage } from '../../core/storage.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { ROLES } from '../../shared/constants.js';

const PAGE_SIZE = 20;

const STAGE_TEXT = { registered: '已注册', approved: '已审批', paid: '已缴费', expired: '已过期' };

// 小程序内路由路径（转发/唤起小程序用）
function landingPath(code, pathType, userId) {
  let q = 'ref=' + encodeURIComponent(code);
  if (pathType === 2) q += '&path=2';
  if (userId) q += '&inviter=' + encodeURIComponent(userId);
  return '/pages/promo-landing/promo-landing?' + q;
}

// Web 端完整 URL（浏览器/短信/邮件通用，后端 promo.js L478-479 已对齐 login.html?ref=）
// WEB_BASE_URL 推导：从 apiBase 取 protocol + hostname，端口固定用 80（http）/省略（https 默认 443）
// 手写字符串解析，不依赖 new URL()（小程序 JSCore 兼容性存疑）
function deriveWebBaseUrl() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const api = app && app.globalData && app.globalData.apiBase;
  console.log('[promo] deriveWebBaseUrl apiBase =', api);
  if (!api || typeof api !== 'string' || !api.trim()) return '';

  // 正则拆 http://host:port 或 https://host:port
  const m = api.match(/^(https?):\/\/([^\/:?#]+)(?::\d+)?/i);
  if (!m) { console.warn('[promo] apiBase 格式不合法，无法推导 Web 域名:', api); return ''; }
  const proto = m[1].toLowerCase();   // 'http' | 'https'
  const host  = m[2];                 // '152.136.254.127'
  const port  = proto === 'https' ? '' : ':80';
  const result = proto + '://' + host + port;
  console.log('[promo] WEB_BASE_URL =', result);
  return result;
}

function landingWebUrl(code, pathType, userId, tenantCode) {
  let base = deriveWebBaseUrl();
  if (!base) return '';
  let q = 'ref=' + encodeURIComponent(code);
  if (pathType === 2) {
    q += '&path=2';
    if (tenantCode) q += '&tcode=' + encodeURIComponent(tenantCode);
  }
  if (userId) q += '&inviter=' + encodeURIComponent(userId);
  return base + '/login.html?' + q;
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
    qrMode: 'web',            // 'web'=Web URL 二维码（全平台可用）  'mini'=小程序内路由二维码（只能在微信内长按识别唤起）
    qrWebUrl: '',             // Web 端完整 URL（扫码/复制通用）
    qrMiniPath: '',            // 小程序内路由路径（转发卡片用）
    // 小程序链接弹窗
    linkModal: false,
    linkText: '',
    linkGenerating: false,
    linkWebUrl: '',            // Web 端完整 URL（复制发给任何人都能打开）
    linkMiniPath: ''           // 小程序内路由路径（转发卡片用）
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

  // —— 二维码：默认画 Web URL（全平台扫码可用），可切小程序路径 ——
  showQr(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const card = this.data.codeCards.find((c) => c.pathType === pathType);
    if (!card || !card.code) { wx.showToast({ title: '请先生成推广码', icon: 'none' }); return; }

    const miniPath = landingPath(card.code, pathType, this.data.user.userId);
    const webUrl   = landingWebUrl(card.code, pathType, this.data.user.userId,
                                    this.data.myTenantCode);

    this.setData({
      qrModal: true, qrImage: '', qrLoading: true, qrTitle: card.title,
      qrMode: 'web',
      qrWebUrl: webUrl || '(未配置 Web 域名，请在 app.js globalData.apiBase 指向的服务器部署前端)',
      qrMiniPath: miniPath
    });
    // 默认画 Web URL
    this.drawQr(webUrl || miniPath);
  },

  // 切模式：web（扫了打开浏览器） ↔ mini（纯微信内长按识别唤起小程序）
  switchQrMode(e) {
    const mode = e.currentTarget.dataset.mode; // 'web' | 'mini'
    if (mode === this.data.qrMode) return;
    const content = mode === 'web' ? this.data.qrWebUrl : this.data.qrMiniPath;
    this.setData({ qrMode: mode, qrImage: '', qrLoading: !!content });
    if (content) this.drawQr(content);
    else { this.setData({ qrLoading: false }); wx.showToast({ title: mode === 'web' ? 'Web 域名未配置' : '小程序路径为空', icon: 'none' }); }
  },

  drawQr(text) {
    if (!text) { this.setData({ qrLoading: false }); return; }
    try {
      new QRCode('promo-qr-canvas', {
        text: text,
        width: 240, height: 240, padding: 0,
        correctLevel: QRCode.CorrectLevel.M,
        colorDark: '#000000', colorLight: '#ffffff',
        callback: (res) => {
          if (res && res.path) this.setData({ qrImage: res.path, qrLoading: false });
          else { this.setData({ qrLoading: false }); wx.showToast({ title: '二维码导出失败', icon: 'none' }); }
        }
      });
    } catch (err) {
      console.error('[promo] QRCode draw failed:', err);
      this.setData({ qrLoading: false });
      wx.showToast({ title: '二维码生成失败，请重试', icon: 'none' });
    }
  },

  copyCurrentQr() {
    const text = this.data.qrMode === 'web' ? this.data.qrWebUrl : this.data.qrMiniPath;
    if (!text) return;
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'none' }) });
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

  // —— 链接弹窗：默认 Web URL（全平台可用），可切小程序路径 ——
  genLink(e) {
    const pathType = Number(e.currentTarget.dataset.pt) || 1;
    const card = this.data.codeCards.find((c) => c.pathType === pathType);
    if (!card || !card.code) { wx.showToast({ title: '请先生成推广码', icon: 'none' }); return; }

    const miniPath = landingPath(card.code, pathType, this.data.user.userId);
    const webUrl   = landingWebUrl(card.code, pathType, this.data.user.userId,
                                    this.data.myTenantCode);

    this.setData({
      linkModal: true,
      linkMode: 'web',
      linkWebUrl: webUrl || '(未配置 Web 域名)',
      linkMiniPath: miniPath
    });
  },
  switchLinkMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.linkMode) return;
    this.setData({ linkMode: mode });
  },
  copyLink() {
    const text = this.data.linkMode === 'web' ? this.data.linkWebUrl : this.data.linkMiniPath;
    if (!text || text.startsWith('(未配置')) {
      wx.showToast({ title: '内容为空', icon: 'none' }); return;
    }
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'none' }) });
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
