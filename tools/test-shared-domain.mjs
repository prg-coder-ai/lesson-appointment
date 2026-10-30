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
import { maskPhone, maskEmail } from '../shared/domain/mask.js';
import {
  formatDateTime, formatDate, parseLocalDate, parseLocalDateTime, weekdayCN, toDateTimeLocalValue
} from '../shared/domain/datetime.js';
import { RESULT_OK, resolveResult, resolveRequestError, errorMessage } from '../shared/domain/errorCode.js';

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
eq(bookingStatusText('booking'), '待确认', 'mp bkStatusText booking');
eq(bookingStatusText('waiting'), '候补', 'mp bkStatusText waiting');
eq(bookingStatusText('booked'), '已确认', 'mp bkStatusText booked');
eq(bookingStatusText('canceling'), '取消待确认', 'mp bkStatusText canceling');
eq(bookingStatusText('cancelled'), '已取消', 'mp bkStatusText cancelled');
eq(bookingStatusText('completed'), '已完成', 'mp bkStatusText completed');

/* ---------------- 状态→文案：web 档案（用字口径，2026-10-06 拍板保留两端差异） ---------------- */
eq(bookingStatusText('booking', { profile: 'web' }), '预定待确认', 'bk(web) booking→预定待确认');
eq(bookingStatusText('booked', { profile: 'web' }), '预定已确认', 'bk(web) booked→预定已确认');
eq(bookingStatusText('rej-booking', { profile: 'web' }), '已拒绝预订', 'bk(web) rej-booking→已拒绝预订');
eq(bookingStatusText('frozen', { profile: 'web' }), '已删除', 'bk(web) frozen→已删除');
eq(bookingStatusText('deleted', { profile: 'web' }), '已删除', 'bk(web) deleted→已删除');
// 两端一致的分支：web 档案不得改变它们
eq(bookingStatusText('waiting', { profile: 'web' }), '候补', 'bk(web) waiting 与 default 一致');
eq(bookingStatusText('canceling', { profile: 'web' }), '取消待确认', 'bk(web) canceling 与 default 一致');
eq(bookingStatusText('cancelling', { profile: 'web' }), '取消待确认', 'bk(web) cancelling 归一同上');
eq(bookingStatusText('cancelled', { profile: 'web' }), '已取消', 'bk(web) cancelled 与 default 一致');
eq(bookingStatusText('rej-cancelling', { profile: 'web' }), '已拒绝取消', 'bk(web) rej-cancelling 与 default 一致');
// web 档案顺带修掉 Web 端 completed 缺分支（原样输出英文 'completed'）的缺陷
eq(bookingStatusText('completed', { profile: 'web' }), '已完成', 'bk(web) completed→已完成(修 Web 缺分支)');
// 档案参数容错：未知 profile / 空 opts / null 一律回落 default，保证旧调用点零变化
eq(bookingStatusText('booking', { profile: 'nope' }), '待确认', 'bk 未知 profile 回落 default');
eq(bookingStatusText('booking', {}), '待确认', 'bk 空 opts 回落 default');
eq(bookingStatusText('booking', null), '待确认', 'bk null opts 回落 default');
eq(bookingStatusText('weird', { profile: 'web' }), 'weird', 'bk(web) 未知态透传');

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
// Web 混合表里的 booking 态（appointmentNotes / 学生端预览）也走同一权威源
eq(appointmentStatusText('booking'), '待确认', 'appt booking→待确认');
eq(appointmentStatusText('booked'), '预约已确认', 'appt booked→预约已确认');
eq(appointmentStatusText('waiting'), '候补', 'appt waiting→候补');
eq(appointmentStatusText('deleted'), '已删除', 'appt deleted→已删除');
eq(appointmentStatusText('frozen'), '已删除', 'appt frozen→已删除');
eq(appointmentStatusText('reject'), '已拒绝', 'appt reject→已拒绝');
eq(appointmentStatusText('rej-booking'), '已拒绝', 'appt rej-booking→已拒绝');
eq(appointmentStatusText('canceling'), '取消待确认', 'appt canceling(美式)归一→取消待确认');
eq(appointmentStatusText(''), '—', 'appt 空串兜底→—');
eq(appointmentStatusText('t-cancelling', { teacherLabel: '律师' }), '律师取消中', 'appt t-cancelling 行业词参数化');
eq(appointmentStatusText('t-cancelled', { teacherLabel: '教练' }), '教练已取消', 'appt t-cancelled 行业词参数化');
eq(appointmentStatusText('t-cancelling'), '教师取消中', 'appt t-cancelling 缺省行业词=教师');
ok(isAppointmentClosed('completed') && isAppointmentClosed('cancelled') &&
   isAppointmentClosed('t-cancelled') && isAppointmentClosed('changed'), 'appt closed 集合');
ok(!isAppointmentClosed('active'), 'appt active 非终态');

/* ---------------- 数据脱敏 mask.js ---------------- */
eq(maskPhone('13812345678'), '138****5678', 'maskPhone 11位');
eq(maskPhone('1234'), '****', 'maskPhone ≤4位全盘星');
eq(maskPhone('12345'), '1***5', 'maskPhone 5位首尾留');
eq(maskPhone(''), '', 'maskPhone 空串');
eq(maskPhone(null), '', 'maskPhone null');
eq(maskPhone('  13900001111  '), '139****1111', 'maskPhone trim');
eq(maskEmail('a@b.cn'), '*@b.cn', 'maskEmail 1位local');
eq(maskEmail('ab@c'), 'a*@c', 'maskEmail 2位');
eq(maskEmail('abc@x'), 'a**@x', 'maskEmail 3位');
eq(maskEmail('abcd@x'), 'a***@x', 'maskEmail 4位');
eq(maskEmail('zhangsan@example.com'), 'zh****an@example.com', 'maskEmail 8位前2后2中4');
eq(maskEmail('plaintext'), 'plaintext', 'maskEmail 无@原样');
eq(maskEmail(null), '', 'maskEmail null');

/* ---------------- 时区/日历 datetime.js ---------------- */
eq(formatDateTime('2024-01-01T12:34:56'), '2024-01-01 12:34:56', 'fmt 含秒');
eq(formatDateTime('2024-01-01T12:34:56', false), '2024-01-01 12:34', 'fmt 截分到分');
eq(formatDateTime('2024-01-01 12:34:56'), '2024-01-01 12:34:56', 'fmt 空格分隔也行');
eq(formatDateTime(null), '', 'fmt null');
eq(formatDate('2024-01-01T12:34:56'), '2024-01-01', 'fmtDate 截日期');
eq(formatDate(null), '', 'fmtDate null');
// 时区偏移坑：parseLocalDate 必须不漂移（new Date('yyyy-MM-dd') 在某些时区会少一天）
const jan1 = parseLocalDate('2024-01-01');
ok(jan1 && jan1.getFullYear() === 2024 && jan1.getMonth() === 0 && jan1.getDate() === 1, 'parseLocalDate 无时区偏移');
eq(weekdayCN('2024-01-01'), '周一', 'weekdayCN 2024-01-01 周一');
eq(weekdayCN(parseLocalDate('2024-01-07')), '周日', 'weekdayCN 周日');
ok(weekdayCN(null) === '', 'weekdayCN null→空');
const dt = parseLocalDateTime('2024-01-01T12:34');
ok(dt && dt.getHours() === 12 && dt.getMinutes() === 34, 'parseLocalDateTime 本地时间');
ok(parseLocalDateTime('garbage') === null, 'parseLocalDateTime 无效→null');
eq(toDateTimeLocalValue(parseLocalDate('2024-01-01')), '2024-01-01T00:00', 'toDateTimeLocalValue');

/* ---------------- 错误码 errorCode.js ---------------- */
eq(RESULT_OK, 200, 'RESULT_OK=200');
eq(resolveResult({ code: 200, data: { a: 1 } }), { type: 'ok', message: '', data: { a: 1 }, code: 200 }, 'resolveResult 200');
eq(resolveResult({ code: 401, message: 'x' }).type, 'unauthorized', 'resolveResult 401 type');
eq(resolveResult({ code: 401, message: 'x' }).message, 'x', 'resolveResult 401 用 message');
eq(resolveResult({ code: 401 }).message, '登录已过期', 'resolveResult 401 默认文案');
eq(resolveResult({ code: 403 }).message, '无权限访问该资源', 'resolveResult 403 默认文案');
eq(resolveResult({ code: 500, msg: 'boom' }).type, 'biz', 'resolveResult 其他→biz');
eq(resolveResult({ code: 500, msg: 'boom' }).message, 'boom', 'resolveResult msg 兜底');
eq(resolveResult({ code: 500 }).message, '操作失败', 'resolveResult 其他默认文案');
eq(resolveResult(null).type, 'biz', 'resolveResult null→biz');
eq(resolveRequestError({ code: 'ECONNABORTED', message: 'timeout of 1ms' }).type, 'timeout', 'req timeout');
eq(resolveRequestError({}).type, 'network', 'req 无response→network');
eq(resolveRequestError({ response: { status: 500 } }).type, 'http', 'req http');
eq(resolveRequestError({ response: { status: 500 } }).message, '服务异常（HTTP 500）', 'req http 文案带状态');
eq(errorMessage({ code: 'ECONNABORTED', message: 'timeout of 1ms' }), '请求超时，请稍后重试', 'errorMessage timeout');
eq(errorMessage({}), '网络连接失败，请检查网络', 'errorMessage network');

/* ---------------- 汇总 ---------------- */
console.log(`[shared-domain] ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
