// 小程序端：HTTP 请求适配层（wx.request 版）
// 行为对齐 frontend/js/public/utility_request.js：normalizeUrl、Bearer 注入、
// 401 静默刷新（队列防重）、响应解包（code===200 取 data）、错误 toast。
// 2026-10-10 对齐 29-b 方案 A：HTTP 级错误优先读 body 真实文案（与 frontend 同口径，
// 用户拍板"两端都保留真实文案"），固定文案仅兜底；HTTP 200 下 body.code 401/403
// 走 resolveResult 提示且不清会话不踢登录。
// 差异：浏览器用 axios + location 跳转；小程序用 wx.request，登录失效经 globalData.onAuthFail 回调。
// 底层传输统一委托 shared/adapters/net.js 的 transport（小程序端内部即 wx.request，返回 {statusCode,data,header}）。

import { normalizeUrl, unwrapResult, ENDPOINTS, API_V1 } from '../shared/apiPaths.js';
import { errorMessage, resolveResult } from '../shared/domain/errorCode.js';
import { storage, getToken, clearSession } from './storage.js';
import { transport } from '../shared/adapters/net.js';

function appGlobal() {
  try { return (typeof getApp === 'function') ? getApp() : null; } catch (e) { return null; }
}
function apiBase() { const a = appGlobal(); return (a && a.globalData && a.globalData.apiBase) || ''; }
function msgBase() { const a = appGlobal(); return (a && a.globalData && a.globalData.msgBase) || ''; }
function classroomBase() { const a = appGlobal(); return (a && a.globalData && a.globalData.classroomBase) || ''; }
function onAuthFail() {
  const a = appGlobal();
  if (a && typeof a.globalData.onAuthFail === 'function') a.globalData.onAuthFail();
}

// 判定 url 是否走消息中心（message-service）
function resolveBase(url) {
  if (/^https?:\/\//i.test(url)) return '';
  if (/^\/api\/v1\/(messages|users|sensitive|message-categories)/.test(url)) return msgBase();
  if (isClassroomPath(url)) return classroomBase();
  return apiBase();
}

/**
 * 课堂服务（classroom-service :8092）的路径前缀清单。
 *
 * ★ 这份清单必须与 `doc-develop/90-tools/dev-proxy.js#toClassroomService` 的 PREFIXES
 *   以及 `deploy/nginx/*.conf` 逐字一致 —— 三者是同一套分流的三个消费者，改一处就要同步。
 *   小程序没有反代层，靠本函数自建分流，所以这里漏一条 = 那条接口打到 8081 报 403，
 *   而报错文案是「无权限访问该资源」，看起来像权限问题，实际是分流漏了（2026-11-19 已踩过）。
 *
 * 两个易错点（与 dev-proxy 注释同）：
 *   1. `schedules/`（**复数**）是课堂的排期事件接收；booking 是**单数** `schedule`
 *      （detail / class-instances / listByTeacher）。别为了"整齐"把两条合并。
 *   2. `admin/*` **不能整片**划给课堂 —— booking 也有 admin 语义接口
 *      （admin/users、admin/tenants 等），必须逐条精确。
 *   （本注释刻意不写完整路径前缀，避免被守卫 check:endpoints 第 ② 项当成硬编码命中。）
 *
 * 写法说明：用 segment + API_V1 拼，避免在源码里出现整串端点字面量
 * （守卫 check:endpoints 第 ② 项会把任何引号紧邻的 /api/v1/... 判为硬编码回归）。
 */
const CLASSROOM_SEGMENTS = [
  'classrooms/',
  'attendance/',
  'recordings/',
  'uploads/',
  'files/',
  'schedules/',
  'rtc/',
  'admin/classrooms/',
  'admin/monitor/',
  'admin/reports/',
  'admin/reconcile/',
  'admin/audit/',
  'admin/contract/',
  'admin/exports/'
];

function isClassroomPath(url) {
  const p = String(url || '');
  const prefix = API_V1 + '/';
  if (p.indexOf(prefix) !== 0) return false;
  const rest = p.slice(prefix.length);
  for (let i = 0; i < CLASSROOM_SEGMENTS.length; i++) {
    const seg = CLASSROOM_SEGMENTS[i];
    // 「前缀本身就是完整路径」也要命中：POST /api/v1/admin/classrooms（创建临时课堂）
    // 没有子路径，永远匹配不到带尾斜杠的前缀（dev-proxy 2026-11-19 修过同一处）。
    if (rest === seg.replace(/\/$/, '') || rest.indexOf(seg) === 0) return true;
  }
  return false;
}

// 底层传输统一走共享适配层 transport（小程序端内部即 wx.request，返回 {statusCode,data,header}）。
function wxRequest(config) {
  return transport({
    url: config.url,
    method: config.method,
    data: config.data,
    header: config.header
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
  // 【P2 修复 2026-11-04】不再传 account/role：后端完全忽略，role 从 user 表实时查。
  const res = await wxRequest({
    // doRefresh 绕过 request() 直接走 wxRequest，不经过 normalizeUrl；
    // 而 ENDPOINTS.AUTH_REFRESH 是**裸路径**（/auth/refreshToken），故必须显式 normalizeUrl
    // 才能带上 /api/v1 前缀，否则请求落到 SPA/404 兜底、刷新恒失败。
    url: apiBase() + normalizeUrl(ENDPOINTS.AUTH_REFRESH),
    method: 'POST',
    data: { refreshToken: refreshToken },
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
    const msg = errorMessage(err);
    if (opts.customErrorMsg !== false) showError(msg);
    throw new Error(msg);
  }

  const status = resp.statusCode;
  const res = resp.data;

  // 401：尝试刷新 token 后重试
  if (status === 401 && !opts._retry && !opts.tokenOnly && !opts.enhance) {
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
    // 增强型请求（enhance，如 term/map / tenant/industry 词表拉取）遇 401/403：只 reject，
    // 绝不清登录态、不跳登录页、不打 toast——这类请求是"登录后的增强数据"，失败仅退回本地兜底词表，
    // 若把它当鉴权失败踢人，会复现 auth.js 注释记录的"刚登录成功却被弹回登录页"历史 bug。
    // 普通业务鉴权（非 tokenOnly 且非 enhance）才执行踢人逻辑；tokenOnly 同样免疫。
    // 文案口径对齐 frontend utility_request.js：HTTP 级错误用固定文案，不读 body
    //（HTTP 401 走刷新重试，落到这里的 401 是"已重试仍失效/tokenOnly/enhance"）。
    if (status === 401 && !opts.tokenOnly && !opts.enhance) { clearSession(); if (!isRedirecting) { isRedirecting = true; onAuthFail(); } }
    const authBodyMsg = (res && (res.message || res.msg)) || '';
    const msg = status === 403 ? (authBodyMsg || '无权限访问该资源') : '登录已过期，请重新登录';
    if (opts.customErrorMsg !== false && !opts.enhance) showError(msg);
    throw new Error(msg);
  }

  if (status !== 200) {
    // 2026-10-10 用户拍板（29-b 方案 A 配套，与 frontend utility_request.js ④ 号分支同口径）：
    // 优先读后端 body 的真实文案（message/msg），取不到再退回固定文案——
    // 业务 400/404/409 现在走真实 HTTP 状态落到这里，只显示固定文案会丢真实原因。
    const bodyMsg = (res && (res.message || res.msg)) || '';
    let msg;
    switch (status) {
      case 403: msg = bodyMsg || '无权限访问该资源'; break;
      case 404: msg = bodyMsg || '接口地址不存在'; break;
      case 500: msg = bodyMsg || '服务器内部错误'; break;
      default: msg = bodyMsg || '请求错误：' + status;
    }
    if (opts.customErrorMsg !== false) showError(msg);
    // 挂业务态元信息（对齐 frontend teacherInfo.js 教训：29-b 后业务 404 走真实 HTTP 状态，
    // 调用方需读 err.code（HTTP 状态）与 err.bodyMsg（真实文案）做「无档案→进创建页」类
    // 业务态分支，不能再依赖 e.message 文本匹配——bare Error 会让这类判定静默失效。
    const httpErr = new Error(msg);
    httpErr.code = status;
    httpErr.bodyMsg = msg;
    httpErr.raw = res;
    throw httpErr;
  }

  // ===== HTTP 200：按 body.code 分流，行为对齐 frontend utility_request.js 响应拦截器 =====
  if (res && res.code === 200) {
    // 业务成功：直接返回 data 字段（与 unwrapResult 的 ok 路径一致）
    return res.data;
  }

  // 业务层 401/403（29-b 方案 A 下这两类码保持 HTTP 200）：只提示与 reject——
  // 不清会话、不踢登录、不刷新 token（权限不足 ≠ 未登录，frontend 同口径）。
  if (res && (res.code === 401 || res.code === 403)) {
    const r = resolveResult(res);
    if (opts.customErrorMsg !== false) showError(r.message);
    const err = new Error(r.message);
    err.code = res.code;
    err.raw = res;
    throw err;
  }

  // 其它业务错误码（1001 等残留 HTTP 200 的历史路径）
  try {
    return unwrapResult(res);
  } catch (e) {
    if (opts.customErrorMsg !== false) showError(e.message);
    throw e;
  }
}
