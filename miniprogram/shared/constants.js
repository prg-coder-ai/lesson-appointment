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
    case ROLES.PLATFORM_ADMIN: return '/pages/home/home';
    case ROLES.ADMIN: return '/pages/home/home';
    case ROLES.TEACHER: return '/pages/home/home';
    case ROLES.STUDENT: return '/pages/home/home';
    default: return '/pages/login/login';
  }
}
