// 小程序端：获客渠道归因（邀请人/来源追踪）
// 设计原则（与微信登录一致）：非阻塞、静默降级——后端未实现接口时不报错、不打扰、不影响主流程；
// 采用"首次触达"归因，inviter 一旦记录就不再被后续来源覆盖。

import { request } from './request.js';
import { storage, getSession } from './storage.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

const ATTR_KEY = 'attribution';
const REPORTED_KEY = 'attribReported';

// 从分享链接/二维码的参数中抓取渠道归因（inviter / source / scene）
// 必须在 requireAuth() 之前调用：若当前未登录被重定向到登录页，参数也会先落盘不丢。
export function captureAttribution(options) {
  if (!options) return;
  const next = {};
  if (options.inviter) next.inviter = String(options.inviter);
  if (options.source) next.source = String(options.source);
  if (options.scene) {
    // 小程序码 scene 通常是 "inviter=xxx&source=share" 形式的编码串
    try {
      decodeURIComponent(options.scene)
        .split('&')
        .forEach((kv) => {
          const i = kv.indexOf('=');
          if (i < 0) return;
          const k = kv.slice(0, i);
          const v = kv.slice(i + 1);
          if (k === 'inviter' || k === 'source') next[k] = v;
        });
    } catch (e) { /* scene 解析失败忽略 */ }
  }
  if (!next.inviter && !next.source) return; // 无归因信息，不写盘
  const prev = storage.get(ATTR_KEY) || {};
  const merged = {
    inviter: prev.inviter || next.inviter || '',
    source: prev.source || next.source || '',
    firstTouchAt: prev.firstTouchAt || Date.now()
  };
  storage.set(ATTR_KEY, merged);
}

// 登录态就绪后上报一次（非阻塞、静默降级）。
// 后端未实现 / 未登录 / 已上报 → 一律静默返回，绝不抛错阻断主流程。
export async function reportAttributionOnce() {
  const attr = storage.get(ATTR_KEY);
  if (!attr || (!attr.inviter && !attr.source)) return;
  if (storage.get(REPORTED_KEY)) return;
  const u = getSession();
  if (!u || !u.token) return; // 未登录不报
  try {
    await request({
      url: ENDPOINTS.TRACK_ATTRIBUTION,
      method: 'POST',
      data: {
        inviter: attr.inviter,
        source: attr.source,
        role: u.role,
        tenantCode: u.tenantCode
      },
      customErrorMsg: false // 后端未实现时静默失败，不打扰调试
    });
    storage.set(REPORTED_KEY, true);
  } catch (e) {
    // 静默失败：未置 reported，下次启动可重试
  }
}
