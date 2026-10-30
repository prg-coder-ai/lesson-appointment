// tests/domain/refundRule.test.mjs
// 退改规则领域层零 DOM 单测。直接 node 运行：node tests/domain/refundRule.test.mjs
// 验证：纯逻辑正确性 + 运行时无任何 document/window/fetch 引用（即零 DOM 依赖，可被小程序 import）。
import assert from 'node:assert';
import * as R from '../../shared/domain/refundRule.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }
function eq(name, a, b) { try { assert.strictEqual(a, b); pass++; } catch (e) { fail++; console.error('  ✗ ' + name + ' -> 期望 ' + JSON.stringify(b) + ' 实得 ' + JSON.stringify(a)); } }
function deep(name, a, b) { try { assert.deepStrictEqual(a, b); pass++; } catch (e) { fail++; console.error('  ✗ ' + name + ' -> 期望 ' + JSON.stringify(b) + ' 实得 ' + JSON.stringify(a)); } }

console.log('== 退改规则领域层 ==');

// --- 零 DOM 守卫 ---
ok('运行时无 document', typeof document === 'undefined');
ok('运行时无 window', typeof window === 'undefined');

// --- formatRefundMinutes ---
eq('format 390', R.formatRefundMinutes(390), '6 小时 30 分钟');
eq('format 1440', R.formatRefundMinutes(1440), '1 天');
eq('format 1500', R.formatRefundMinutes(1500), '1 天 1 小时');
eq('format 0', R.formatRefundMinutes(0), '0 分钟');
eq('format null', R.formatRefundMinutes(null), '-');
eq('format NaN', R.formatRefundMinutes(NaN), '-');

// --- refundRuleToMinutes ---
eq('toMin 2h', R.refundRuleToMinutes(2, 'hour'), 120);
eq('toMin 90m', R.refundRuleToMinutes(90, 'minute'), 90);
ok('toMin 负数NaN', Number.isNaN(R.refundRuleToMinutes(-1, 'hour')));
ok('toMin 非数NaN', Number.isNaN(R.refundRuleToMinutes('x', 'hour')));

// --- refundRuleFromMinutes ---
deep('fromMin 120h', R.refundRuleFromMinutes(120, 'hour'), { value: 2, unit: 'hour' });
deep('fromMin 90h->minute', R.refundRuleFromMinutes(90, 'hour'), { value: 90, unit: 'minute' });
deep('fromMin 90m', R.refundRuleFromMinutes(90, 'minute'), { value: 90, unit: 'minute' });

// --- refundRuleZoneText ---
ok('zoneText 正常含免责/不退费', R.refundRuleZoneText(1440, 720, 50).includes('免责（退 100%）') && R.refundRuleZoneText(1440, 720, 50).includes('不退费（退 0%）'));
ok('zoneText 顺序错误告警', R.refundRuleZoneText(720, 1440, 50).includes('免责时间点必须 ≥ 部分退费时间点'));
ok('zoneText 缺值', R.refundRuleZoneText(NaN, NaN, 50).includes('请先填写两个时间点'));

// --- validateRefundRule ---
eq('validate 合法', R.validateRefundRule(1440, 720, 50), null);
ok('validate 顺序错', typeof R.validateRefundRule(720, 1440, 50) === 'string');
ok('validate percent>99', typeof R.validateRefundRule(1440, 720, 100) === 'string');
ok('validate percent<1', typeof R.validateRefundRule(1440, 720, 0) === 'string');
ok('validate 缺免责', typeof R.validateRefundRule(NaN, 720, 50) === 'string');

// --- resolveEffectiveRule（课程 > 租户默认 > 内置兜底）---
const courseRule = { id: 5, courseId: 'c1', freeBeforeMinutes: 2880, partialBeforeMinutes: 1440, partialRefundPercent: 70 };
const tenantRule = { id: 1, courseId: '', freeBeforeMinutes: 1440, partialBeforeMinutes: 720, partialRefundPercent: 50 };
deep('生效 课程优先', R.resolveEffectiveRule(courseRule, tenantRule).id, 5);
deep('生效 无课程取租户', R.resolveEffectiveRule(null, tenantRule).id, 1);
eq('生效 全空取内置', R.resolveEffectiveRule(null, null).freeBeforeMinutes, R.REFUND_BUILT_IN_FALLBACK.freeBeforeMinutes);
eq('生效 内置部分比例', R.resolveEffectiveRule(null, null).partialRefundPercent, 50);

// --- evaluateRefund（核心三档判定）---
const rule = { freeBeforeMinutes: 1440, partialBeforeMinutes: 720, partialRefundPercent: 50 };
const now = new Date('2026-10-01T00:00:00');
const ev = (appt) => R.evaluateRefund(rule, appt, now);
deep('判定 9天前=免责', ev('2026-10-10T00:00:00'), { aheadMinutes: 12960, level: 'free', percent: 100, levelText: '免责', aheadText: R.formatRefundMinutes(12960) });
deep('判定 1.5天前=免责', ev('2026-10-02T12:00:00'), { aheadMinutes: 2160, level: 'free', percent: 100, levelText: '免责', aheadText: R.formatRefundMinutes(2160) });
deep('判定 18h前=部分', ev('2026-10-01T18:00:00'), { aheadMinutes: 1080, level: 'partial', percent: 50, levelText: '部分退费', aheadText: R.formatRefundMinutes(1080) });
deep('判定 6h前=不退费', ev('2026-10-01T06:00:00'), { aheadMinutes: 360, level: 'none', percent: 0, levelText: '不退费', aheadText: R.formatRefundMinutes(360) });
deep('判定 过去=已过期', ev('2026-09-30T00:00:00'), { aheadMinutes: -1440, level: 'past', percent: 0, levelText: '已过期', aheadText: '已过期' });
// 兼容空格分隔时间串（后端部分接口格式）
deep('判定 空格串兼容', ev('2026-10-02 12:00:00'), { aheadMinutes: 2160, level: 'free', percent: 100, levelText: '免责', aheadText: R.formatRefundMinutes(2160) });

console.log(`退改规则: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
