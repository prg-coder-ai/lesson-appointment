// 小程序端：术语适配层（复用 shared/terms.js 的纯函数 + 服务端合并词表）
// 浏览器端 applyTerms() 直接改 DOM；小程序端用 term(key) 在 WXML 里 {{term('teacher')}} 渲染。

import { TERM_DICT, getTerms, termText, getOptions, courseTypeText, enumTermText } from '../shared/terms.js';
import { storage } from './storage.js';
import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

let SERVER_TERM_MAP = null;
let INDUSTRY = storage.get('industry') || 'education';
let LANG = storage.get('lang') || 'zh';

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
    const res = await request({ url: ENDPOINTS.TERM_MAP(LANG), method: 'GET', tokenOnly: true });
    SERVER_TERM_MAP = res || null;
  } catch (e) { /* 拉取失败保持本地兜底 */ }
}

export async function syncIndustryFromTenant(tenantCode) {
  const token = storage.get('token');
  if (!token) return null;
  try {
    const res = await request({ url: ENDPOINTS.TENANT_INDUSTRY(tenantCode), method: 'GET', tokenOnly: true });
    const code = res && res.industryCode;
    if (!code || !TERM_DICT[code]) return null;
    if (INDUSTRY === code) return code;
    INDUSTRY = code;
    storage.set('industry', code);
    return code;
  } catch (e) { return null; }
}

export function setLang(lang) {
  LANG = lang;
  storage.set('lang', lang);
}
export function getIndustry() { return INDUSTRY; }
export function getServerMap() { return SERVER_TERM_MAP; }
