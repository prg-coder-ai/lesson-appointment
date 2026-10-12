// shared/domain/appointmentState.js
// 跨端共享「课次(appointment)状态」领域层（纯逻辑，零 DOM / 零运行时 API 依赖）。
//
// 这是 P1（Headless 领域层下沉）的一部分：把原本写在
//   - miniprogram/package-student/appointment/appointment.js 的 apptStatusText()
// 里的课次状态 → 文案映射收口为唯一权威源；Web 端「今日课程」(today_course) 后续可对齐复用，
// 消除两端各写一套 switch 的漂移风险。
//
// 【与后端同步】对齐后端 Appointment 状态枚举（active/noted1/noted2/completed/cancelled/
// s-cancelling/t-cancelling/t-cancelled/t-reject/changed）。
//
// 消费方式：
//   - 小程序端：import { appointmentStatusText } from '../../shared/domain/appointmentState.js'
//   - Web 端：经 P0 构建桥接挂到 window.AppointmentStateDomain（TODO，属 P0-Web 范围）
//   - Node 端：直接 import 做单测（本文件无任何 document/window/fetch 引用）

/* -------------------------------------------------- 状态枚举 */

export const APPOINTMENT_STATUS = Object.freeze({
  ACTIVE: 'active',
  NOTED1: 'noted1',
  NOTED2: 'noted2',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  S_CANCELLING: 's-cancelling',   // 学生取消待确认
  T_CANCELLING: 't-cancelling',   // 教师取消中
  T_CANCELLED: 't-cancelled',     // 教师已取消
  T_REJECT: 't-reject',           // 教师拒绝
  CHANGED: 'changed'              // 已改期
});

// 终态集合（课次已结束，不再可操作）。
export const APPOINTMENT_CLOSED_STATUSES = Object.freeze([
  'completed', 'cancelled', 't-cancelled', 'changed'
]);

/* -------------------------------------------------- 状态 → 展示文案（单一来源） */

/**
 * 课次(appointment)状态 → 中文展示文案（单一权威源）。
 *
 * 覆盖：
 *   - 小程序窄集（active/noted/completed/cancelled/s-cancelling/t-cancelling/t-cancelled/t-reject/changed）；
 *   - Web「今日课程」混合表里出现的全部态——课次态之外，同一张表还会混入 booking 态
 *     （booked/waiting/cancelling/canceled/deleted/frozen/reject/rej-booking），
 *     以及排期预览槽的排期态（pending/inactive，由 Web 本地处理，不在此域）。
 * noted1/noted2 合并为「已通知」（两次通知档位，语义一致）。
 * 教师取消相关态（t-cancelling/t-cancelled）带可配置行业词，避免把「教师」硬编码进共享层。
 *
 * @param {string} status
 * @param {Object} [opts] { teacherLabel?: string } 教师/教练等行业词，缺省「教师」
 * @returns {string}
 */
export function appointmentStatusText(status, opts) {
  const teacherLabel = (opts && typeof opts.teacherLabel === 'string' && opts.teacherLabel)
    ? opts.teacherLabel : '教师';
  switch (status) {
    case 'active': return '生效';
    case 'noted1':
    case 'noted2': return '已通知';
    case 'completed': return '已完成';
    case 'cancelling':
    case 'canceling':
    case 's-cancelling': return '取消待确认';
    case 'changed': return '已改期';
    case 'cancelled': return '已取消';
    case 't-cancelling': return teacherLabel + '取消中';
    case 't-cancelled': return teacherLabel + '已取消';
    case 't-reject': return '已拒绝';
    // ---- Web 课次/预订混合表（appointmentNotes / 学生端预览）里出现的 booking 态 ----
    case 'booking': return '待确认';
    case 'booked': return '预约已确认';
    case 'waiting': return '候补';
    case 'deleted':
    case 'frozen': return '已删除';
    case 'reject':
    case 'rej-booking': return '已拒绝';
    default: return status || '—';
  }
}

/* -------------------------------------------------- 终态判定（纯函数） */

/** 课次是否已结束（终态），用于过滤「可操作」入口 */
export function isAppointmentClosed(status) {
  return APPOINTMENT_CLOSED_STATUSES.indexOf(String(status || '')) !== -1;
}
