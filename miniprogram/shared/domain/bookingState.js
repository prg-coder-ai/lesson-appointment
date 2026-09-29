// shared/domain/bookingState.js
// 跨端共享「预约/排期状态机 + 候补满额判定」领域层（纯逻辑，零 DOM / 零运行时 API 依赖）。
//
// 这是 P1（Headless 领域层下沉）的一部分：把原本散落在
//   - frontend/js/public/courseAndBooking.js 的 bookingOccupiesSeat() / checkStatus_booking()
//   - frontend/js/student-bookingCards.js 的 formatRemainingSites() / FULLY_BOOKED_TEXT
//   - miniprogram/package-teacher/booking/booking.js 的 bkStatusText()
// 里的重复实现收口成唯一权威源，让 Web 与小程序共用同一套状态语义、占用口径、满额判定。
// UI 各自渲染（Decision 3：视图层允许不一致）。
//
// 【与后端同步】单一事实来源是 api/.../common/BookingStatus.java。
//   占席位态：booking(待确认) / booked(已确认) / canceling|canceling(取消申请在管理员确认前原预订仍有效)
//   非占位态：waiting(候补) / cancelled|canceled / rej-booking(预订被拒) / frozen|deleted(冻结/删除)
//   终态：    completed
//   后端存在美式/英式拼写（canceling/cancelling、canceled/cancelled），本模块统一归一。
//   并发安全（候补转正、取消）由后端闸门 857a233（排期行锁 + 锁定读计数 + CAS）保证，前端只做入口校验。
//
// 消费方式：
//   - 小程序端：import { bookingStatusText, bookingOccupiesSeat, formatRemainingSites } from '../../shared/domain/bookingState.js'
//   - Web 端：经 P0 构建桥接挂到 window.BookingStateDomain（TODO，属 P0-Web 范围）
//   - Node 端：直接 import 做单测（本文件无任何 document/window/fetch 引用）

import { BOOKING_STATUS } from '../constants.js';

/* -------------------------------------------------- 状态枚举（补全后端已知态） */

// 在 shared/constants.js 的 BOOKING_STATUS 基础上补全所有已知后端态，
// 避免两端各写一套 switch。BOOKING_STATUS 仍是「核心四态」入口。
export const BOOKING_STATUS_ALL = Object.freeze({
  ...BOOKING_STATUS,
  PENDING: 'booking',                 // 待确认（预订提交未审核）
  COMPLETED: 'completed',             // 已完成
  REJECTED_BOOKING: 'rej-booking',    // 预订被拒
  REJECTED_CANCEL: 'rej-cancelling',  // 取消被拒
  FROZEN: 'frozen',                   // 已冻结
  DELETED: 'deleted'                  // 已删除
});

// 非占位态集合（单一事实来源，与后端 BookingStatus.NON_OCCUPYING 对齐）。
// 候补(waiting) 不占席位；取消/拒/冻结 也不再占席位。
export const NON_OCCUPYING_STATUSES = Object.freeze([
  'waiting', 'cancelled', 'canceled', 'rej-booking', 'frozen', 'deleted'
]);

/* -------------------------------------------------- 状态归一 */

/**
 * 归一化状态：美式/英式拼写统一 + 空值兜底。
 * @param {string|null|undefined} status
 * @returns {string} 归一后的状态串；null/空按 DB 列 NOT NULL DEFAULT 'booked' 兜回 'booked'。
 */
export function normalizeBookingStatus(status) {
  if (status === null || status === undefined) return 'booked';
  const s = String(status).trim();
  if (s === '') return 'booked';
  if (s === 'cancelling') return 'canceling';
  if (s === 'canceled') return 'cancelled';
  return s;
}

/* -------------------------------------------------- 占用 / 占位判定 */

/** 该 booking 状态是否占用一个排期席位（纯函数，零 DOM）。 */
export function bookingOccupiesSeat(status) {
  return NON_OCCUPYING_STATUSES.indexOf(normalizeBookingStatus(status)) === -1;
}

/** 是否非占位（候补/取消/拒/冻结/删除） */
export function isNonOccupying(status) {
  return !bookingOccupiesSeat(status);
}

/* -------------------------------------------------- 单态布尔判定（归一后比较） */

export function isWaiting(status) { return normalizeBookingStatus(status) === 'waiting'; }
export function isBooked(status) { return normalizeBookingStatus(status) === 'booked'; }
export function isPending(status) { return normalizeBookingStatus(status) === 'booking'; }
export function isCancelled(status) { return ['cancelled', 'canceled'].indexOf(normalizeBookingStatus(status)) !== -1; }
export function isCompleted(status) { return normalizeBookingStatus(status) === 'completed'; }

/* -------------------------------------------------- 转移动作守卫（纯函数） */

/**
 * 是否可「确认」：候补或待确认 → 已确认。
 * 仅做入口校验；真正转正与并发由后端闸门保证。
 */
export function canConfirm(status) {
  const s = normalizeBookingStatus(status);
  return s === 'waiting' || s === 'booking';
}

/** 是否可「取消」：已确认或取消待确认 → 已取消 */
export function canCancel(status) {
  const s = normalizeBookingStatus(status);
  return s === 'booked' || s === 'canceling';
}

/** 是否可「拒绝」：待确认 / 候补 / 取消待确认 都可被拒 */
export function canReject(status) {
  const s = normalizeBookingStatus(status);
  return s === 'waiting' || s === 'booking' || s === 'canceling';
}

/* -------------------------------------------------- 状态 → 展示文案（单一来源） */

/**
 * 状态 → 中文展示文案。两端统一语义：
 *   待确认 / 候补 / 取消待确认 / 已确认 / 已取消 / 已完成 / 已拒绝 / 已拒绝取消 / 已失效
 * 以 Web 端 checkStatus_booking 的语义为基准（最完整），覆盖 mp bkStatusText 全部分支。
 */
export function bookingStatusText(status) {
  switch (normalizeBookingStatus(status)) {
    case 'booking': return '待确认';
    case 'waiting': return '候补';
    case 'canceling': return '取消待确认';
    case 'booked': return '已确认';
    case 'cancelled': return '已取消';
    case 'completed': return '已完成';
    case 'rej-booking': return '已拒绝';
    case 'rej-cancelling': return '已拒绝取消';
    case 'frozen':
    case 'deleted': return '已失效';
    default: return status || '—';
  }
}

/* -------------------------------------------------- 候补 / 满额判定（纯逻辑） */

// 满额展示文案（与 student-bookingCards.js 的 FULLY_BOOKED_TEXT 对齐，单一来源）。
export const FULLY_BOOKED_TEXT = '满额';

/**
 * 剩余员额 → 展示文案（零 DOM 纯函数）。
 * ''/null/undefined/非有限数 一律按「未知」返回空串（不伪装成 0）。
 * 剩余 <= 0 → '满额'；其余显示数字。
 * 注意：满额文案绝不能当数值传给 Number()（会得到 NaN → 误判未满），
 *       需要回读数值时请用 isSiteFull / 数值载体，见 student-bookingCards.js 的 data-remaining 约定。
 */
export function formatRemainingSites(remainingSites) {
  if (remainingSites === null || remainingSites === undefined || remainingSites === '') return '';
  const n = Number(remainingSites);
  if (!Number.isFinite(n)) return '';
  return n > 0 ? String(n) : FULLY_BOOKED_TEXT;
}

/** 是否满额（剩余 <= 0）；未知值不视为满（返回 false）。 */
export function isSiteFull(remainingSites) {
  const n = Number(remainingSites);
  if (!Number.isFinite(n)) return false;
  return n <= 0;
}
