// 跨端共享：常量与运行配置（无任何浏览器 / 小程序 API 依赖）
// 这是 Web 端与小程序端唯一共享的"纯逻辑"层，被 frontend/ 与 miniprogram/ 同时引用。

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student'
};

export const PLATFORM_TENANT_CODE = 'platform';

// 预约 / 排期状态（与后端 BookingStatus 对齐，避免在两端各写一套）
export const BOOKING_STATUS = {
  WAITING: 'waiting',     // 候补
  BOOKED: 'booked',       // 已预约
  CANCELING: 'canceling', // 取消中
  CANCELLED: 'cancelled', // 已取消
  NON_OCCUPYING: 'non_occupying' // 非占位（取消/冻结）
};

// 运行配置：由各端在启动时注入（web 同源留空；小程序用配置的绝对 HTTPS 地址）
export const RUNTIME_CONFIG = {
  apiBase: '',   // 业务端（api 模块，默认 8083）
  msgBase: '',   // 消息中心（message-service，默认 8090）
  dev: false
};

export function setRuntimeConfig(cfg) {
  Object.assign(RUNTIME_CONFIG, cfg || {});
}

// 角色 → 首页路由（两端共用，避免各写一套 switch）
export function homePageForRole(role) {
  switch (role) {
    case ROLES.PLATFORM_ADMIN: return '/package-admin/home/home';
    case ROLES.ADMIN: return '/package-admin/home/home';
    case ROLES.TEACHER: return '/package-teacher/home/home';
    case ROLES.STUDENT: return '/package-student/home/home';
    default: return '/pages/login/login';
  }
}

// 底部导航项定义（按角色分组）。icon 用小程序内置 iconfont 名称（见组件 role-tabbar）。
// key 同时用于页面间的 active 高亮判断。
export const TAB_ITEMS = {
  student: [
    { key: 'home', page: '/package-student/home/home', text: '首页', icon: 'home' },
    { key: 'booking', page: '/package-student/booking/booking', text: '约课', icon: 'calendar' },
    { key: 'my', page: '/package-student/my-booking/my-booking', text: '我的预约', icon: 'list' },
    { key: 'mine', page: '/pages/mine/mine', text: '我的', icon: 'user' }
  ],
  teacher: [
    { key: 'home', page: '/package-teacher/home/home', text: '工作台', icon: 'home' },
    { key: 'courses', page: '/package-teacher/courses/courses', text: '我的课程', icon: 'book' },
    { key: 'profile', page: '/package-teacher/profile/profile', text: '我的简介', icon: 'friend' },
    { key: 'mine', page: '/pages/mine/mine', text: '我的', icon: 'user' }
  ],
  admin: [
    { key: 'home', page: '/package-admin/home/home', text: '概览', icon: 'home' },
    { key: 'dashboard', page: '/package-admin/dashboard/dashboard', text: '运营', icon: 'chart' },
    { key: 'mine', page: '/pages/mine/mine', text: '我的', icon: 'user' }
  ]
};

// 角色 → 导航分组 key（student/teacher/admin）
export function tabGroupForRole(role) {
  if (role === ROLES.TEACHER) return 'teacher';
  if (role === ROLES.ADMIN || role === ROLES.PLATFORM_ADMIN) return 'admin';
  return 'student';
}

// 角色中文名（用于登录页/个人中心展示）
export function roleLabel(role) {
  switch (role) {
    case ROLES.PLATFORM_ADMIN: return '平台管理员';
    case ROLES.ADMIN: return '租户管理员';
    case ROLES.TEACHER: return '教师';
    case ROLES.STUDENT: return '学生';
    default: return role || '';
  }
}
