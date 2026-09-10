/**
 * tCode（租户编码）在跳转链路上的保持情况 —— 集成检查
 *
 * 目标：URL 携带 ?tCode=xxx 时，注册、登录、路由、登出、401 兜底等所有跳转都必须继续带上它，
 *      否则目标页会因「URL tCode 与本地登录 tenantCode 不一致」被入口守卫踢回登录页（跳转死循环）。
 *
 * 方法：用 Node vm 加载**真实源码**（不是复制粘贴的片段），配模拟浏览器环境，真实执行跳转函数，
 *      捕获 location.href 的赋值结果做断言。
 *
 * 运行： node doc-develop/itest_tcode_propagation.js
 * 前置： 无（纯本地 JS 执行，不需要起后端）
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const SRC = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend';
const TCODE = 'TNT-8848';
const TCODE_ENC = encodeURIComponent(TCODE);
const API_JS = SRC + '/js/public/api.js';
const AUTH_JS = SRC + '/js/public/auth.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else {
    fail++; failures.push(name + (extra ? ' | ' + extra : ''));
    console.log('  FAIL  ' + name + (extra ? '\n        -> ' + extra : ''));
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ==================== 模拟浏览器环境 ==================== */
function makeSandbox({ search = '?tCode=' + TCODE_ENC, pathname = '/admin.html', store = {} } = {}) {
  const nav = [];
  const alerts = [];
  const location = {
    search, pathname,
    origin: 'http://localhost:8080', hostname: 'localhost', host: 'localhost:8080',
    _href: 'http://localhost:8080' + pathname + search,
    get href() { return this._href; },
    set href(v) { this._href = v; nav.push(v); },
    assign(v) { this._href = v; nav.push(v); },
    replace(v) { this._href = v; nav.push(v); },
    reload() {},
  };
  const localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
  };
  const mkEl = () => ({
    id: '', value: '', textContent: '', innerHTML: '', readOnly: false, style: {}, dataset: {}, options: [],
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; },
    closest() { return mkEl(); }, querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, click() {}, remove() {}, removeEventListener() {},
  });
  const win = {
    location, localStorage, alert: (m) => alerts.push(String(m)), console,
    document: {
      cookie: '', body: mkEl(),
      getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
      createElement() { return mkEl(); }, addEventListener() {},
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, encodeURIComponent, decodeURIComponent, JSON, Math, Date, Intl, Promise,
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { language: 'zh-CN', languages: ['zh-CN'] },
    history: { back() {}, pushState() {}, replaceState() {} },
    request: () => Promise.resolve({ code: 200, message: 'ok', data: {} }),
    _nav: nav, _alerts: alerts, _store: store, _location: location,
    saveLoginRedirect: () => {}, consumeLoginRedirect: () => null,
    addEventListener() {}, removeEventListener() {},
    BroadcastChannel: class { constructor() {} postMessage() {} close() {} addEventListener() {} },
  };
  win.window = win; win.self = win; win.globalThis = win;
  return { ctx: vm.createContext(win), win, nav, location };
}

function run(ctx, code, filename) { return vm.runInContext(code, ctx, { filename }); }
function lastNav(nav) { return nav.length ? nav[nav.length - 1] : '(未发生跳转)'; }
function hasTCode(url, expect = TCODE) {
  const v = encodeURIComponent(expect);
  return url.includes('tCode=' + v) || url.includes('tCode=' + expect);
}
function fileOf(url) { return url.split('?')[0].replace(/\\/g, '/'); }

/** 载入 api.js（+可选 auth.js），返回可执行环境 */
function loadCore({ search, pathname, store, withAuth = false } = {}) {
  const s = makeSandbox({ search, pathname, store });
  run(s.ctx, fs.readFileSync(API_JS, 'utf8'), API_JS);
  if (withAuth) run(s.ctx, fs.readFileSync(AUTH_JS, 'utf8'), AUTH_JS);
  return s;
}

/** 载入某 HTML 的内联脚本（真实源码），可执行其 window.onload */
function loadPageInline(htmlFile, { search = '?tCode=' + TCODE_ENC, store = {} } = {}) {
  const html = fs.readFileSync(SRC + '/' + htmlFile, 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');
  const s = makeSandbox({ search, pathname: '/' + htmlFile, store });
  run(s.ctx, fs.readFileSync(API_JS, 'utf8'), API_JS);
  run(s.ctx, 'document.getElementById = function(){ return { textContent:"", style:{}, value:"" }; };', htmlFile + '#stub');
  try { run(s.ctx, inline, htmlFile + '#inline'); } catch (e) { s.inlineError = e.message; }
  return s;
}

/* ==================== 用例 ==================== */
async function main() {
  console.log('\n=========== A. 入口守卫 / 登录页回跳（js/public/api.js） ===========\n');
  {
    const s = loadCore();
    check('A1 InitUserInfo：未登录访问 admin.html?tCode= → 登录页保留 tCode', hasTCode(lastNav(s.nav)), lastNav(s.nav));
  }
  {
    const s = loadCore({ search: '' });
    check('A2 InitUserInfo：URL 无 tCode → 跳纯 index.html（不掺 default）', lastNav(s.nav) === './index.html', lastNav(s.nav));
  }
  {
    const s = loadCore();
    const r = s.win.guardEntryPage('admin');
    check('A3 guardEntryPage：无登录态 → 强制登录且保留 tCode', r === false && hasTCode(lastNav(s.nav)), lastNav(s.nav));
  }
  {
    const store = { currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: 'OTHER', token: 't' }) };
    const s = loadCore({ store });
    const r = s.win.guardEntryPage('admin');
    check('A4 guardEntryPage：URL tCode 与本地租户不一致 → 踢回登录页且带 URL 的 tCode',
      r === false && hasTCode(lastNav(s.nav)), lastNav(s.nav));
  }
  {
    const store = { currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: TCODE, token: 't' }) };
    const s = loadCore({ store });
    const r = s.win.guardEntryPage('admin');
    check('A5 guardEntryPage：租户+角色一致 → 放行且不跳转', r === true && s.nav.length === 0, lastNav(s.nav));
  }

  console.log('\n=========== B. 登录后按角色跳转 redirectToUserPage（api.js） ===========\n');
  function roleJump(user, search) {
    const store = user ? { currentUser: JSON.stringify(user) } : {};
    const s = loadCore({ store, search });
    s.win.redirectToUserPage(user);
    return { u: lastNav(s.nav), s };
  }
  {
    const { u } = roleJump({ role: 'admin', tenantCode: TCODE });
    check('B1 admin → admin.html 且带自身 tenantCode', fileOf(u).endsWith('admin.html') && hasTCode(u), u);
  }
  {
    const { u } = roleJump({ role: 'teacher', tenantCode: TCODE });
    check('B2 teacher → teacher.html 且带自身 tenantCode', fileOf(u).endsWith('teacher.html') && hasTCode(u), u);
  }
  {
    const { u } = roleJump({ role: 'student', tenantCode: TCODE });
    check('B3 student → student.html 且带自身 tenantCode', fileOf(u).endsWith('student.html') && hasTCode(u), u);
  }
  {
    const { u } = roleJump({ role: 'platform_admin', tenantCode: 'platform' });
    check('B4 platform_admin → platform_admin.html?tCode=platform',
      fileOf(u).endsWith('platform_admin.html') && u.includes('tCode=platform'), u);
  }
  {
    const { u } = roleJump({ role: 'teacher' });   // 登录态里没有 tenantCode
    check('B5 user.tenantCode 缺失 → 不得产出 tCode=undefined（应回退 URL 的 tCode）',
      !/tCode=undefined|tCode=$/.test(u) && hasTCode(u), u);
  }
  {
    const { u } = roleJump(null);                   // 未知身份兜底
    check('B6 user 为空（未知身份）→ 回登录页且保留 URL 的 tCode（不该写死 default）',
      u.includes('index.html') && hasTCode(u), u);
  }

  console.log('\n=========== C. 通用跳转：返回 / 登出 / token 兜底 ===========\n');
  {
    const store = { currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: TCODE, token: 't' }) };
    const s = loadCore({ store });
    s.win.goBack();
    const u = lastNav(s.nav);
    check('C1 goBack() 无来源 → 回 admin.html 应带 tCode', fileOf(u).endsWith('admin.html') && hasTCode(u), u);
  }
  {
    const store = {
      currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: TCODE, token: 't' }),
      refreshToken: 'rt-1',
    };
    const s = loadCore({ store, withAuth: true });
    await s.win.handleLogout();
    const u = lastNav(s.nav);
    check('C2 handleLogout() 登出 → 回 index.html 应带 tCode', fileOf(u).endsWith('index.html') && hasTCode(u), u);
  }
  {
    const s = loadCore();
    s.win.getToken();
    const u = lastNav(s.nav);
    check('C3 getToken() 无登录态 → 不应跳不存在的 /login，且应带 tCode',
      fileOf(u).endsWith('index.html') && hasTCode(u), u);
  }
  {
    const store = { currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: TCODE, token: 't' }) };
    const s = loadCore({ store, withAuth: true });
    const saved = s.win.authenticateUser ? 'exists' : 'missing';
    check('C4 auth.js 已加载（saveCurrentUserSession 存在）', saved === 'exists', saved);
  }

  console.log('\n=========== D. 预约路由页 booking.html 多角色分发（内联脚本真实执行） ===========\n');
  function runBooking(role, { extraSearch = '', logged = true } = {}) {
    const store = logged
      ? { currentUser: JSON.stringify({ userId: 'u1', role, tenantCode: role === 'platform_admin' ? 'platform' : TCODE, token: 't' }) }
      : {};
    const s = loadPageInline('booking.html', { search: '?tCode=' + TCODE_ENC + extraSearch, store });
    if (s.inlineError) return { u: '(内联脚本加载失败: ' + s.inlineError + ')', s };
    s.win.onload();
    return { u: lastNav(s.nav), s };
  }
  {
    const { u } = runBooking('student', { extraSearch: '&scdid=S1&sid=u1' });
    check('D1 booking→student（带 scdid/sid）应同时保留 tCode', fileOf(u).endsWith('student.html') && hasTCode(u), u);
  }
  {
    const { u } = runBooking('student', { extraSearch: '&scdid=S1&sid=other' });
    await sleep(2300);
    const s = loadPageInline('booking.html', { search: '?tCode=' + TCODE_ENC + '&scdid=S1&sid=other', store: { currentUser: JSON.stringify({ userId: 'u1', role: 'student', tenantCode: TCODE, token: 't' }) } });
    s.win.onload(); await sleep(2300);
    const final = lastNav(s.nav);
    check('D2 booking→student（sid 与本人不一致的兜底分支）应保留 tCode',
      fileOf(final).endsWith('student.html') && hasTCode(final), final);
  }
  {
    const { u } = runBooking('teacher');
    check('D3 booking→teacher 应保留 tCode', fileOf(u).endsWith('teacher.html') && hasTCode(u), u);
  }
  {
    const { u } = runBooking('admin', { extraSearch: '&scdid=S1&sid=u2' });
    check('D4 booking→admin 应保留 tCode', fileOf(u).endsWith('admin.html') && hasTCode(u), u);
  }
  {
    // platform 账号必须配 tCode=platform 才能过守卫（守卫优先是正确行为，故按 platform 自带链接测）
    const s = loadPageInline('booking.html', {
      search: '?tCode=platform',
      store: { currentUser: JSON.stringify({ userId: 'u1', role: 'platform_admin', tenantCode: 'platform', token: 't' }) },
    });
    s.win.onload(); await sleep(2300);
    const u = lastNav(s.nav);
    check('D5 booking→platform_admin（链接自带 tCode=platform）应落到 platform_admin.html?tCode=platform',
      fileOf(u).endsWith('platform_admin.html') && u.includes('tCode=platform'), u);
  }
  {
    const { u } = runBooking('student', { logged: false });
    check('D6 booking 未登录 → 回 index.html 应保留 tCode', fileOf(u).endsWith('index.html') && hasTCode(u), u);
  }

  console.log('\n=========== E. 受保护页内联脚本：登出/回登录（真实执行） ===========\n');
  for (const f of ['student.html', 'teacher.html', 'admin.html', 'platform_admin.html', 'auditLog.html', 'logBrowser.html']) {
    const store = { currentUser: JSON.stringify({ userId: '1', role: 'admin', tenantCode: TCODE, token: 't' }) };
    const s = loadPageInline(f, { store });
    if (s.inlineError) { check('E ' + f + ' 内联可加载', false, s.inlineError); continue; }
    const before = s.nav.length;
    try { s.win.handleLogout && s.win.onload && s.win.onload(); } catch (_) {}
    const u = lastNav(s.nav);
    const jumped = s.nav.length > before;
    check('E ' + f + '：若触发退回登录页则必须带 tCode',
      !jumped || !fileOf(u).endsWith('index.html') || hasTCode(u), jumped ? u : '(未跳转)');
  }

  console.log('\n=========================== 汇总 ===========================');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (failures.length) {
    console.log('\n失败项（= tCode 在跳转过程中丢失的点）：');
    failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  }
  return fail;
}

main().then((f) => process.exit(f > 0 ? 1 : 0)).catch((e) => { console.error('运行异常:', e); process.exit(2); });
