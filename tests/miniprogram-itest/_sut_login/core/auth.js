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
  // 术语/行业词表为"增强"数据：只在已登录后拉取，且失败绝不可阻断登录与跳转
  // （此前 loadTermMap 调 term/map 若返回 401，会触发 request 清登录态并 reLaunch 回登录页，
  //  表现为"登录成功却被弹回"。现已在 request 层对 tokenOnly 401 免疫，这里再兜底静默）。
  try { await loadTermMap(); } catch (e) { /* 拉取失败保持本地兜底词表，首页会重试 */ }
  try { await syncIndustryFromTenant(res.tenantCode || tenantCode); } catch (e) { /* 行业不匹配时退回默认 education */ }
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
    // 延后一拍再 reLaunch：避免在 onLoad 完成前拆掉尚在注册的 webview，
    // 否则会触发 "routeDone with a webviewId ... is not found" 系统错误（lib 3.x 常见）。
    setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 0);
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

// —— 微信登录（可选增强，非阻塞）——
// 说明：wx.login 为静默调用（无需用户弹窗授权），仅返回临时 code；
// 真正的微信身份 openid 由后端用 code 调 auth.code2Session 换取，客户端永不接触真实微信号。

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({ success: (r) => resolve(r), fail: (e) => reject(e) });
  });
}

// 静默登录：启动/进登录页时，若无本地会话则尝试用微信 code 免密进系统。
// 后端未实现 / 该微信未绑定 / 任意异常 → 一律静默返回 null，绝不影响现有密码登录流程。
export async function wechatSilentLogin() {
  try {
    const { code } = await wxLoginCode();
    const res = await request({
      url: ENDPOINTS.AUTH_WECHAT_LOGIN,
      method: 'POST',
      data: { code },
      tokenOnly: true,       // 尚未登录，不带 Bearer
      customErrorMsg: false  // 后端未实现时静默失败，不打扰调试
    });
    if (!res || !res.token) return null;
    setSession(res);
    try {
      await loadTermMap();
      await syncIndustryFromTenant(res.tenantCode);
    } catch (e) { /* 术语加载失败不阻断免登录，首页会重新拉取 */ }
    return res;
  } catch (e) {
    return null;
  }
}

// 绑定微信：密码登录成功后调用，把当前微信 openid 绑定到账号。
// 失败（后端未实现/异常）静默返回 false，不影响已成功的密码登录态。
export async function bindWechat() {
  try {
    const { code } = await wxLoginCode();
    await request({
      url: ENDPOINTS.AUTH_BIND_WECHAT,
      method: 'POST',
      data: { code },
      customErrorMsg: false
    });
    return true;
  } catch (e) {
    return false;
  }
}
