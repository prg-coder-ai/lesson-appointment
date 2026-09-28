/**
 * 学生端「课程预订」→ 剩余员额显示口径验证（2026-09-28）
 *
 * 需求：剩余员额 <= 0 时显示「满额」，其余情况显示数字。
 *
 * 为什么不能只改一行 `.value = remainingSites`：
 *   1) `<input type="number">` 不接受非数字文本 —— 写「满额」会被浏览器**静默丢弃**，页面显示空白；
 *   2) 该字段同时是「名额是否已满」判定的回读来源（isScheduleFull 在剩余席位尚未算出时会读 DOM），
 *      把「满额」交给 Number() 得 NaN → `Number.isFinite(NaN)` 为 false → 被判成「未满」→
 *      满员时「候补预订」按钮反而不出现（等于把老缺陷换了个形态）。
 *   所以：显示文案进 value，真实数值另存 data-remaining，回读一律优先 data-remaining。
 *
 * 方案：Node vm 沙箱加载**真实** frontend/js/student-bookingCards.js（顶层即导出三个口径函数），
 * DOM 用 jsdom 真实现（dataset / classList 均为真实行为）。
 *
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_remaining_sites_display.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const SRC = path.join(FRONTEND, 'js', 'student-bookingCards.js');
const CSS = path.join(FRONTEND, 'css', 'student.css');

let pass = 0;
let fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

const code = fs.readFileSync(SRC, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');

/** 建沙箱：jsdom 真 document + 自建 window/存储，加载真实脚本 */
function loadModule() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://127.0.0.1:8080/student.html' });
  const sb = {};
  sb.window = sb;
  sb.self = sb;
  sb.globalThis = sb;
  sb.document = dom.window.document;
  sb.location = { href: 'http://127.0.0.1:8080/student.html', pathname: '/student.html', search: '', origin: 'http://127.0.0.1:8080' };
  sb.history = { replaceState() {}, pushState() {} };
  const store = new Map();
  sb.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  sb.sessionStorage = sb.localStorage;
  sb.console = { log() {}, warn() {}, error() {} };
  sb.setTimeout = setTimeout;
  sb.clearTimeout = clearTimeout;
  sb.setInterval = setInterval;
  sb.clearInterval = clearInterval;
  sb.URLSearchParams = URLSearchParams;
  sb.URL = URL;
  sb.Intl = Intl;
  sb.alert = () => {};
  sb.confirm = () => true;
  sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'js/student-bookingCards.js' });
  return { sb, dom, doc: dom.window.document };
}

const { sb, dom, doc } = loadModule();

/** 造一个带 id 的展示框（等价于页面模板里那个 input） */
function makeField() {
  const input = doc.createElement('input');
  input.type = 'text';
  input.id = 'now_availableSites';
  input.setAttribute('data-remaining', '');
  doc.body.appendChild(input);
  return input;
}

// ===========================================================================
console.log('\n=== A 显示口径：剩余 <= 0 → 满额；其余 → 数字 ===');
assert('口径函数已导出（可被测试/复用）', typeof sb.window.formatRemainingSites === 'function');
const fmt = sb.window.formatRemainingSites;
assert('剩余 5 → "5"', fmt(5) === '5', fmt(5));
assert('剩余 3 → "3"', fmt(3) === '3', fmt(3));
assert('剩余 1 → "1"', fmt(1) === '1', fmt(1));
assert('剩余 0 → "满额"', fmt(0) === '满额', fmt(0));
assert('剩余 -1 → "满额"（超卖/异常数据也按满额显示）', fmt(-1) === '满额', fmt(-1));
assert('剩余 -99 → "满额"', fmt(-99) === '满额', fmt(-99));
assert('字符串数字 "2" → "2"（接口字段类型不稳时不误判）', fmt('2') === '2', fmt('2'));
assert('未知（null）→ 空串，不显示 0', fmt(null) === '', '[' + fmt(null) + ']');
assert('未知（undefined）→ 空串', fmt(undefined) === '', '[' + fmt(undefined) + ']');
assert('未知（""）→ 空串', fmt('') === '', '[' + fmt('') + ']');
assert('非数字（"abc"/NaN）→ 空串，不显示 NaN', fmt('abc') === '' && fmt(NaN) === '', fmt('abc') + '/' + fmt(NaN));

console.log('\n=== B DOM 写入：文案 + 数值载体 + 满额样式 ===');
const apply = sb.window.applyRemainingSitesDisplay;
const f1 = makeField();
apply(f1, 3);
assert('剩余 3 → 显示 "3"', f1.value === '3', f1.value);
assert('剩余 3 → data-remaining="3"', f1.dataset.remaining === '3', f1.dataset.remaining);
assert('剩余 3 → 无满额样式', !f1.classList.contains('site-full'));

apply(f1, 0);
assert('剩余 0 → 显示 "满额"', f1.value === '满额', f1.value);
assert('剩余 0 → data-remaining 仍是数值 "0"', f1.dataset.remaining === '0', f1.dataset.remaining);
assert('剩余 0 → 带满额样式 site-full', f1.classList.contains('site-full'));

apply(f1, 2);
assert('满额后又有余位（退订/扩席位）→ 显示回数字 "2"', f1.value === '2', f1.value);
assert('满额样式被移除（不残留）', !f1.classList.contains('site-full'));
assert('data-remaining 跟着更新为 "2"', f1.dataset.remaining === '2', f1.dataset.remaining);

apply(f1, -3);
assert('剩余 -3 → 显示 "满额"', f1.value === '满额', f1.value);
assert('剩余 -3 → data-remaining="-3"（保留原值供排障）', f1.dataset.remaining === '-3', f1.dataset.remaining);

apply(f1, null);
assert('未选排期（null）→ 显示空', f1.value === '', '[' + f1.value + ']');
assert('未选排期 → data-remaining 清空', f1.dataset.remaining === '', f1.dataset.remaining);
assert('未选排期 → 满额样式清空', !f1.classList.contains('site-full'));

let threw = '';
try { apply(null, 3); } catch (e) { threw = e.message; }
assert('元素不存在时不抛异常（容器已被卸载的场景）', threw === '', threw);

console.log('\n=== C 判定回读：满额时数值不被文案污染（候补按钮不丢）===');
const read = sb.window.readRemainingSitesFromDom;
assert('回读函数已导出', typeof read === 'function');

apply(f1, 0);
const readFull = read();
assert('满额态回读拿到数值 "0"（而不是 "满额"）', readFull === '0', String(readFull));
assert('满额态 Number(回读) <= 0 → isScheduleFull 判定为满',
  Number.isFinite(Number(readFull)) && Number(readFull) <= 0, String(readFull));

apply(f1, 4);
const readOk = read();
assert('有余位回读拿到 "4"', readOk === '4', String(readOk));
assert('有余位 Number(回读) > 0 → 判定为未满', Number(readOk) > 0, String(readOk));

apply(f1, null);
assert('未知态回读为空 → isScheduleFull 按“未知即未满”处理（不误阻断预定）', read() === '', '[' + read() + ']');

// 兼容：老 DOM（没有 data-remaining）或测试里手写 value 的情况，回退读显示文案
// 注意：同 id 元素若重复挂载，getElementById 只会取第一个 —— 这里直接复用同一个字段做去属性
f1.removeAttribute('data-remaining');
f1.value = '0';
assert('无 data-remaining 时回退读 value（兼容旧 DOM / 手工置值）', read() === '0', String(read()));
f1.setAttribute('data-remaining', '');   // 复原字段形态，供后续用例继续使用

// 「满额」文案本身不能通过回读泄漏成 NaN
apply(f1, 0);
assert('回读结果永不为「满额」文案（否则 Number() 得 NaN）', read() !== '满额', String(read()));

console.log('\n=== D 源码守卫：防止今后改回 number 类型 / 只改一边 ===');
assert('模板用 text 而非 number（number 会丢弃「满额」）',
  /id="now_availableSites"[^>]*/.test(code) && /<input type="text" id="now_availableSites"/.test(code));
assert('模板带 data-remaining 载体',
  /<input type="text" id="now_availableSites"[^>]*data-remaining/.test(code));
assert('renderSchedule 走统一写入函数（不再直接 value = remainingSites）',
  /applyRemainingSitesDisplay\(now_availableSites, remainingSites\)/.test(code)
  && !/now_availableSites\.value\s*=\s*remainingSites/.test(code));
assert('isScheduleFull 回读走统一函数（不再直接读 .value）',
  /readRemainingSitesFromDom\(\)/.test(code));
assert('重置排期信息时同步复位数值载体与满额样式',
  /applyRemainingSitesDisplay\(document\.getElementById\('now_availableSites'\), null\)/.test(code));
assert('样式表有满额提示色 .readonly.site-full', /\.readonly\.site-full\s*\{/.test(css));

// 负向守卫：满额文案只应有一处定义，避免散落的硬编码漂移
const fullTextHits = (code.match(/'满额'/g) || []).length;
assert('「满额」文案集中定义（源码中字面量不超过 2 处）', fullTextHits <= 2, '字面量=' + fullTextHits);

console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
process.exit(fail ? 1 : 0);
