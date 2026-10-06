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
  // 微信登录/绑定：authController @PostMapping("/wechat-login")、("/bind-wechat")。
  // 当前微信登录整体屏蔽（恢复流程：去 User.wxOpenid exist=false + 取消对应函数调用注释）；常量先就位，避免 undefined。
  AUTH_WECHAT_LOGIN: '/auth/wechat-login',
  AUTH_BIND_WECHAT: '/auth/bind-wechat',
  // 微信登录/绑定：authController @PostMapping("/wechat-login")、("/bind-wechat")。
  // 当前微信登录整体屏蔽（恢复流程：去 User.wxOpenid exist=false + 取消对应函数调用注释）；常量先就位，避免 undefined。
  TRACK_ATTRIBUTION: '/api/v1/user/attribution',
  ACCOUNT_EXIST: (acc) => `/user/account/exist?account=${encodeURIComponent(acc)}`,
  TERM_MAP: (lang) => `/api/v1/term/map?lang=${encodeURIComponent(lang || 'zh')}`,
  TENANT_INDUSTRY: (tCode) => `/api/v1/tenant/industry${tCode ? '?tenantCode=' + encodeURIComponent(tCode) : ''}`,
  TENANT_NAME: (tCode) => `/api/v1/tenant/name?tenantCode=${encodeURIComponent(tCode)}`,
  // 租户只读信息（各角色可用）：GET 当前登录者所属租户（含 tenantCode / expireTime 租期 / packageId / status）
  TENANT_CURRENT: '/api/v1/tenant/current',
  // 租户套餐（各角色可用，传自己 tenantId）：GET 某租户实际持有的套餐（各资源限额与当前数量）
  TENANT_PACKAGE_BY_TENANT: (tid) => `/api/v1/tenant/package/tenant/${tid}`,
  // 套餐模板详情（admin/platform_admin 可查）：GET 套餐模板名称等，用于把 packageId 转成可读"套餐"名
  PACKAGE_TEMPLATE_GET: (id) => `/api/v1/package/template/${id}`,
  CHANGE_PWD: '/user/account/changePassword',
  // —— 用户管理（业务端，租户/平台管理员）——
  // 后端 UserController：GET /page（租户隔离，按 role 过滤）；GET /platformPage（跨租户，仅平台管理员）
  USER_PAGE: '/api/v1/user/page',
  USER_PLATFORM_PAGE: '/api/v1/user/platformPage',
  // 用户名（展示用）：GET 返回单值姓名字符串；与 frontend/js/public/api.js getUserNameById 同源。
  // 「今日课程」要把 studentId/teacherId 渲染成人名，靠它逐个解析（带缓存，避免重复请求）。
  USER_NAME: (id) => `/api/v1/user/name/${encodeURIComponent(id || '')}`,
  // —— 课程 / 排期（业务端）——
  COURSE_LIST: '/api/v1/course/list',
  COURSE_PAGE: '/api/v1/course/page',
  COURSE_DETAIL: (id) => `/api/v1/course/${id}`,
  // 排期：ScheduleController @RequestMapping("/api/v1/schedule")，路径无 course 前缀。
  // admin 排期页（package-admin/schedule）用 SCHEDULE_LIST；teacher 端增改走下方“排期”分组的 SCHEDULE_CREATE/SCHEDULE_UPDATE。
  // 已清理早期误写的冗余别名 SCHEDULE_ADD/SCHEDULE_EDIT（与 CREATE/UPDATE 重复且易误导）。
  SCHEDULE_LIST: '/api/v1/schedule/list',
  // 按课程查排期（学生「课程预订」选课后的排期列表）：ScheduleController#getScheduleByCourseId。
  // 注意：该端点方法签名里 @RequestHeader("Authorization") token 是**必填**，
  // 所以调用方不能传 tokenOnly（否则不带 Bearer → 400/500），必须带登录态。
  // 只返回 Result<List<ScheduleCreateDTO>>（数组，不是分页对象），status 为空表示不过滤。
  SCHEDULE_SELECT_BY_COURSE: (courseId, status) =>
    `/api/v1/schedule/selectByCourseId/${encodeURIComponent(courseId || '')}`
    + (status ? `?status=${encodeURIComponent(status)}` : ''),
  // —— 课程模板（业务端，管理员/教师，TemplateController）——
  // 后端 @RequestMapping("/api/v1/course/template") + @GetMapping("/list")，响应 Result<List<CourseTemplate>>
  COURSE_TEMPLATE_LIST: '/api/v1/course/template/list',
  // —— 预约（业务端）——
  BOOKING_CREATE: '/api/v1/course/booking/create',
  BOOKING_PAGE: '/api/v1/course/booking/page',
  BOOKING_LIST: '/api/v1/course/booking/list',
  BOOKING_DETAIL: (id) => `/api/v1/course/booking/${id}`,
  BOOKING_UPDATE_STATUS: '/api/v1/course/booking/updateStatus',
  // 某排期「已占席位」数：BookingController#getBookingCountBySchedule，返回 Result<Integer>。
  // 口径 = 只统计占位状态（BOOKING/BOOKED/CANCELING…），候补(waiting)/已取消/被拒/已删除都不算，
  // 因此「剩余名额 = 排期 availableSites − 本接口返回值」，见 shared/domain/bookingState.js。
  BOOKING_COUNT_BY_SCHEDULE: (scheduleId) =>
    `/api/v1/course/booking/countByScheduleId/${encodeURIComponent(scheduleId || '')}`,
  // —— 教师简介（业务端）——
  // 后端 TeacherPublishedProfileController：GET /list、GET /latest-public（kebab-case，注意非 latestPublic）
  TEACHER_PUBLISHED_LIST: (tid) => `/api/v1/teacher/published/list?teacherId=${encodeURIComponent(tid)}`,
  TEACHER_PUBLISHED_LATEST: (tid) => `/api/v1/teacher/published/latest-public?teacherId=${encodeURIComponent(tid)}`,
  // —— 管理端概览（业务端）——
  DASHBOARD_OVERVIEW: '/api/v1/dashboard/overview',
  DASHBOARD_TENANT_USAGE: (tid) => `/api/v1/dashboard/tenant/${tid}/usage`,
  // —— 管理端数据总览统计（租户隔离，package-admin/dashboard 页用）——
  // 后端对应 User/Course/Booking/Appointment 各 Controller 的 /statistical/byMonth 与 /statistical/listByDays。
  STAT_USER_BY_MONTH: (year, month) => `/api/v1/user/statistical/byMonth?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
  STAT_COURSE_BY_MONTH: (year, month) => `/api/v1/course/statistical/byMonth?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
  STAT_BOOKING_BY_MONTH: (year, month) => `/api/v1/course/booking/statistical/byMonth?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
  STAT_APPOINT_BY_MONTH: (year, month) => `/api/v1/course/appointment/statistical/byMonth?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`,
  // 今日（近 N 天）课次：复用 listByDays 列表接口，dashboard.js 取数组长度作为今日课次计数
  STAT_APPOINT_ON_DAYS: (days) => `/api/v1/course/appointment/statistical/listByDays?days=${encodeURIComponent(days)}`,
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
  // —— 消息中心：已发 / 批量 / 回收站 / 撤回 / 接收人（message-service）——
  // 已发列表：GET /api/v1/messages/sent（发送者视角，含接收/已读统计与是否可收回）
  MSG_SENT: '/api/v1/messages/sent',
  // 发送历史列表（管理员/租户管理员视角，本租户全部已发）：GET /api/v1/messages?status=&senderType=
  // 后端 history() 要求 isManager()；非平台管理员自动按当前租户隔离（tenantId 无需传）。
  // 列表仅含标题/发送者/时间/状态（不含接收/已读统计，统计在 delivery-status 详情）。
  MSG_LIST: '/api/v1/messages',
  // 批量已读 / 批量删除(移回收站) / 批量彻底删除：userId 维度
  MSG_BATCH_READ: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/read/batch`,
  MSG_BATCH_DELETE: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/batch`,
  MSG_BATCH_PURGE: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/batch/purge`,
  // 恢复(回收站→收件箱) / 彻底删除(个人副本)：userId + mid
  MSG_RESTORE: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/restore`,
  MSG_PURGE: (uid, mid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/${mid}/purge`,
  // 列出某用户全部消息 id（供「全部已读」）：GET ?isDeleted=0
  MSG_IDS: (uid) => `/api/v1/users/${encodeURIComponent(uid)}/messages/ids`,
  // 撤回(发送者/管理员) / 管理员全局彻底删除(连同所有收件人副本与投递记录)：纯 mid，走 messages 前缀
  MSG_WITHDRAW: (mid) => `/api/v1/messages/${mid}/withdraw`,
  MSG_DELETE_GLOBAL: (mid) => `/api/v1/messages/${mid}`,
  // 单条消息投递追踪（已发详情）：接收/已读统计
  MSG_DELIVERY: (mid) => `/api/v1/messages/${mid}/delivery-status`,
  // 接收人 scope 解析：在 api 主模块（/api/v1/user/... 单数，不匹配 message-service 正则，走 apiBase 8081）
  MSG_RECIPIENTS: '/api/v1/user/message-recipients',
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
  SCHEDULE_GENERATE: '/api/v1/schedule/generate',
  // —— 课次 / 上课通知（业务端，学生/教师）——
  // 近 N 天课次列表（Web refreshAppointmentNotes 同源）；userId+role 限定当前用户
  APPOINTMENT_LIST_BY_DAYS: (days, userId, role) => {
    const p = [`days=${encodeURIComponent(days)}`];
    if (userId) p.push(`userId=${encodeURIComponent(userId)}`);
    if (role) p.push(`role=${encodeURIComponent(role)}`);
    return `/api/v1/course/appointment/statistical/listByDays?${p.join('&')}`;
  },
  // 近 N 天课次（分页版，POST @RequestBody AppointmentQueryPage）。
  // Web「今日课程」teacher 端按排期聚合展示走这个：服务端逐条分页会把同一排期拆到不同页，
  // 故需循环翻页取回全量再客户端分组（见 frontend/js/admin-AppointmentNotes.js teacher 分支）。
  APPOINTMENT_LIST_BY_DAYS_PAGE: '/api/v1/course/appointment/statistical/listByDaysByPage',
  // 课次单条状态更新：PUT { id, status }（前端 operateAppointmentStatus / 「申请改期」批量走这个）
  APPOINTMENT_UPDATE_STATUS_BY_ID: '/api/v1/course/appointment/updateStatusById',
  // 某条预订下的全部课次：AppointmentController#getByBookingId，返回 Result<List<Appointment>>（数组）。
  // 学生「我的预约」逐课次延期/请假靠它：请假=PUT updateStatusById 置 'cancelling'，取消延期=置回 'active'。
  APPOINTMENT_LIST_BY_BOOKING: (bookingId) =>
    `/api/v1/course/appointment/getByBookingId?bookingId=${encodeURIComponent(bookingId || '')}`,
  // —— 教师公开主页（业务端，免登录公开接口）——
  TEACHER_PUBLIC_LIST: (tc) => `/api/v1/teacher/published/public-list?tenantCode=${encodeURIComponent(tc || '')}`,
  TEACHER_PUBLIC_GET: (id) => `/api/v1/teacher/published/public-get?id=${encodeURIComponent(id || '')}`
};
