// 浏览器模拟冒烟：在 node 里伪造 window 全局，加载生成的经典脚本桥接，断言 7 个域对象齐全且函数可用。
global.window = {};
require('../frontend/js/shared-domain-bridge.js');
const w = global.window;
const assert = require('assert');

assert.strictEqual(typeof w.TermDomain, 'object', 'TermDomain missing');
assert.strictEqual(typeof w.RefundRuleDomain, 'object', 'RefundRuleDomain missing');
assert.strictEqual(typeof w.BookingStateDomain, 'object', 'BookingStateDomain missing');
assert.strictEqual(typeof w.AppointmentStateDomain, 'object', 'AppointmentStateDomain missing');
assert.strictEqual(typeof w.MaskDomain, 'object', 'MaskDomain missing');
assert.strictEqual(typeof w.DatetimeDomain, 'object', 'DatetimeDomain missing');
assert.strictEqual(typeof w.ErrorCodeDomain, 'object', 'ErrorCodeDomain missing');

// ---- 适配层（net/storage/ui/router）----
assert.strictEqual(typeof w.NetAdapter, 'object', 'NetAdapter missing');
assert.strictEqual(typeof w.StorageAdapter, 'object', 'StorageAdapter missing');
assert.strictEqual(typeof w.UiAdapter, 'object', 'UiAdapter missing');
assert.strictEqual(typeof w.RouterAdapter, 'object', 'RouterAdapter missing');
assert.strictEqual(typeof w.NetAdapter.transport, 'function', 'NetAdapter.transport missing');
assert.strictEqual(typeof w.StorageAdapter.storage, 'object', 'StorageAdapter.storage missing');
assert.strictEqual(typeof w.UiAdapter.alert, 'function', 'UiAdapter.alert missing');
assert.strictEqual(typeof w.UiAdapter.confirm, 'function', 'UiAdapter.confirm missing');
assert.strictEqual(typeof w.RouterAdapter.to, 'function', 'RouterAdapter.to missing');
assert.strictEqual(typeof w.RouterAdapter.openUrl, 'function', 'RouterAdapter.openUrl missing');
assert.strictEqual(typeof w.RouterAdapter.parseQuery, 'function', 'RouterAdapter.parseQuery missing');
// router.parseQuery 纯函数可独立验证（不依赖运行时平台）
assert.deepStrictEqual(w.RouterAdapter.parseQuery('?a=1&b=2'), { a: '1', b: '2' });

assert.strictEqual(w.MaskDomain.maskPhone('13812345678'), '138****5678');
assert.strictEqual(w.MaskDomain.maskEmail('zhangsan@example.com'), 'zh****an@example.com');
assert.strictEqual(w.BookingStateDomain.bookingStatusText('booking'), '待确认');
assert.strictEqual(w.BookingStateDomain.bookingStatusText('canceling'), '取消待确认');
assert.strictEqual(w.AppointmentStateDomain.appointmentStatusText('active'), '生效');
assert.strictEqual(w.DatetimeDomain.formatDateTime('2026-09-29T13:00:00'), '2026-09-29 13:00:00');
assert.strictEqual(w.DatetimeDomain.formatDateTime('2026-09-29T13:00', false), '2026-09-29 13:00');
assert.strictEqual(w.ErrorCodeDomain.resolveResult({ code: 401, message: '' }).message, '登录已过期');
assert.strictEqual(w.ErrorCodeDomain.resolveResult({ code: 403 }).message, '无权限访问该资源');
assert.strictEqual(w.ErrorCodeDomain.resolveRequestError({ code: 'ECONNABORTED', message: 'timeout of 1ms' }).message, '请求超时，请稍后重试');
assert.strictEqual(w.ErrorCodeDomain.resolveRequestError({ response: { status: 500 } }).message, '服务异常（HTTP 500）');

console.log('[bridge-smoke] ALL ASSERTIONS PASSED');
