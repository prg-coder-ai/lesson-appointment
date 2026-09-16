// 跨端共享：API 路径约定与响应解包（无网络依赖，纯函数）
// normalizeUrl / unwrapResult 与 frontend/js/public/utility_request.js 行为保持一致。

export const API_V1 = '/api/v1';

// 绝对地址原样；已是 /api/v1 原样；旧 /api/* 升 v1；裸 /xxx 补 /api/v1
export function normalizeUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('/api/v1') === 0) return url;
  if (url.indexOf('/api/') === 0) return '/api/v1' + url.slice(4);
  if (url.charAt(0) === '/') return '/api/v1' + url;
  return url;
}

// 业务响应解包：后端统一 { code, data, message }；code===200 取 data，否则抛错
export function unwrapResult(res) {
  if (res && res.code === 200) return res.data;
  const err = new Error((res && (res.message || res.msg)) || '操作失败');
  err.code = res && res.code;
  err.raw = res;
  throw err;
}

// 端点路径常量（与现有 frontend 调用保持一致；message-service 的端点走 msgBase）
export const ENDPOINTS = {
  AUTH_LOGIN: '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_REFRESH: '/auth/refreshToken',
  AUTH_KICK: (uid) => `/auth/kick/${uid}`,
  ACCOUNT_EXIST: (acc) => `/user/account/exist?account=${encodeURIComponent(acc)}`,
  TERM_MAP: (lang) => `/api/v1/term/map?lang=${encodeURIComponent(lang || 'zh')}`,
  TENANT_INDUSTRY: (tCode) => `/api/v1/tenant/industry${tCode ? '?tenantCode=' + encodeURIComponent(tCode) : ''}`,
  TENANT_NAME: (tCode) => `/api/v1/tenant/name?tenantCode=${encodeURIComponent(tCode)}`,
  CHANGE_PWD: '/user/account/changePassword',
  // —— 以下走 message-service（msgBase）——
  MSG_SEND: '/api/v1/messages/send',
  MSG_INBOX: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/messages`,
  MSG_UNREAD: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/inbox/unread-count`,
  MSG_CATEGORIES: '/api/v1/message-categories/tree',
  SENSITIVE_TEST: '/api/v1/sensitive/test'
};
