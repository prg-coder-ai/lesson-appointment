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
//   - Web 端：经构建桥接挂到 window.BookingStateDomain（P0-Web 已闭环；改本文件后需重跑
//     frontend/tools/gen-shared-bridge.js 才在浏览器生效，build.js 会自动调用）
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

// 非占位态集合（单一事实来源）。
//
// 与后端 BookingStatus.NON_OCCUPYING = [waiting, cancelled, canceled, rej-booking, frozen] 的关系：
//   前五项严格对齐；'deleted' 是本层**额外的防御项**，后端并不存在这个落库值——
//   后端 BookingStatus.DELETE = 'delete' 只是 updateStatus 的动作值（走 deleteById、不落库），
//   而落库的「已删除」语义由 frozen 承载（见 BookingStatus.FROZEN 的注释）。
//   保留它的理由：万一将来有写路径把 'deleted' 落库，判成「占位」会让席位被永久吃掉，
//   排期一直显示满员、候补永远递补不进来——这正是后端 frozen 当初漏在 NON_OCCUPYING 里踩过的坑。
//   宁可多判一个非占位，也不冒席位泄漏的风险。
//
// 因此这里**不是**与后端逐字相等，而是「后端子集 + deleted 防御项」。改名单时两边都要看。
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

/* -------------------------------------------------- 状态 → 展示文案（单一来源，支持两端用字档案） */

/**
 * 文案档案：把「两端用字差异」显式建模成两个受支持的档案，而不是让各端各写一套 switch。
 *
 * 背景：Web 与小程序在这一处的文案**刻意不同**，且该差异已被接受（2026-10-06 拍板：
 * 小程序统一用「预订」，Web/API 维持「预定」不动，含状态「预定待确认」）。
 * 所以这里不是「谁没对齐谁」，而是两个并列的合法口径。
 *
 * 差异清单（web vs default）：
 *   booking         预定待确认 | 待确认
 *   booked          预定已确认 | 已确认
 *   rej-booking     已拒绝预订 | 已拒绝     ← Web 侧原本就用「订」，两端各自沿用，不强行拉平
 *   frozen/deleted  已删除     | 已失效
 * 其余分支（waiting / canceling / cancelled / completed / rej-cancelling）两端完全一致。
 *
 * 为什么用「档案」而不是三个独立参数：这四处分歧不是三个正交维度，
 * 而是「Web 说法」与「小程序说法」两套整体；档案能精确复刻两端现状，不引入猜测规则。
 */
const STATUS_TEXT_PROFILES = {
  // 小程序口径（缺省）。同时是 Web 端 completed 分支缺失时的正确回落值。
  default: {
    booking: '待确认',
    waiting: '候补',
    canceling: '取消待确认',
    booked: '已确认',
    cancelled: '已取消',
    completed: '已完成',
    rejBooking: '已拒绝',
    rejCanceling: '已拒绝取消',
    ended: '已失效'
  },
  // Web 口径：保留「预定」用字（2026-10-06 拍板），ended 用「已删除」。
  web: {
    booking: '预定待确认',
    waiting: '候补',
    canceling: '取消待确认',
    booked: '预定已确认',
    cancelled: '已取消',
    completed: '已完成',
    rejBooking: '已拒绝预订',
    rejCanceling: '已拒绝取消',
    ended: '已删除'
  }
};

/**
 * 状态 → 中文展示文案。
 *
 * @param {string} status
 * @param {Object} [opts] { profile?: 'default' | 'web' }
 *        不传或传未知值一律按 'default'（小程序口径）——保持旧调用点行为不变。
 * @returns {string} 未知状态透传原值；空值回落 '—'。
 *
 * 注：显式调用 web 档案还能顺带修掉 Web 端一个既有缺陷——
 * courseAndBooking.js 的 checkStatus_booking() 没有 completed 分支，
 * 导致「已完成」被原样输出成英文 'completed'；委托后回落 '已完成'。
 */
export function bookingStatusText(status, opts) {
  const profile = (opts && opts.profile === 'web')
    ? STATUS_TEXT_PROFILES.web
    : STATUS_TEXT_PROFILES.default;
  switch (normalizeBookingStatus(status)) {
    case 'booking': return profile.booking;
    case 'waiting': return profile.waiting;
    case 'canceling': return profile.canceling;
    case 'booked': return profile.booked;
    case 'cancelled': return profile.cancelled;
    case 'completed': return profile.completed;
    case 'rej-booking': return profile.rejBooking;
    case 'rej-cancelling': return profile.rejCanceling;
    case 'frozen':
    case 'deleted': return profile.ended;
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
