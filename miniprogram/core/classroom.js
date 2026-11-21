// 小程序端「在线课堂」公共能力（2026-11-21）
//
// 职责只有三件，页面不该各自再实现一遍：
//   ① 课堂开关（/api/v1/eclassroom/config）的缓存与自愈；
//   ② 课堂服务地址（8092）的解析 —— 小程序没有同源反向代理，必须直连；
//   ③ 课堂链接生成（给管理员分发 / 给学生「进入课堂」复制用）。
//
// ★ 三条背景（都来自 Web 端踩过的坑，见 frontend/js/public/feature-flags.js）：
//
//   ① **缓存必须会自愈**。Web 原来只在缓存为 null 时才补拉，于是「平台禁用过一次 →
//      缓存里留下 {enabled:false} → 之后开通了菜单也永远不回来，必须手动清缓存」。
//      小程序也没有 sessionStorage，无法照抄「本标签页已核对」的布尔标记。
//      这里改用**时间戳**（48h 内视为可信）：小程序页面常驻后台好几天，布尔标记会腐烂。
//
//   ② **服务端下发的 apiBaseUrl 对小程序不可用**。sys_eclassroom_instance.default-local 的
//      api_host 是 127.0.0.1，后端据此下发 http://127.0.0.1:8092/api/v1。Web 把它归一成
//      「同源空串」就对了（nginx 分流），但小程序里的 127.0.0.1 指向**用户自己的手机**，
//      必然连不上。故一律回落 env/远程配置里的 classroomBase。
//
//   ③ **课堂链接必须指向 Web 站点**，不是小程序。小程序不承载课堂本体（它依赖
//      getUserMedia / RTCPeerConnection，小程序没有），管理员分发出去的链接是给人
//      在电脑浏览器里打开的。

import { storage, getSession } from './storage.js';
import { getBoundTenantCode } from './auth.js';
import { ENDPOINTS } from '../shared/apiPaths.js';
import { classroomLink as buildLink } from '../shared/domain/classroom.js';

const KEY_CFG = 'eclassroomConfig';
// 「上次与后端核对成功的时刻」（毫秒时间戳）。用时间戳而不是布尔，见文件头 ①。
const KEY_VERIFIED_AT = 'eclassroomConfigVerifiedAt';
// 核对有效期：超过就当成过期，进页面时先显示、后台强核对一次
const VERIFY_TTL_MS = 48 * 3600 * 1000;

function appGlobalData() {
  try {
    const a = typeof getApp === 'function' ? getApp() : null;
    return (a && a.globalData) || {};
  } catch (e) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// ① 课堂开关
// ---------------------------------------------------------------------------

/** 读本地缓存的课堂配置（null = 从未取到） */
export function getClassroomConfig() {
  const raw = storage.get(KEY_CFG);
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function setClassroomConfig(cfg) {
  storage.set(KEY_CFG, cfg || null);
}

function markVerified() {
  storage.set(KEY_VERIFIED_AT, String(Date.now()));
}

/** 本机是否在有效期内与后端核对过（过期视为未核对） */
export function isClassroomConfigVerified() {
  const t = Number(storage.get(KEY_VERIFIED_AT) || 0);
  return t > 0 && (Date.now() - t) < VERIFY_TTL_MS;
}

/**
 * 课堂是否开通。
 * ★ 注意 false 有两种含义：① 明确未开通；② 压根还没取到配置。
 *   菜单显隐请用 classroomVisible()，它区分这两者；本函数只回答「现在能不能给入口」。
 */
export function hasClassroom() {
  const cfg = getClassroomConfig();
  return cfg !== null && cfg.enabled === true;
}

/**
 * 菜单/入口是否应当可见（**宁可见一次，也不让入口无声消失**）。
 *   · 明确开通 → 可见
 *   · 本机在有效期内核对过且未开通 → 隐藏
 *   · 其它（没缓存 / 缓存过期 / 从未核对）→ 先可见，并异步找后端核对
 */
export function classroomVisible() {
  if (hasClassroom()) return true;
  if (getClassroomConfig() === null) return true;      // 未知，别隐藏
  return !isClassroomConfigVerified();                 // 缓存过期 → 先显示后收敛
}

let _ensurePromise = null;

/**
 * 主动核对课堂配置（并发去重）。
 *
 * @param {boolean} [force] true = 无视缓存强制向后端核对一次
 * @returns {Promise<Object|null>} 配置；取不到（未登录/网络/接口异常）返回 null
 */
export function ensureClassroomConfig(force) {
  const cur = getClassroomConfig();
  if (cur !== null && !force && isClassroomConfigVerified()) return Promise.resolve(cur);
  if (_ensurePromise) return _ensurePromise;

  const token = storage.get('token') || '';
  if (!token) return Promise.resolve(null);

  // 延迟 import：request.js 会 import 本文件（要看 classroomBase），此处反向依赖会成环。
  _ensurePromise = import('./request.js')
    .then(({ request }) => request({
      // 课堂开关在 booking（8081），不是课堂服务；端点常量自带 /api/v1 前缀
      url: ENDPOINTS.ECLASSROOM_CONFIG,
      method: 'GET',
      customLoading: false,
      customErrorMsg: false
    }))
    .then((cfg) => {
      if (cfg) {
        setClassroomConfig(cfg);
        // 只有真正拿到后端结果才记时间戳；失败保持「未核对」，下次进页面还会再试，
        // 不会把一次网络抖动固化成永久隐藏。
        markVerified();
      }
      return getClassroomConfig();
    })
    .catch(() => null)
    .then((v) => { _ensurePromise = null; return v; });

  return _ensurePromise;
}

/**
 * 登录成功后必须调用：清掉上一个会话/租户的课堂配置。
 *
 * 不清的后果很具体：A 租户开了课堂、B 租户没开，同一台手机换租户登录后
 * 要么看到本不该有的入口，要么看不到本该有的 —— 而缓存有 48h 有效期，用户无从自查。
 * 与 Web 端 api.js 登录后清 eclassroomConfig 同口径。
 */
export function clearClassroomConfig() {
  storage.remove(KEY_CFG);
  storage.remove(KEY_VERIFIED_AT);
}

// ---------------------------------------------------------------------------
// ② 课堂服务地址
// ---------------------------------------------------------------------------

/** 回环地址判定：服务端下发的 127.0.0.1/localhost 对小程序一律无效（见文件头 ②） */
function isLoopback(base) {
  if (!base) return false;
  return /(^|\/\/)(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/i.test(String(base));
}

/**
 * 课堂服务基地址（**不带 /api/v1**，端点常量自带该前缀）。
 *
 * 优先级：服务端下发（可用时） > env/远程配置的 classroomBase。
 */
export function classroomBase() {
  const cfg = getClassroomConfig();
  const fromServer = (cfg && cfg.apiBaseUrl) || '';
  if (fromServer && !isLoopback(fromServer)) {
    // 服务端下发的是「…/api/v1」，而端点常量也带 /api/v1，必须去重否则双前缀 404。
    return String(fromServer).replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  }
  const g = appGlobalData();
  return String(g.classroomBase || '').replace(/\/+$/, '');
}

/** 前端站点根（生成课堂链接用；develop 环境可能为空，此时链接不可用） */
export function webBase() {
  const g = appGlobalData();
  return String(g.webBase || '').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// ③ 课堂链接
// ---------------------------------------------------------------------------

/** 当前用户应带的租户码：优先登录绑定值，其次 currentUser（platform 视为无租户） */
export function currentTenantCode() {
  try {
    const bound = getBoundTenantCode();
    if (bound) return bound === 'platform' ? '' : bound;
  } catch (e) { /* auth 未初始化时忽略 */ }
  const u = getSession() || {};
  const code = u.tenantCode || '';
  return code === 'platform' ? '' : code;
}

/**
 * 生成课堂链接（指向 Web 站点）。
 * @param {string} key   课次键（服务端下发的 classroomKey / scheduleId）
 * @param {Object} [extra] 额外 query，如 { role: 'teacher' } 管理员代开课
 * @returns {string} 空串表示 webBase 未配置，调用方应提示而不是复制空内容
 */
export function classroomUrl(key, extra) {
  return buildLink(webBase(), key, currentTenantCode(), extra);
}

/** 复制文本到剪贴板，返回 Promise<boolean> */
export function copyText(text, okTip) {
  const s = String(text || '');
  if (!s) return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.setClipboardData({
      data: s,
      success: () => {
        // 微信会在 setClipboardData 后自动弹一个「内容已复制」，再弹我们的 toast 会叠两层，
        // 故这里只回调不弹提示；需要提示的调用方自己 wx.showToast。
        if (okTip) {
          setTimeout(() => { wx.showToast({ title: okTip, icon: 'none' }); }, 60);
        }
        resolve(true);
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请长按手动复制', icon: 'none' });
        resolve(false);
      }
    });
  });
}

/**
 * 「进入课堂」统一出口（小程序不承载课堂本体，只做说明 + 复制链接）。
 *
 * 为什么不做静默跳转：小程序内没有课堂页，直接复制而不解释，用户会以为点错了。
 */
export function enterClassroomPrompt(key, courseName) {
  const url = classroomUrl(key);
  if (!url) {
    wx.showModal({
      title: '课堂链接未配置',
      content: '当前环境没有前端站点地址（webBase），无法生成课堂链接。请联系管理员检查小程序环境配置。',
      showCancel: false
    });
    return;
  }
  wx.showModal({
    title: '在线课堂需在电脑上使用',
    content: (courseName ? courseName + '\n' : '')
      + '课堂需要摄像头、麦克风和屏幕共享，请在电脑浏览器中打开。\n点「复制链接」后粘贴到浏览器即可。',
    confirmText: '复制链接',
    cancelText: '关闭',
    success: (res) => {
      if (res.confirm) copyText(url, '链接已复制');
    }
  });
}
