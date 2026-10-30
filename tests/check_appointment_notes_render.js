/**
 * 今日课程（refreshAppointmentNotes）template+clone 改造验证（2026-09-28）
 *
 * 断言「真实模板被克隆 + applyTerms 已跑 + 分页骨架已填 + 事件已绑 + noted 动态文案已注入」。
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_appointment_notes_render.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const SRC = path.join(FRONTEND, 'js', 'admin-AppointmentNotes.js');
const HTML = path.join(FRONTEND, 'student.html'); // 三页同源，抽 student.html 的真实模板即可
const code = fs.readFileSync(SRC, 'utf8');

function extractTpl(id) {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(new RegExp('<template id="' + id + '">[\\s\\S]*?</template>'));
  if (!m) throw new Error('在 student.html 中找不到 #' + id + ' 模板');
  return m[0];
}
const DOM_HTML = '<!DOCTYPE html><html><body><div id="dynamic-content-center"></div>'
  + extractTpl('tpl-appointment-notes') + '</body></html>';

let pass = 0, fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

async function makeSandbox() {
  const dom = new JSDOM(DOM_HTML, { url: 'http://127.0.0.1:8080/student.html' });
  const doc = dom.window.document;
  const calls = { loadShow: 0, waitlist: 0, search: 0, reset: 0, applyTerms: 0 };
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
  // 依赖垫片（真实实现在其它 js / 远端，本用例只校验渲染与绑定）
  sb.loadNotifyStageLabels = async () => {};
  sb.notifyStageLabel = (n) => '档位' + n;
  sb.assignLoadobjectListFunction = () => {};
  sb.getPagebar = () => '<div class="pb-stub">PG</div>';
  sb.applyTerms = (el) => { calls.applyTerms++; el.__applyTerms = true; };
  sb.loadAndShowAppointmentPage = () => { calls.loadShow++; };
  sb.renderWaitlistBanner = () => { calls.waitlist++; };
  sb.localsearchAppoint = () => { calls.search++; };
  sb.resetFilterAppoint = () => { calls.reset++; };
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'js/admin-AppointmentNotes.js' });
  // 这些函数由 admin-AppointmentNotes.js 自身声明（会覆盖上面的 stub），脚本加载后再覆盖回 spy 以便断言
  sb.loadAndShowAppointmentPage = () => { calls.loadShow++; };
  sb.localsearchAppoint = () => { calls.search++; };
  sb.resetFilterAppoint = () => { calls.reset++; };
  await sb.window.refreshAppointmentNotes();
  return { sb, doc, calls, id: doc.getElementById.bind(doc) };
}

(async function main() {
  const env = await makeSandbox();

  console.log('\n=== 结构克隆 ===');
  assert('tbody#days-appointment-admin 已克隆进 DOM', !!env.id('days-appointment-admin'));
  assert('状态下拉#appoint-status-select 已克隆', !!env.id('appoint-status-select'));
  assert('候补提示条#waitlist-banner 已克隆', !!env.id('waitlist-banner'));
  assert('分页落点#appoint-pagebar 已克隆', !!env.id('appoint-pagebar'));

  console.log('\n=== applyTerms / 分页 / 后续渲染 ===');
  assert('applyTerms 已对克隆内容执行一次', env.id('dynamic-content-center').__applyTerms === true);
  assert('分页骨架已由 getPagebar 填充', /PG/.test(env.id('appoint-pagebar').innerHTML), env.id('appoint-pagebar').innerHTML);
  assert('loadAndShowAppointmentPage 被调用（渲染数据）', env.calls.loadShow === 1, env.calls.loadShow);
  assert('renderWaitlistBanner 被调用（候补提示条）', env.calls.waitlist === 1, env.calls.waitlist);

  console.log('\n=== noted1/noted2 动态文案（clone 后注入）===');
  const noted1 = env.doc.querySelector('#appoint-status-select option[value="noted1"]');
  const noted2 = env.doc.querySelector('#appoint-status-select option[value="noted2"]');
  assert('noted1 文案含 notifyStageLabel(1)', noted1 && /档位1/.test(noted1.textContent), noted1 && noted1.textContent);
  assert('noted1 文案含「（历史）」后缀', noted1 && /（历史）/.test(noted1.textContent));
  assert('noted2 文案含 notifyStageLabel(2)', noted2 && /档位2/.test(noted2.textContent), noted2 && noted2.textContent);

  console.log('\n=== 事件绑定 ===');
  env.id('btn-search-appoint').dispatchEvent(new env.sb.window.Event('click'));
  env.id('btn-reset-appoint').dispatchEvent(new env.sb.window.Event('click'));
  assert('搜索按钮 click → localsearchAppoint', env.calls.search === 1, env.calls.search);
  assert('重置按钮 click → resetFilterAppoint', env.calls.reset === 1, env.calls.reset);

  console.log('\n=== 单次绑定守卫（重复渲染不重复挂监听）===');
  await env.sb.window.refreshAppointmentNotes(); // 第二次渲染
  env.id('btn-search-appoint').dispatchEvent(new env.sb.window.Event('click'));
  // 第二次渲染不应再 add 一个监听：本次 click 只 +1（而非 +2）
  assert('二次渲染后点击仍只触发一次（无重复监听）', env.calls.search === 2, env.calls.search);

  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  if (fail) process.exit(1);
})().catch(e => { console.error('测试异常终止:', e); process.exit(1); });
