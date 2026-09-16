// 小程序端：HTTP 请求适配层（wx.request 版）
// 行为对齐 frontend/js/public/utility_request.js：normalizeUrl、Bearer 注入、
// 401 静默刷新（队列防重）、响应解包（code===200 取 data）、错误 toast。
// 差异：浏览器用 axios + location 跳转；小程序用 wx.request，登录失效经 globalData.onAuthFail 回调。

import { normalizeUrl, unwrapResult } from '../shared/apiPaths.js';
import { storage, getToken, clearSession, getSession } from './storage.js';

function appGlobal() {
  try { return (typeof getApp === 'function') ? getApp() : null; } catch (e) { return null; }
}
function apiBase() { const a = appGlobal(); return (a && a.globalData && a.globalData.apiBase) || ''; }
function msgBase() { const a = appGlobal(); return (a && a.globalData && a.globalData.msgBase) || ''; }
function onAuthFail() {
  const a = appGlobal();
  if (a && typeof a.globalData.onAuthFail === 'function') a.globalData.onAuthFail();
}

// 判定 url 是否走消息中心（message-service）
function resolveBase(url) {
  if (/^https?:\/\//i.test(url)) return '';
  if (/^\/api\/v1\/(messages|users|sensitive|message-categories)/.test(url)) return msgBase();
  return apiBase();
}

function wxRequest(config) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.url,
      method: (config.method || 'GET').toUpperCase(),
      data: config.data,
      header: config.header || {},
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    });
  });
}

function showError(msg) {
  if (typeof wx !== 'undefined') wx.showToast({ title: String(msg), icon: 'none' });
}

let isRefreshing = false;
let requestQueue = [];
let isRedirecting = false;

async function doRefresh() {
  const refreshToken = storage.get('refreshToken');
  const cuser = getSession();
  const res = await wxRequest({
    url: apiBase() + '/api/v1/auth/refreshToken',
    method: 'POST',
    data: { refreshToken: refreshToken, account: cuser && cuser.account, role: cuser && cuser.role },
    _noAuth: true
  });
  if (res.statusCode === 200 && res.data && res.data.code === 200) {
    const d = res.data.data;
    if (d && d.token) {
      storage.set('token', d.token);
      if (d.refreshToken) storage.set('refreshToken', d.refreshToken);
      return d.token;
    }
  }
  throw new Error('refresh failed');
}

/**
 * 统一请求。
 * opts: { url, method, data, params, customErrorMsg, customLoading, tokenOnly }
 * 成功（code===200）resolve(data)；业务/网络错误 reject(Error)。
 */
export async function request(opts) {
  const method = (opts.method || 'GET').toUpperCase();
  let url = resolveBase(opts.url) + normalizeUrl(opts.url);
  if (opts.params) {
    const qs = Object.keys(opts.params)
      .filter(k => opts.params[k] !== undefined && opts.params[k] !== null)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(opts.params[k]))
      .join('&');
    if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  const header = { 'Content-Type': 'application/json;charset=utf-8' };
  if (!opts.tokenOnly && !opts._noAuth) {
    const t = getToken();
    if (t) header.Authorization = 'Bearer ' + t;
  }

  let resp;
  try {
    resp = await wxRequest({ url, method, data: opts.data, header });
  } catch (err) {
    const msg = '网络连接失败，请检查网络';
    if (opts.customErrorMsg !== false) showError(msg);
    throw new Error(msg);
  }

  const status = resp.statusCode;
  const res = resp.data;

  // 401：尝试刷新 token 后重试
  if (status === 401 && !opts._retry && !opts.tokenOnly) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        requestQueue.push({
          resolve, reject,
          fn: (nt) => {
            header.Authorization = 'Bearer ' + nt;
            request(Object.assign({}, opts, { _retry: true })).then(resolve).catch(reject);
          }
        });
      });
    }
    isRefreshing = true;
    try {
      const nt = await doRefresh();
      requestQueue.forEach(it => it.fn(nt));
      requestQueue = [];
      isRefreshing = false;
      return request(Object.assign({}, opts, { _retry: true }));
    } catch (e) {
      requestQueue.forEach(it => it.reject(e));
      requestQueue = [];
      isRefreshing = false;
      clearSession();
      if (!isRedirecting) { isRedirecting = true; onAuthFail(); }
      throw new Error('登录已过期，请重新登录');
    }
  }

  if (status === 401 || status === 403) {
    if (status === 401) { clearSession(); if (!isRedirecting) { isRedirecting = true; onAuthFail(); } }
    const msg = (res && (res.message || res.msg)) || (status === 403 ? '无权限访问该资源' : '登录已过期');
    if (opts.customErrorMsg !== false) showError(msg);
    throw new Error(msg);
  }

  if (status !== 200) {
    const msg = (res && (res.message || res.msg)) || ('请求错误：' + status);
    if (opts.customErrorMsg !== false) showError(msg);
    throw new Error(msg);
  }

  try {
    return unwrapResult(res);
  } catch (e) {
    if (opts.customErrorMsg !== false) showError(e.message);
    throw e;
  }
}
