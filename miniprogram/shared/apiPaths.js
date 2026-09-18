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
  // —— 微信登录（可选增强，后端未实现时客户端静默降级）——
  // 静默登录：wx.login 的 code 换 token（后端按 openid 找已绑定账号，直接免密进系统）
  AUTH_WECHAT_LOGIN: '/auth/wechat-login',
  // 绑定：密码登录成功后，把当前微信 openid 绑定到账号（下次静默登录生效）
  AUTH_BIND_WECHAT: '/auth/bind-wechat',
  // —— 获客归因上报（可选，后端未实现时客户端静默降级）——
  TRACK_ATTRIBUTION: '/track/attribution',
  AUTH_KICK: (uid) => `/auth/kick/${uid}`,
  ACCOUNT_EXIST: (acc) => `/user/account/exist?account=${encodeURIComponent(acc)}`,
  TERM_MAP: (lang) => `/api/v1/term/map?lang=${encodeURIComponent(lang || 'zh')}`,
  TENANT_INDUSTRY: (tCode) => `/api/v1/tenant/industry${tCode ? '?tenantCode=' + encodeURIComponent(tCode) : ''}`,
  TENANT_NAME: (tCode) => `/api/v1/tenant/name?tenantCode=${encodeURIComponent(tCode)}`,
  CHANGE_PWD: '/user/account/changePassword',
  // —— 课程 / 排期（业务端）——
  COURSE_LIST: '/api/v1/course/list',
  COURSE_PAGE: '/api/v1/course/page',
  COURSE_DETAIL: (id) => `/api/v1/course/${id}`,
  SCHEDULE_ADD: '/api/v1/course/schedule/add',
  SCHEDULE_EDIT: '/api/v1/course/schedule/edit',
  SCHEDULE_LIST: '/api/v1/course/schedule/list',
  // —— 预约（业务端）——
  BOOKING_CREATE: '/api/v1/course/booking/create',
  BOOKING_PAGE: '/api/v1/course/booking/page',
  BOOKING_LIST: '/api/v1/course/booking/list',
  BOOKING_DETAIL: (id) => `/api/v1/course/booking/${id}`,
  BOOKING_UPDATE_STATUS: '/api/v1/course/booking/updateStatus',
  // —— 教师简介（业务端）——
  TEACHER_PUBLISHED_LIST: (tid) => `/api/v1/teacher/published?teacherId=${encodeURIComponent(tid)}`,
  TEACHER_PUBLISHED_LATEST: (tid) => `/api/v1/teacher/published/latestPublic?teacherId=${encodeURIComponent(tid)}`,
  // —— 管理端概览（业务端）——
  DASHBOARD_OVERVIEW: '/api/v1/dashboard/overview',
  DASHBOARD_TENANT_USAGE: (tid) => `/api/v1/dashboard/tenant/${tid}/usage`,
  // —— 租户级月度统计（数据总览，对应网页版 admin.html，经租户插件自动按当前租户隔离）——
  STAT_USER_BY_MONTH: (y, m) => `/api/v1/user/statistical/byMonth?year=${y}&month=${m}`,
  STAT_COURSE_BY_MONTH: (y, m) => `/api/v1/course/statistical/byMonth?year=${y}&month=${m}`,
  STAT_BOOKING_BY_MONTH: (y, m) => `/api/v1/course/booking/statistical/byMonth?year=${y}&month=${m}`,
  STAT_APPOINT_BY_MONTH: (y, m) => `/api/v1/course/appointment/statistical/byMonth?year=${y}&month=${m}`,
  STAT_APPOINT_ON_DAYS: (d) => `/api/v1/course/appointment/statistical/onDays?ondays=${d}`,
  // —— 后台列表（用户/课程/模板，对应 admin.html 用户管理 / 课程管理）——
  USER_PAGE: '/api/v1/user/page',
  COURSE_TEMPLATE_LIST: '/api/v1/course/template/list',
  // —— 以下走 message-service（msgBase）——
  MSG_SEND: '/api/v1/messages/send',
  // 收件箱列表（分页/筛选）
  MSG_INBOX: (uid, qs) => {
    const base = `/api/v1/users/${encodeURIComponent(uid)}/inbox`;
    if (!qs) return base;
    const s = Object.keys(qs).filter(k => qs[k] !== undefined && qs[k] !== null && qs[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(qs[k])).join('&');
    return s ? base + '?' + s : base;
  },
  MSG_UNREAD: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/inbox/unread-count`,
  MSG_DETAIL: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}`,
  MSG_READ: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/read`,
  MSG_UNREAD_SET: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/unread`,
  MSG_STAR: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/star`,
  MSG_UNSTAR: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/unstar`,
  MSG_DELETE: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}`,
  MSG_CATEGORIES: '/api/v1/message-categories/tree',
  SENSITIVE_TEST: '/api/v1/sensitive/test',
  SENSITIVE_GROUPS: '/api/v1/sensitive/groups',
  SENSITIVE_WORDS: '/api/v1/sensitive/words',
  // —— 排期（业务端，教师/管理员）——
  SCHEDULE_CREATE: '/api/v1/schedule/create',
  SCHEDULE_UPDATE: '/api/v1/schedule/update',
  SCHEDULE_DELETE: (id) => `/api/v1/schedule/delete/${encodeURIComponent(id)}`,
  SCHEDULE_DETAIL: (id) => `/api/v1/schedule/detail/${encodeURIComponent(id)}`,
  SCHEDULE_LIST_BY_TEACHER: (tid) => `/api/v1/schedule/listByTeacher?teacherId=${encodeURIComponent(tid)}`,
  SCHEDULE_UPDATE_STATUS: '/api/v1/schedule/updateStatus',
  SCHEDULE_INC_SITE: '/api/v1/schedule/incSite',
  SCHEDULE_GENERATE: '/api/v1/schedule/generate'
};
