// 邀请落地页（2026-10-13）：小程序码 / 小程序链接的目标页。
//
// 与 Web 端 login.html?ref= 的推广落地同构：
//   · onLoad 先 captureAttribution(options) 把 ref/inviter/source 归因落盘
//     （未登录也不丢；登录成功后由 login/home 链路上的 reportAttributionOnce 上报）
//   · 再调 PROMO_VALIDATE_CODE 校验推广码：touch=1 让后端点击数 +1，
//     按 ref 在 storage 去重只报一次（对齐 Web 端 promoClicked:<ref> 口径）
//   · 有效 → 展示邀请信息：pathType=1 自助开通新租户 / pathType=2 加入指定机构；
//     「进入小程序」reLaunch 到登录页，path2 带 tCode（登录页据此锁租户并可微信直接注册）
//
// tokenOnly：校验端点是 permitAll 公开端点，401 只可能是白名单漏配，
// 不能触发 request 层的清场踢人（Web 端同构处理是 noAuthRedirect）。

import { captureAttribution } from '../../core/acquisition.js';
import { request } from '../../core/request.js';
import { storage } from '../../core/storage.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

// 兼容后端小程序码 scene 形态（"ref=xxx&inviter=yyy"）：query 参数优先，scene 兜底
function sceneRef(scene) {
  if (!scene) return '';
  try {
    const kv = decodeURIComponent(scene).split('&');
    for (let i = 0; i < kv.length; i++) {
      const pair = kv[i].split('=');
      if (pair[0] === 'ref') return pair[1] || '';
    }
  } catch (e) { /* 解析失败按无 ref 处理 */ }
  return '';
}

Page({
  data: {
    loading: true,
    valid: false,
    ref: '',
    pathType: 1,
    orgName: '',
    trialDays: 14,
    tenantCode: ''
  },

  onLoad(options) {
    captureAttribution(options); // 归因先落盘，后续登录链路才带得住
    const ref = (options && options.ref) || sceneRef(options && options.scene) || '';
    const tcode = (options && (options.tcode || options.tCode)) || '';
    this.setData({ ref, tenantCode: tcode });
    if (!ref) {
      this.setData({ loading: false, valid: false });
      return;
    }
    this.validate(ref);
  },

  async validate(ref) {
    // 点击计数按 ref 去重：同一台设备重复打开不重复 +1（后端另有码级聚合）
    let touch = true;
    if (storage.get('promoTouched:' + ref)) {
      touch = false;
    } else {
      storage.set('promoTouched:' + ref, '1');
    }
    let info = null;
    try {
      info = await request({
        url: ENDPOINTS.PROMO_VALIDATE_CODE(ref, touch),
        method: 'GET',
        tokenOnly: true,        // 公开端点：401 不清场不踢人
        customErrorMsg: false
      });
    } catch (e) { info = null; }
    if (!info || !info.valid) {
      this.setData({ loading: false, valid: false });
      return;
    }
    this.setData({
      loading: false,
      valid: true,
      pathType: info.pathType === 2 ? 2 : 1,
      orgName: info.targetOrgName || '',
      trialDays: info.trialDays || 14,
      // ref 是唯一真相源：优先 validate 反查的目标租户编码，链接未带 tcode 也能锁住
      tenantCode: info.targetTenantCode || this.data.tenantCode || ''
    });
  },

  enter() {
    const { tenantCode, pathType } = this.data;
    if (pathType === 2 && tenantCode) {
      wx.reLaunch({ url: '/pages/login/login?tCode=' + encodeURIComponent(tenantCode) });
    } else {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onShareAppMessage() {
    const { ref, pathType, orgName } = this.data;
    return {
      title: pathType === 2 ? ('邀请你加入' + (orgName || '本机构')) : '邀请你免费开通新租户',
      path: ref ? '/pages/promo-landing/promo-landing?ref=' + encodeURIComponent(ref) : '/pages/promo-landing/promo-landing'
    };
  }
});
