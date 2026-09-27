'use strict';
const fs = require('fs');
const vm = require('vm');

const DIR = 'api/beforeRun/dist';
const IDX = fs.readFileSync(DIR + '/index.html', 'utf8');
const LAND = fs.readFileSync(DIR + '/student-landing.html', 'utf8');
const TERMS = fs.readFileSync(DIR + '/js/public/termsFunction.js', 'utf8');
const UTIL = fs.readFileSync(DIR + '/js/public/utility_request.js', 'utf8');

// ---------- 真实源码片段提取（括号栈匹配） ----------
function extractFunc(s, name) {
  const i = s.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const bs = s.indexOf('{', i);
  let d = 0;
  for (let k = bs; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return s.slice(i, k + 1); } }
  return null;
}
function extractAssignedFn(s, baseMarker) {     // window.x = function (){...} 仅命中定义处，跳过 onclick 调用处
  let m = s.indexOf(baseMarker);
  while (m >= 0) {
    let p = m + baseMarker.length;
    while (p < s.length && /\s/.test(s[p])) p++;
    if (s[p] === '=') {
      const fp = s.indexOf('function', p);
      if (fp >= 0) {
        const bs = s.indexOf('{', fp);
        let d = 0;
        for (let k = bs; k < s.length; k++) { const c = s[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { let e = k + 1; while (e < s.length && '; \n\r'.includes(s[e])) e++; return s.slice(m, e); } } }
      }
    }
    m = s.indexOf(baseMarker, m + 1);
  }
  return null;
}
function extractIndexIIFE(s) {                 // (function () { ... })();
  const start = s.indexOf('(function () {');
  if (start < 0) return null;
  let d = 0, end = -1;
  for (let k = start; k < s.length; k++) { const c = s[k]; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) { end = k; break; } } }
  // IIFE 形如 (function(){...})()；括号栈在 "})" 的 ")" 处归零，需补上紧随其后的调用括号 "()"
  if (s[end + 1] === '(' && s[end + 2] === ')') end += 2;
  return end >= 0 ? s.slice(start, end + 1) : null;
}

const getTenantCodeParamSrc = extractFunc(TERMS, 'getTenantCodeParam');
const indexIIFESrc = extractIndexIIFE(IDX);
const landingLogoutSrc = extractAssignedFn(LAND, 'window.__landingLogout');

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra ? '  >> ' + extra : '')); }
}

function makeCtx(search, token) {
  const store = {};
  if (token) store.token = token;
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const win = {
    location: { search: search || '', href: '' },
    localStorage,
    encodeURIComponent, decodeURIComponent, URLSearchParams, console,
    setTimeout: (f) => { if (typeof f === 'function') f(); },
    history: { length: 2 }, closed: false,
  };
  win.window = win;
  const sandbox = {
    window: win, localStorage, console,
    encodeURIComponent, decodeURIComponent, URLSearchParams,
    setTimeout: (f) => { if (typeof f === 'function') f(); },
  };
  sandbox.location = win.location;
  return { win, sandbox, store };
}

// ================= T1: getTenantCodeParam 解析健壮性 =================
console.log('\n=== T1 getTenantCodeParam（真实 dist/termsFunction.js）===');
assert('提取 getTenantCodeParam 源码', !!getTenantCodeParamSrc);
[
  ['?tCode =tenant_A', 'tenant_A'],
  ['?tCode=tCode=TENANT_A', 'TENANT_A'],
  ['?tCode=TENANT_A', 'TENANT_A'],
  ['?tcode=tenant_b', 'tenant_b'],
  ['?x=1&tCode =foo', 'foo'],
  ['', ''],
].forEach(([search, exp]) => {
  const { win, sandbox } = makeCtx(search);
  vm.createContext(sandbox);
  vm.runInContext(getTenantCodeParamSrc, sandbox, { filename: 'getTenantCodeParam' });
  const got = sandbox.getTenantCodeParam ? sandbox.getTenantCodeParam() : '(no fn)';
  assert('解析 ' + JSON.stringify(search) + ' => ' + JSON.stringify(exp), got === exp, 'got=' + JSON.stringify(got));
});

// ================= T2: index 早期重定向（无循环/不脏跳）=================
console.log('\n=== T2 index 早期重定向（真实 dist/index.html 内联）===');
assert('提取 index 早期 IIFE 源码（含末尾 () 调用）', !!indexIIFESrc && /\)\(\)$/.test(indexIIFESrc.trim()) || /}\)\);?$/.test(indexIIFESrc.trim()), 'tail=' + JSON.stringify(indexIIFESrc.trim().slice(-6)));
[
  { search: '?tCode =tenant_A', token: null, exp: 'student-landing.html?tCode=tenant_A&from=index', desc: '空格键名未登录→跳landing且tCode干净' },
  { search: '?tCode=TENANT_A', token: null, exp: 'student-landing.html?tCode=TENANT_A&from=index', desc: '正常未登录→跳landing' },
  { search: '?tCode =tenant_A&noredirect=1', token: null, exp: null, desc: '带noredirect=1→不跳（防循环）' },
  { search: '?tCode =tenant_A', token: 'jwt-x', exp: null, desc: '已登录→不跳' },
].forEach(tc => {
  const { win, sandbox } = makeCtx(tc.search, tc.token);
  let replaced = null;
  win.location.replace = (u) => { replaced = u; };
  win.sanitizeTenantCode = (x) => x;
  win.window.sanitizeTenantCode = win.sanitizeTenantCode;
  sandbox.sanitizeTenantCode = win.sanitizeTenantCode;
  vm.createContext(sandbox);
  let err = null;
  try { vm.runInContext(indexIIFESrc, sandbox, { filename: 'index-early' }); } catch (e) { err = e.message; }
  assert('IIFE 执行无异常 [' + tc.desc + ']', err === null, err || '');
  if (tc.exp === null) assert('不跳转 [' + tc.desc + ']', replaced === null, 'replaced=' + replaced);
  else assert('跳转到 [' + tc.desc + ']', replaced === tc.exp, 'replaced=' + replaced);
});

// ================= T3: utility_request 401 守卫（用 _retry=true 绕开刷新分支，直测 switch）=================
console.log('\n=== T3 utility_request 401 守卫（真实 dist/utility_request.js）===');
function runUtil(pubLanding, noAuth) {
  const { win, sandbox } = makeCtx('?tCode=TENANT_A');
  win.__PUBLIC_LANDING__ = pubLanding;
  sandbox.window.__PUBLIC_LANDING__ = pubLanding;
  sandbox.window.pageUrl = (p) => './' + p;
  let capturedErr = null;
  function inst() { return Promise.resolve({ data: { code: 200, data: {} } }); }
  inst.interceptors = { request: { use: () => {} }, response: { use: (s, e) => { capturedErr = e; } } };
  const fakeAxios = { create: () => inst };
  sandbox.axios = fakeAxios; sandbox.window.axios = fakeAxios;
  sandbox.document = {}; win.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(UTIL, sandbox, { filename: 'utility_request.js' });
  const before = win.location.href;
  const err = { response: { status: 401, data: { code: 401, message: 'expired' } }, config: { _retry: true, noAuthRedirect: noAuth, customErrorMsg: false } };
  try { const p = capturedErr(err); if (p && p.then) p.catch(() => {}); } catch (e) { console.log('    [DIAG] capturedErr threw: ' + e.message); }
  return { before, after: win.location.href, captured: !!capturedErr };
}
const r1 = runUtil(true, false);
assert('落地页 401（__PUBLIC_LANDING__=true）不跳登录页', r1.captured && r1.after === r1.before, 'after=' + r1.after);
const r2 = runUtil(false, false);
assert('普通页 401（守卫关闭）会跳登录页', r2.captured && r2.after.indexOf('index.html') >= 0 && r2.after !== r2.before, 'after=' + r2.after);
const r3 = runUtil(false, true);
assert('noAuthRedirect=true 不跳登录页', r3.captured && r3.after === r3.before, 'after=' + r3.after);

// ================= T4: landing 退出登录直跳 landing（不回 index）=================
console.log('\n=== T4 landing 退出登录（真实 dist/student-landing.html 内联）===');
assert('提取 __landingLogout 源码', !!landingLogoutSrc, 'len=' + (landingLogoutSrc ? landingLogoutSrc.length : 0));
{
  const { win, sandbox, store } = makeCtx('?tCode=TENANT_A', 'jwt-x');
  store.refreshToken = 'rt-x';
  let href = null;
  Object.defineProperty(win.location, 'href', { set(v) { href = v; }, get() { return ''; }, configurable: true });
  sandbox.location = win.location;
  win.getTenantCodeParam = () => 'TENANT_A';
  sandbox.getTenantCodeParam = win.getTenantCodeParam;
  win.logout = () => Promise.resolve();
  sandbox.logout = win.logout;
  win.sanitizeTenantCode = (x) => x;
  sandbox.sanitizeTenantCode = win.sanitizeTenantCode;
  vm.createContext(sandbox);
  vm.runInContext(landingLogoutSrc, sandbox, { filename: 'landing-logout' });
  assert('__landingLogout 已挂载', typeof win.__landingLogout === 'function');
  try { win.__landingLogout(); } catch (e) { assert('__landingLogout 执行无异常', false, e.message); }
  const ok = !!href && href.indexOf('student-landing.html') >= 0 && !/^index\.html/.test(href);
  assert('退出后直跳落地页（不回 index 登录页）', ok, 'href=' + href);
}

// ================= T5: 真实后端 public-list（教师风采非空）=================
console.log('\n=== T5 真实后端 public-list（教师风采数据）===');
(async () => {
  try {
    const url = 'http://localhost:8080/api/v1/teacher/published/public-list?tenantCode=TENANT_A';
    const res = await fetch(url);
    const text = await res.text();
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    const arr = (j && (j.data || j));
    const isArr = Array.isArray(arr);
    assert('public-list 返回 200', res.status === 200, 'status=' + res.status);
    assert('public-list 含非空教师列表', isArr && arr.length > 0, 'len=' + (isArr ? arr.length : 'n/a'));
    if (isArr) console.log('    教师数量 = ' + arr.length + '，首条: ' + (arr[0] && JSON.stringify(arr[0]).slice(0, 110)));
  } catch (e) { assert('public-list 可达', false, e.message); }
  console.log('\n================ RESULT: ' + pass + ' passed, ' + fail + ' failed ================');
  process.exit(fail ? 1 : 0);
})();
