// 跨端共享核心：统一出口（barrel）。
// 小程序端经 sync 拷贝到 miniprogram/shared/ 后 import；Web 端可经桥接文件挂到 window。
export * from './constants.js';
export * from './format.js';
export * from './apiPaths.js';
export * from './terms.js';
// P1 领域层下沉：退改规则纯逻辑（零 DOM），Web 端经 P0 构建桥接后可挂 window.RefundRuleDomain。
export * from './domain/refundRule.js';
// P1 领域层下沉：预约/排期状态机 + 候补满额判定（零 DOM）。
export * from './domain/bookingState.js';
// P1 领域层下沉：课次(appointment)状态（零 DOM）。
export * from './domain/appointmentState.js';
