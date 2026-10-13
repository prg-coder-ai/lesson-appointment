// 小程序端：获客渠道归因（邀请人/来源/推广码追踪）
// 设计原则（与微信登录一致）：非阻塞、静默降级——后端未实现接口时不报错、不打扰、不影响主流程；
// 采用"首次触达"归因，inviter 一旦记录就不再被后续来源覆盖。
//
// 2026-10-13 二期扩展：新增 ref（推广码）识别。契约见
// doc-develop/推广路径及微信登录实现方案-最终落地版-20261013.md §8：
//   推广链接同时带 ref（推广码）与 inviter（推广者 userId），两端都认；
//   上报体 { inviter, ref, source, role, tenantCode }；
//   后端归因优先级：有 ref 按码归因 → 只有 inviter 按默认码归因 → 皆无只记 source。

import { request } from './request.js';
import { storage, getSession } from './storage.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

const ATTR_KEY = 'attribution';
const REPORTED_KEY = 'attribReported';

// 从分享链接/二维码的参数中抓取渠道归因（ref / inviter / source / scene）
// 必须在 requireAuth() 之前调用：若当前未登录被重定向到登录页，参数也会先落盘不丢。
export function captureAttribution(options) {
  if (!options) return;
  const next = {};
  if (options.ref) next.ref = String(options.ref); // 推广码（2026-10-13 二期新增）
  if (options.inviter) next.inviter = String(options.inviter);
  if (options.source) next.source = String(options.source);
  if (options.scene) {
    // 小程序码 scene 通常是 "ref=ABC123&inviter=xxx&source=share" 形式的编码串
    try {
      decodeURIComponent(options.scene)
        .split('&')
        .forEach((kv) => {
          const i = kv.indexOf('=');
          if (i < 0) return;
          const k = kv.slice(0, i);
          const v = kv.slice(i + 1);
          if (k === 'ref' || k === 'inviter' || k === 'source') next[k] = v; // 新增 ref
        });
    } catch (e) { /* scene 解析失败忽略 */ }
  }
  if (!next.ref && !next.inviter && !next.source) return; // 无归因信息，不写盘
  const prev = storage.get(ATTR_KEY) || {};
  const merged = {
    ref: prev.ref || next.ref || '',
    inviter: prev.inviter || next.inviter || '',
    source: prev.source || next.source || '',
    firstTouchAt: prev.firstTouchAt || Date.now()
  };
  storage.set(ATTR_KEY, merged);
}

// 登录态就绪后上报一次（非阻塞、静默降级）。
// 后端未实现 / 未登录 / 已上报 → 一律静默返回，绝不抛错阻断主流程。
// 三种登录方式（密码 / 微信静默 / 微信直接注册）对归因透明：setSession 成功后各调一次，
// 重复上报由 promo_conversion.uk_conversion_invitee 去重（2026-10-13 二期）。
export async function reportAttributionOnce() {
  const attr = storage.get(ATTR_KEY);
  if (!attr || (!attr.ref && !attr.inviter && !attr.source)) return;
  if (storage.get(REPORTED_KEY)) return;
  const u = getSession();
  if (!u || !u.token) return; // 未登录不报
  try {
    await request({
      url: ENDPOINTS.TRACK_ATTRIBUTION,
      method: 'POST',
      data: {
        ref: attr.ref,
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
