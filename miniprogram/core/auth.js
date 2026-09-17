// 小程序端：登录态与租户绑定助手（封装 core/storage + core/request + core/term）
// 对齐 frontend/js/public/api.js 的登录/守卫逻辑，但用 wx 存储与页面跳转替代浏览器。

import { request } from './request.js';
import { storage, getSession, setSession, clearSession } from './storage.js';
import { loadTermMap, syncIndustryFromTenant } from './term.js';
import { ENDPOINTS } from '../shared/apiPaths.js';
import { homePageForRole } from '../shared/constants.js';

const BOUND_TENANT_KEY = 'boundTenantCode';

// 登录：tCode 与小程序持久绑定（登录成功后写入 boundTenantCode）
export async function login({ tenantCode, account, password, role }) {
  const res = await request({ url: ENDPOINTS.AUTH_LOGIN, method: 'POST', data: { tenantCode, account, password, role } });
  if (!res || !res.token) throw new Error((res && (res.message || res.msg)) || '登录失败');
  setSession(res);
  if (tenantCode) storage.set(BOUND_TENANT_KEY, tenantCode);
  await loadTermMap();
  await syncIndustryFromTenant(res.tenantCode || tenantCode);
  return res;
}

// 登出：清除登录态，但保留租户绑定（下次登录自动回填 tCode）
export async function logout() {
  try {
    await request({ url: ENDPOINTS.AUTH_LOGOUT, method: 'POST', customErrorMsg: false });
  } catch (e) { /* 忽略登出接口异常，本地清理优先 */ }
  clearSession();
  const app = (typeof getApp === 'function') ? getApp() : null;
  if (app && app.globalData) app.globalData.onAuthFail = app.globalData.onAuthFail;
  wx.reLaunch({ url: '/pages/login/login' });
}

// 切换租户：清除登录态 + 解绑 tCode，回到登录页重新输入
export function switchTenant() {
  clearSession();
  storage.remove(BOUND_TENANT_KEY);
  wx.reLaunch({ url: '/pages/login/login' });
}

export function getCurrentUser() {
  return getSession();
}

export function getBoundTenantCode() {
  return storage.get(BOUND_TENANT_KEY) || '';
}

// 页面入口守卫：无登录态则跳登录页，返回 user 或 null
export function requireAuth() {
  const u = getSession();
  if (!u || !u.token || !u.role) {
    wx.reLaunch({ url: '/pages/login/login' });
    return null;
  }
  return u;
}

// 角色与租户一致性校验（对齐 api.js isRoleTenantCodeMatch）
export function isRoleTenantCodeMatch(role, tenantCode) {
  if (role === 'platform_admin') return tenantCode === 'platform';
  return !!tenantCode && tenantCode !== 'platform';
}

// 按当前角色跳到对应首页
export function goHome() {
  const u = getSession();
  wx.reLaunch({ url: homePageForRole(u && u.role) });
}
