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

// ============================================================
// 课次时间 UTC 化（2026-10-08，见 doc-develop/课次时间UTC化改造方案.md）
//
// 口径：后端 appointment 起一律返回 UTC。页面要显示"人能对上的墙上时间"，
// 由前端按用户浏览器时区渲染。后端也可按 userTimeZone 直接转好，
// 两者都支持，本模块负责后者缺失时的前端兜底。
//
// ⚠️ 转换必须用 Intl.DateTimeFormat，不能手算偏移量：
//    手算在夏令时切换日会错 1 小时（America/Edmonton 每年 3 月、11 月各切一次）。
// ============================================================

/** 取用户浏览器时区 ID，如 'Asia/Shanghai'；不可用时返回 'UTC'。 */
export function nowUserTz() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (tz && String(tz).trim()) ? tz : 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

/**
 * 校验时区串是否为可用的 IANA ID。
 *
 * ⚠️ 为什么必须显式校验而不能靠 Intl 抛错：**Intl 认得三字母缩写**。
 *    实测 'CST' 不抛错，而是静默解析成 UTC-6（美洲中部），于是用户看到的
 *    时间平白差 14 小时，且没有任何报错 —— 这比抛错危险得多。
 *    'GMT+8' 这类反而不被支持会抛错。两者行为不一致，只能自己把关。
 *
 * 判据：ZoneId.of() 接受的形式是 `区域/城市`（含斜杠）或 'UTC'。
 */
function isValidZone(tz) {
  if (!tz || !String(tz).trim()) return false;
  const s = String(tz).trim();
  if (s === 'UTC' || s === 'GMT') return true;
  // 必须是 Region/City 形态，且两段都不能为空
  return /^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+-]+$/.test(s);
}

/**
 * 把 UTC 时间串转成指定时区的显示串。
 * @param iso      'yyyy-MM-ddTHH:mm:ss' / 'yyyy-MM-dd HH:mm:ss'（**按 UTC 解读**）
 * @param timeZone 目标时区，省略则用用户浏览器时区
 * @param withSeconds 是否带秒，默认不带（列表页够用）
 * @returns 'yyyy-MM-dd HH:mm[:ss]'；无法解析返回 ''
 *
 * 用法约定：**不要**对已是本地时间的串调用本函数（会二次偏移）。
 * 判断依据：后端明确说"这是 UTC"时才转。
 */
export function utcToZoned(iso, timeZone, withSeconds = false) {
  if (iso == null || iso === '') return '';
  const s = String(iso).trim();
  if (!s) return '';

  // 关键：裸串必须补 Z，否则 new Date() 会按浏览器本地时区解读，偏移一次。
  // 已带时区信息（Z 或 ±HH:mm）的原样使用。
  let normalized = s.replace(' ', 'T');
  if (!/([Zz]|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }

  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '';

  const tz = (timeZone && isValidZone(timeZone)) ? String(timeZone).trim() : nowUserTz();
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false
    }).formatToParts(date);

    const get = (type) => {
      const hit = parts.find(p => p.type === type);
      return hit ? hit.value : '';
    };
    // Intl 在 hour12:false 下可能给 "24:00"（午夜），归一到 "00:00"
    const hour = get('hour') === '24' ? '00' : get('hour');

    const datePart = get('year') + '-' + get('month') + '-' + get('day');
    const timePart = hour + ':' + get('minute') + (withSeconds ? ':' + get('second') : '');
    return datePart + ' ' + timePart;
  } catch (e) {
    // 时区串非法（如 'CST'）：退回 UTC 展示而不是抛错，页面不至于整块崩
    return utcToZoned(iso, 'UTC', withSeconds);
  }
}

/** utcToZoned + 中文星期，如 '2026-09-07 09:00 周一'。 */
export function utcToZonedWithWeekday(iso, timeZone) {
  const base = utcToZoned(iso, timeZone, false);
  if (!base) return '';
  const d = parseLocalDate(base.substring(0, 10));
  const wd = d ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] : '';
  return wd ? base + ' ' + wd : base;
}
