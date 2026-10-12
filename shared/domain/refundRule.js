// shared/domain/refundRule.js
// 跨端共享「退改规则」领域层（纯逻辑，零 DOM / 零运行时 API 依赖）。
//
// 这是 P1（Headless 领域层下沉）的一部分：把原本混在 frontend/js/admin-refund-rule.js
// 里的分钟换算、三档判定、区间文案、规则校验、生效规则解析抽出来，让 Web 与小程
// 序共用同一份算法，UI 各自渲染。
//
// 生效顺序（业务语义）：课程专属规则 ＞ 租户默认规则 ＞ 系统内置兜底。
// 只有两个时间阈值，不退费区由「不足部分退费线」推导：
//   提前 ≥ 免责线              → 免责（退 100%）
//   部分退费线 ≤ 提前 < 免责线 → 部分退费（退 partialRefundPercent%）
//   提前 < 部分退费线          → 不退费（退 0%）
//
// 消费方式：
//   - 小程序端：import { evaluateRefund } from '../../shared/domain/refundRule.js'
//   - Web 端：经 P0 构建桥接挂到 window.RefundRuleDomain（见 PRD）
//   - Node 端：直接 require/import 做单测（本文件无任何 document/window/fetch 引用）

/* -------------------------------------------------- 内置兜底常量 */

// 系统内置默认：提前 24 小时免责 / 提前 12 小时退 50%
export const REFUND_BUILT_IN_FALLBACK = Object.freeze({
  freeBeforeMinutes: 24 * 60,
  partialBeforeMinutes: 12 * 60,
  partialRefundPercent: 50,
  enabled: 1
});

/* -------------------------------------------------- 分钟 ↔ 粒度换算 */

/** 分钟数转可读文案：390 → "6 小时 30 分钟"；1440 → "24 小时"；1500 → "1 天 1 小时" */
export function formatRefundMinutes(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '-';
  const m = Number(minutes);
  if (isNaN(m)) return '-';
  if (m <= 0) return '0 分钟';
  const days = Math.floor(m / 1440);
  const rest = m % 1440;
  const hours = Math.floor(rest / 60);
  const mins = rest % 60;
  const parts = [];
  if (days > 0) parts.push(days + ' 天');
  if (hours > 0) parts.push(hours + ' 小时');
  if (mins > 0) parts.push(mins + ' 分钟');
  return parts.length ? parts.join(' ') : '0 分钟';
}

/** 按粒度把界面上的数值换算成分钟（hour→×60，minute→本身） */
export function refundRuleToMinutes(value, unit) {
  const v = Number(value);
  if (isNaN(v) || v < 0) return NaN;
  return unit === 'minute' ? Math.round(v) : Math.round(v * 60);
}

/**
 * 分钟数回显成「数值 + 粒度」。
 * 优先沿用库里存的粒度；若按该粒度不能整除（如 90 分钟按小时就是 1.5），
 * 则退化为分钟显示，避免界面上出现 1.5 小时这种别扭的中间值。
 */
export function refundRuleFromMinutes(minutes, unit) {
  const m = Number(minutes);
  if (isNaN(m) || m < 0) return { value: '', unit: unit || 'hour' };
  if (unit === 'minute') return { value: m, unit: 'minute' };
  if (m % 60 === 0) return { value: m / 60, unit: 'hour' };
  return { value: m, unit: 'minute' };
}

/* -------------------------------------------------- 三档区间文案 / 校验 */

/** 三档区间说明（纯前端拼，用于表单实时预览） */
export function refundRuleZoneText(freeMinutes, partialMinutes, percent) {
  if (isNaN(freeMinutes) || isNaN(partialMinutes)) return '请先填写两个时间点';
  if (freeMinutes < partialMinutes) return '⚠ 免责时间点必须 ≥ 部分退费时间点';
  return '提前 ≥ ' + formatRefundMinutes(freeMinutes) + ' 免责（退 100%）　｜　'
    + formatRefundMinutes(partialMinutes) + ' ≤ 提前 < ' + formatRefundMinutes(freeMinutes)
    + ' 部分退费（退 ' + (percent === '' || isNaN(percent) ? '-' : percent) + '%）　｜　'
    + '提前 < ' + formatRefundMinutes(partialMinutes) + ' 不退费（退 0%）';
}

/**
 * 规则校验：返回 null 表示合法，否则返回错误文案（与 admin-refund-rule.js collectRefundRuleForm 的前端预校验保持一致）。
 * @param {number} freeMinutes       免责时间点（分钟）
 * @param {number} partialMinutes    部分退费时间点（分钟）
 * @param {number} percent           部分退费比例（%）
 */
export function validateRefundRule(freeMinutes, partialMinutes, percent) {
  if (isNaN(freeMinutes) || freeMinutes === '') return '请填写免责时间点';
  if (isNaN(partialMinutes) || partialMinutes === '') return '请填写部分退费时间点';
  if (freeMinutes < partialMinutes) return '免责时间点必须大于或等于部分退费时间点';
  if (isNaN(percent) || percent < 1 || percent > 99) return '部分退费比例需在 1~99 之间';
  return null;
}

/* -------------------------------------------------- 生效规则解析 */

/**
 * 生效顺序解析：课程专属规则 ＞ 租户默认规则 ＞ 系统内置兜底。
 * 约定：有 id（非 null/undefined）视为「已保存的规则」；id 缺失视为「虚拟兜底项」不生效。
 * @param {Object|null} courseRule         课程专属规则（courseId 非空）
 * @param {Object|null} tenantDefaultRule  租户默认规则（courseId 为空串）
 * @returns {Object} 实际生效的规则对象
 */
export function resolveEffectiveRule(courseRule, tenantDefaultRule) {
  if (courseRule && courseRule.id != null) return courseRule;
  if (tenantDefaultRule && tenantDefaultRule.id != null) return tenantDefaultRule;
  return REFUND_BUILT_IN_FALLBACK;
}

/* -------------------------------------------------- 核心：三档判定 */

/**
 * 计算某课次在给定时刻的退改档位（纯函数，零 DOM）。
 * 时间基准 = 课次的上课时间（appointmentTime）与操作时刻（now）的差值（提前多久）。
 *
 * @param {Object} rule 规则对象 { freeBeforeMinutes, partialBeforeMinutes, partialRefundPercent }
 * @param {Date|string|number} appointmentTime 课次上课时间（Date / ISO 字符串 / 时间戳）
 * @param {Date|string|number} [now]            操作时刻（默认 new Date()）
 * @returns {{ aheadMinutes:number, level:string, percent:number, levelText:string, aheadText:string }}
 *          level: 'free' 免责 | 'partial' 部分退费 | 'none' 不退费 | 'past' 已过期
 */
export function evaluateRefund(rule, appointmentTime, now) {
  const appt = toDate(appointmentTime);
  const t = now == null ? new Date() : toDate(now);
  const aheadMinutes = Math.floor((appt.getTime() - t.getTime()) / 60000);

  let level, percent, levelText;
  if (aheadMinutes < 0) {
    level = 'past'; percent = 0; levelText = '已过期';
  } else if (aheadMinutes >= Number(rule.freeBeforeMinutes)) {
    level = 'free'; percent = 100; levelText = '免责';
  } else if (aheadMinutes >= Number(rule.partialBeforeMinutes)) {
    level = 'partial'; percent = Number(rule.partialRefundPercent); levelText = '部分退费';
  } else {
    level = 'none'; percent = 0; levelText = '不退费';
  }

  return {
    aheadMinutes,
    level,
    percent,
    levelText,
    aheadText: aheadMinutes < 0 ? '已过期' : formatRefundMinutes(aheadMinutes)
  };
}

/* -------------------------------------------------- 内部工具 */

function toDate(x) {
  if (x instanceof Date) return x;
  if (typeof x === 'number') return new Date(x);
  if (typeof x === 'string') {
    // 兼容 "2026-10-01 10:00"（后端部分接口用空格分隔）与标准 ISO "2026-10-01T10:00"
    const s = x.includes('T') || x.includes('Z') || x.includes('+') ? x : x.replace(' ', 'T');
    return new Date(s);
  }
  return new Date(x);
}
