// 小程序端：术语适配层（复用 shared/terms.js 的纯函数 + 服务端合并词表）
// 浏览器端 applyTerms() 直接改 DOM；小程序端用 term(key) 在 WXML 里 {{term('teacher')}} 渲染。

import { TERM_DICT, getTerms, termText, getOptions, courseTypeText, enumTermText } from '../shared/terms.js';
import { storage } from './storage.js';
import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

let SERVER_TERM_MAP = null;
let INDUSTRY = storage.get('industry') || 'education';
// 小程序仅支持中文（用户确认"只考虑中文"）：锁定 zh，避免任何语言切换意外。
// storage.lang 仍可被 setLang 读取以保持兼容，但取词统一按 zh。
const TERM_LANG = 'zh';

// 跨页面术语刷新：行业切换 / 服务端词表加载完成后通知已注册的页面重新取词
const termListeners = new Set();
export function registerTermUpdate(cb) { if (typeof cb === 'function') termListeners.add(cb); }
export function unregisterTermUpdate(cb) { if (cb) termListeners.delete(cb); }
function notifyTermUpdate() { termListeners.forEach(cb => { try { cb(); } catch (e) {} }); }

export function term(key) {
  return termText(key, { industry: INDUSTRY, serverMap: SERVER_TERM_MAP });
}
export function options(tagKey, fallback) {
  return getOptions(tagKey, fallback, { industry: INDUSTRY, serverMap: SERVER_TERM_MAP });
}
export function courseType(code) {
  return courseTypeText(code, { industry: INDUSTRY, serverMap: SERVER_TERM_MAP });
}
export function enumTerm(prefix, code) {
  return enumTermText(prefix, code, { industry: INDUSTRY, serverMap: SERVER_TERM_MAP });
}

export async function loadTermMap() {
  const token = storage.get('token');
  if (!token) return;
  try {
    // term/map 是公开接口（后端已白名单 + token 可空），但带上 Bearer 才能取到「租户自定义词」：
    // 后端三级合并（租户 > 行业 > 平台）依赖 JWT 识别租户，无 token 时只会返回行业/平台词。
    // 遇 401 时由 request 层走正常刷新逻辑，失败则 login() 内 try/catch 兜底，不会崩页。
    const res = await request({ url: ENDPOINTS.TERM_MAP(TERM_LANG), method: 'GET' });
    SERVER_TERM_MAP = res || null;
    notifyTermUpdate();
  } catch (e) { /* 拉取失败保持本地兜底 */ }
}

export async function syncIndustryFromTenant(tenantCode) {
  const token = storage.get('token');
  if (!token) return null;
  try {
    const res = await request({ url: ENDPOINTS.TENANT_INDUSTRY(tenantCode), method: 'GET' });
    const code = res && res.industryCode;
    if (!code || !TERM_DICT[code]) return null;
    if (INDUSTRY === code) { notifyTermUpdate(); return code; }
    INDUSTRY = code;
    storage.set('industry', code);
    notifyTermUpdate();
    return code;
  } catch (e) { return null; }
}

export function setLang(lang) {
  // 小程序仅中文：忽略语言切换，保持 TERM_LANG 不变（保留接口兼容 mine 页导入）
  storage.set('lang', 'zh');
}
export function getIndustry() { return INDUSTRY; }
export function getServerMap() { return SERVER_TERM_MAP; }

// 取当前生效行业的完整词表对象（本地兜底 + 服务端覆盖合并），供页面塞进 data.terms 用
export function getTermMap() {
  const base = TERM_DICT[INDUSTRY] || TERM_DICT.education;
  if (!SERVER_TERM_MAP) return Object.assign({}, base);
  return Object.assign({}, base, SERVER_TERM_MAP);
}

// 把当前行业词表注入到页面 data.terms（WXML 用 {{terms.teacher}} 等渲染）
export function applyTermsToPage(page) {
  if (page && typeof page.setData === 'function') page.setData({ terms: getTermMap() });
}

// 页面包装器：自动在 onLoad/onShow 注入 data.terms，无需每个页面手写注入代码。
// 用法：Page(withTerms({ ... }))  —— 已有 onLoad/onShow 会被先注入术语再执行原逻辑。
// 同时注册术语刷新监听：行业切换 / 服务端词表加载完成后，已打开的页面会被 notifyTermUpdate 自动重取词。
export function withTerms(opts) {
  const origOnLoad = opts.onLoad;
  const origOnShow = opts.onShow;
  const origOnUnload = opts.onUnload;
  return Object.assign({}, opts, {
    onLoad(options) {
      applyTermsToPage(this);
      this.__termListener = () => applyTermsToPage(this);
      registerTermUpdate(this.__termListener);
      if (typeof origOnLoad === 'function') origOnLoad.call(this, options);
    },
    onShow() {
      applyTermsToPage(this);
      if (typeof origOnShow === 'function') origOnShow.call(this);
    },
    onUnload() {
      if (this.__termListener) unregisterTermUpdate(this.__termListener);
      if (typeof origOnUnload === 'function') origOnUnload.call(this);
    }
  });
}
