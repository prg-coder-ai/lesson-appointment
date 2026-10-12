/**
 * 我的预定（renderStudentBookingBrowserCards）template+clone 改造验证（2026-09-28）
 *
 * 断言「真实模板被克隆 + applyTerms 已跑 + 分页骨架已填 + 事件已绑（搜索/重置/结果 tab）」。
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_student_booking_browser_render.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const SRC = path.join(FRONTEND, 'js', 'student-bookingBrowserCards.js');
const HTML = path.join(FRONTEND, 'student.html');
const code = fs.readFileSync(SRC, 'utf8');

function extractTpl(id) {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(new RegExp('<template id="' + id + '">[\\s\\S]*?</template>'));
  if (!m) throw new Error('在 student.html 中找不到 #' + id + ' 模板');
  return m[0];
}
const DOM_HTML = '<!DOCTYPE html><html><body><div id="dynamic-content-center"></div>'
  + extractTpl('tpl-student-booking-browser') + '</body></html>';

let pass = 0, fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

async function makeSandbox() {
  const dom = new JSDOM(DOM_HTML, { url: 'http://127.0.0.1:8080/student.html' });
  const doc = dom.window.document;
  const calls = { load: 0, search: 0, reset: 0, tab: [], applyTerms: 0 };
  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.document = doc;
  doc.write = function () {}; doc.open = function () { return doc; }; doc.close = function () {};
  sb.location = { href: 'http://127.0.0.1:8080/student.html', pathname: '/student.html', search: '', origin: 'http://127.0.0.1:8080' };
  sb.history = { replaceState() {}, pushState() {} };
  const store = new Map();
  sb.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
  sb.sessionStorage = sb.localStorage;
  sb.console = { log() {}, warn() {}, error() {}, info() {} };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout; sb.setInterval = setInterval; sb.clearInterval = clearInterval;
  sb.URL = URL; sb.URLSearchParams = URLSearchParams; sb.Intl = Intl; sb.alert = () => {}; sb.confirm = () => true;
  sb.Event = dom.window.Event; sb.MouseEvent = dom.window.MouseEvent; // 供 dispatchEvent 用
  sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
  // 依赖垫片
  sb.getAppointmentsByBookingId = () => []; // 定义在 dataFunction.js，本用例不加载
  sb.assignLoadobjectListFunction = () => {};
  sb.getPagebar = () => '<div class="pb-stub">PG</div>';
  sb.applyTerms = (el) => { calls.applyTerms++; el.__applyTerms = true; };
  sb.loadAndRenderBooking_student = () => { calls.load++; };
  sb.localsearchAppoint_student = () => { calls.search++; };
  sb.resetFilterAppoint_student = () => { calls.reset++; };
  sb.switchResultTab = (tab) => { calls.tab.push(tab); };
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'js/student-bookingBrowserCards.js' });
  // 这些函数由 student-bookingBrowserCards.js 自身声明（会覆盖上面的 stub），脚本加载后再覆盖回 spy 以便断言
  sb.loadAndRenderBooking_student = () => { calls.load++; };
  sb.localsearchAppoint_student = () => { calls.search++; };
  sb.resetFilterAppoint_student = () => { calls.reset++; };
  sb.switchResultTab = (tab) => { calls.tab.push(tab); };
  await sb.window.renderStudentBookingBrowserCards();
  return { sb, doc, calls, id: doc.getElementById.bind(doc) };
}

(async function main() {
  const env = await makeSandbox();

  console.log('\n=== 结构克隆 ===');
  assert('结果容器#my-bookings 已克隆', !!env.id('my-bookings'));
  assert('状态下拉#booking-status-select 已克隆', !!env.id('booking-status-select'));
  assert('课次表#resultBody 已克隆', !!env.id('resultBody'));
  assert('列表面板#resultPanelList 已克隆', !!env.id('resultPanelList'));
  assert('日历面板#resultPanelCalendar 已克隆', !!env.id('resultPanelCalendar'));
  assert('日历#calendar 已克隆', !!env.id('calendar'));
  assert('分页落点#browser-pagebar 已克隆', !!env.id('browser-pagebar'));

  console.log('\n=== applyTerms / 分页 / 后续渲染 ===');
  assert('applyTerms 已对克隆内容执行一次', env.id('dynamic-content-center').__applyTerms === true);
  assert('分页骨架已由 getPagebar 填充', /PG/.test(env.id('browser-pagebar').innerHTML), env.id('browser-pagebar').innerHTML);
  assert('loadAndRenderBooking_student 被调用（渲染列表）', env.calls.load === 1, env.calls.load);

  console.log('\n=== 事件绑定 ===');
  env.id('btn-search-booking').dispatchEvent(new env.sb.window.Event('click'));
  env.id('btn-reset-booking').dispatchEvent(new env.sb.window.Event('click'));
  assert('搜索按钮 click → localsearchAppoint_student', env.calls.search === 1, env.calls.search);
  assert('重置按钮 click → resetFilterAppoint_student', env.calls.reset === 1, env.calls.reset);
  const calTab = env.doc.querySelector('.result-tab[data-tab="calendar"]');
  calTab.dispatchEvent(new env.sb.window.Event('click'));
  assert('日历 tab click → switchResultTab("calendar")', calls_arr_includes(env.calls.tab, 'calendar'), JSON.stringify(env.calls.tab));

  console.log('\n=== 单次绑定守卫（重复渲染不重复挂监听）===');
  await env.sb.window.renderStudentBookingBrowserCards(); // 第二次渲染
  env.id('btn-search-booking').dispatchEvent(new env.sb.window.Event('click'));
  assert('二次渲染后点击仍只触发一次（无重复监听）', env.calls.search === 2, env.calls.search);

  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  if (fail) process.exit(1);
})().catch(e => { console.error('测试异常终止:', e); process.exit(1); });

function calls_arr_includes(arr, v) { return arr.indexOf(v) >= 0; }
