// 时区 / 日历装配：日期时间格式化与解析（零 DOM、零小程序 API，纯函数）
// 抽自 Web 端多处散落实现：
//   - frontend/js/public/auditLog.js:144 formatTime       → String(t).replace('T',' ').substring(0,19)
//   - frontend/js/public/appointmentNotes.js:726 / messages-inbox.js:322 / datamaintain_delete.js / platform-admin-tenant.js
//     各处 String(x).replace('T',' ').slice(0,16) 的重复写法
//   - frontend/js/admin-notify-rule.js:95 notifyFmtDateTime / :101 notifyParseLocal（本地时间解析）
//   - frontend/js/public/courseAndBooking.js:753/1052 记载的时区坑：new Date('yyyy-MM-dd') 因时区偏移会少一天
//   - miniprogram/package-student/appointment/appointment.js:8 fmtTime → replace('T',' ').slice(0,16)
// 统一为本模块后，两端共用同一套时区安全逻辑，消除漂移。
// Node 下可直接 import 做单测。

const PAD = (n) => (n < 10 ? '0' + n : '' + n);

/** 格式化日期时间为 'yyyy-MM-dd HH:mm[:ss]'。
 *  iso 可为 'yyyy-MM-ddTHH:mm:ss' / 'yyyy-MM-dd HH:mm:ss' / yyyy-MM-ddTHH:mm 等。
 *  withSeconds=false 时截到分钟（yyyy-MM-dd HH:mm）。 */
export function formatDateTime(iso, withSeconds = true) {
  if (iso == null) return '';
  const s = String(iso).replace('T', ' ');
  if (!s) return '';
  return withSeconds ? s.substring(0, 19) : s.substring(0, 16);
}

/** 截取日期部分 'yyyy-MM-dd'（无效返回 ''）。 */
export function formatDate(iso) {
  if (iso == null) return '';
  const s = String(iso);
  return /^\d{4}-\d{1,2}-\d{1,2}/.test(s) ? s.substring(0, 10) : '';
}

/** 解析 'yyyy-MM-dd' 为本地 Date，**规避 new Date('yyyy-MM-dd') 的 UTC/时区偏移**（用年/月/日构造）。无效返回 null。 */
export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** 解析 'yyyy-MM-ddTHH:mm' / 'yyyy-MM-dd HH:mm' 为本地时间 Date（无效返回 null）。
 *  用于把表单/接口字符串还原成 Date 做比较。 */
export function parseLocalDateTime(text) {
  if (!text) return null;
  const d = new Date(String(text).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** 取中文星期（周一…周日）。
 *  input 可为 Date 或 'yyyy-MM-dd' 字符串（字符串走 parseLocalDate 规避时区偏移）。无有效值返回 ''。 */
export function weekdayCN(input) {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? '' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][input.getDay()];
  }
  const d = parseLocalDate(input);
  return d ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] : '';
}

/** Date → 'yyyy-MM-ddTHH:mm'（供 <input type="datetime-local"> 回填）。无效返回 ''。 */
export function toDateTimeLocalValue(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.getFullYear() + '-' + PAD(date.getMonth() + 1) + '-' + PAD(date.getDate()) +
    'T' + PAD(date.getHours()) + ':' + PAD(date.getMinutes());
}
