// tools/test-shared-domain.mjs
// P1 验收：同一断言集对「共享领域层」跑通（node 端即共享执行，小程序经 sync 后 import 同一文件）。
// 运行：node tools/test-shared-domain.mjs
import {
  BOOKING_STATUS_ALL, NON_OCCUPYING_STATUSES, FULLY_BOOKED_TEXT,
  normalizeBookingStatus, bookingOccupiesSeat, isNonOccupying,
  isWaiting, isBooked, isPending, isCancelled, isCompleted,
  canConfirm, canCancel, canReject,
  bookingStatusText, formatRemainingSites, isSiteFull
} from '../shared/domain/bookingState.js';
import {
  APPOINTMENT_STATUS, APPOINTMENT_CLOSED_STATUSES,
  appointmentStatusText, isAppointmentClosed
} from '../shared/domain/appointmentState.js';

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`FAIL ${name}: got ${a}, expected ${e}`); }
}
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL ${name}`); }
}

/* ---------------- 状态归一 ---------------- */
eq(normalizeBookingStatus('cancelling'), 'canceling', 'normalize canceling→canceling');
eq(normalizeBookingStatus('canceled'), 'cancelled', 'normalize canceled→cancelled');
eq(normalizeBookingStatus(null), 'booked', 'normalize null→booked(default)');
eq(normalizeBookingStatus(''), 'booked', 'normalize empty→booked(default)');
eq(normalizeBookingStatus('  booked '), 'booked', 'normalize trim');

/* ---------------- 占用 / 占位 ---------------- */
ok(!bookingOccupiesSeat('waiting'), 'waiting 不占席位');
ok(!bookingOccupiesSeat('cancelled'), 'cancelled 不占席位');
ok(!bookingOccupiesSeat('canceled'), 'canceled 不占席位(美式)');
ok(!bookingOccupiesSeat('rej-booking'), 'rej-booking 不占席位');
ok(!bookingOccupiesSeat('frozen'), 'frozen 不占席位');
ok(bookingOccupiesSeat('booking'), 'booking 占席位');
ok(bookingOccupiesSeat('booked'), 'booked 占席位');
ok(bookingOccupiesSeat('canceling'), 'canceling 占席位(管理员确认前有效)');
ok(!isNonOccupying('booked'), 'booked 非非占位');
ok(isNonOccupying('waiting'), 'waiting 是非占位');

/* ---------------- 单态布尔 ---------------- */
ok(isWaiting('waiting') && !isWaiting('booked'), 'isWaiting');
ok(isBooked('booked') && !isBooked('waiting'), 'isBooked');
ok(isPending('booking') && !isPending('booked'), 'isPending');
ok(isCancelled('cancelled') && isCancelled('canceled'), 'isCancelled(双拼写)');
ok(isCompleted('completed'), 'isCompleted');

/* ---------------- 转移动作守卫 ---------------- */
ok(canConfirm('waiting') && canConfirm('booking'), 'canConfirm: waiting/booking');
ok(!canConfirm('booked'), 'canConfirm: booked 不可再确认');
ok(!canConfirm('cancelled'), 'canConfirm: cancelled 不可');
ok(canCancel('booked') && canCancel('canceling'), 'canCancel: booked/canceling');
ok(!canCancel('waiting'), 'canCancel: waiting 不可取消(应确认转正)');
ok(canReject('waiting') && canReject('booking') && canReject('canceling'), 'canReject');
ok(!canReject('booked'), 'canReject: booked 不可拒(应走取消)');

/* ---------------- 状态→文案（统一两端） ---------------- */
eq(bookingStatusText('booking'), '待确认', 'bk booking→待确认');
eq(bookingStatusText('waiting'), '候补', 'bk waiting→候补');
eq(bookingStatusText('canceling'), '取消待确认', 'bk canceling→取消待确认');
eq(bookingStatusText('cancelling'), '取消待确认', 'bk cancelling(英式)→取消待确认');
eq(bookingStatusText('booked'), '已确认', 'bk booked→已确认');
eq(bookingStatusText('cancelled'), '已取消', 'bk cancelled→已取消');
eq(bookingStatusText('canceled'), '已取消', 'bk canceled(美式)→已取消');
eq(bookingStatusText('completed'), '已完成', 'bk completed→已完成');
eq(bookingStatusText('rej-booking'), '已拒绝', 'bk rej-booking→已拒绝');
eq(bookingStatusText('rej-cancelling'), '已拒绝取消', 'bk rej-cancelling→已拒绝取消');
eq(bookingStatusText('frozen'), '已失效', 'bk frozen→已失效');
eq(bookingStatusText('deleted'), '已失效', 'bk deleted→已失效');
eq(bookingStatusText('weird'), 'weird', 'bk 未知态透传');
// mp 旧 bkStatusText 全部分支必须被覆盖且一致
eq(bookingStatusText('booking'), '待确认', 'mp bkStatusText booking');
eq(bookingStatusText('waiting'), '候补', 'mp bkStatusText waiting');
eq(bookingStatusText('booked'), '已确认', 'mp bkStatusText booked');
eq(bookingStatusText('canceling'), '取消待确认', 'mp bkStatusText canceling');
eq(bookingStatusText('cancelled'), '已取消', 'mp bkStatusText cancelled');
eq(bookingStatusText('completed'), '已完成', 'mp bkStatusText completed');

/* ---------------- 候补 / 满额判定 ---------------- */
eq(formatRemainingSites(5), '5', 'remain 5→"5"');
eq(formatRemainingSites(0), FULLY_BOOKED_TEXT, 'remain 0→满额');
eq(formatRemainingSites(-1), FULLY_BOOKED_TEXT, 'remain -1→满额');
eq(formatRemainingSites(''), '', 'remain empty→""');
eq(formatRemainingSites(null), '', 'remain null→""');
eq(formatRemainingSites('abc'), '', 'remain nan→""');
ok(isSiteFull(0) && isSiteFull(-2), 'isSiteFull 0/-2');
ok(!isSiteFull(1) && !isSiteFull('abc'), 'isSiteFull 1/nan false');
ok(NON_OCCUPYING_STATUSES.indexOf('waiting') !== -1, 'NON_OCCUPYING 含 waiting');
ok(BOOKING_STATUS_ALL.BOOKED === 'booked', 'BOOKING_STATUS_ALL 含 booked');

/* ---------------- 课次(appointment)状态 ---------------- */
eq(appointmentStatusText('active'), '生效', 'appt active→生效');
eq(appointmentStatusText('noted1'), '已通知', 'appt noted1→已通知');
eq(appointmentStatusText('noted2'), '已通知', 'appt noted2→已通知');
eq(appointmentStatusText('completed'), '已完成', 'appt completed→已完成');
eq(appointmentStatusText('cancelled'), '已取消', 'appt cancelled→已取消');
eq(appointmentStatusText('s-cancelling'), '取消待确认', 'appt s-cancelling→取消待确认');
eq(appointmentStatusText('t-cancelling'), '教师取消中', 'appt t-cancelling→教师取消中');
eq(appointmentStatusText('t-cancelled'), '教师已取消', 'appt t-cancelled→教师已取消');
eq(appointmentStatusText('t-reject'), '已拒绝', 'appt t-reject→已拒绝');
eq(appointmentStatusText('changed'), '已改期', 'appt changed→已改期');
ok(isAppointmentClosed('completed') && isAppointmentClosed('cancelled') &&
   isAppointmentClosed('t-cancelled') && isAppointmentClosed('changed'), 'appt closed 集合');
ok(!isAppointmentClosed('active'), 'appt active 非终态');

/* ---------------- 汇总 ---------------- */
console.log(`[shared-domain] ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
