/**
 * 「公开页点预约链接 → 登录 → 自动回到原链接」整条往返链路的回归验证
 * （真实页面源码 + 真实内联脚本 + vm 沙箱）
 *
 * 为什么不用纯 jsdom：jsdom 的 window.location 是 unforgeable，拦不住
 * `location.href = xxx`，「跳到哪个页面」类断言会全部失真。这里用
 * 「jsdom 提供真实 document + vm 沙箱提供自建 location/storage」的混合方案。
 *
 * 覆盖（2026-09-28）：
 *   R1  公开页未登录点「直达预定」→ 拦截 + 弹提示层
 *   R2  去登录 → login.html 同时带 tCode 与 redirect
 *   R3  login.html【未登录】打开带 redirect 的地址 → 必须停在登录表单（不得回跳）
 *        ← 这是本轮修的缺陷：原来无论登录与否都立即回跳，回跳又被 booking.html
 *          的入口守卫弹回不带 redirect 的登录页，"回到原排期"的意图被吞掉
 *   R4  login.html【未登录】租户编码按 tCode 锁定为 TENANT_A
 *   R5  在 R3 的页面上走真实登录提交流程 → 登录成功后跳回原预约深链
 *   R6  login.html【已登录】带 redirect → 直接回跳（原有行为回归）
 *   R7  公开页（分享链接，URL 无 tCode）：从本地记住的租户编码兜底带入登录页
 *   R8  公开页（URL 带 tCode）→ 写入本地记忆，供后续分享链接兜底
 *   R9  booking.html【未登录】直接打开深链 → 跳登录页且带 redirect=本深链
 *   R10 booking.html【已登录学生】→ 正常进 student.html（新分支不干扰已登录路径）
 *   R11 跨域 redirect 仍被拒绝（防开放重定向回归）
 *
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_login_redirect_roundtrip.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

// 阴性对照支持：FRONTEND_DIR 指向「修复前」的页面副本时，本套用例应当有 FAIL
// （证明用例真的能抓到缺陷，而不是恒真的假通过）
const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const BASE = 'http://127.0.0.1:8080';

let pass = 0;
let fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

// ---------------------------------------------------------------------------
// 垫片
// ---------------------------------------------------------------------------

/** 可控 location：记录每一次跳转 */
function makeLocation(urlStr) {
  const u = new URL(urlStr);
  const loc = {
    _href: u.href,
    navigations: [],
    origin: u.origin, protocol: u.protocol, host: u.host, hostname: u.hostname,
    port: u.port, pathname: u.pathname, search: u.search, hash: u.hash,
    assign(v) { loc.navigations.push(String(v)); loc._href = new URL(String(v), u.href).href; },
    replace(v) { loc.assign(v); },
    reload() {},
    toString() { return loc._href; },
  };
  Object.defineProperty(loc, 'href', {
    get() { return loc._href; },
    set(v) { const s = String(v); loc.navigations.push(s); loc._href = new URL(s, u.href).href; },
    configurable: true,
  });
  return loc;
}

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    _map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => Array.from(m.keys())[i],
    get length() { return m.size; },
  };
}

function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) out.push(m[1]);
  }
  return out;
}

/** 忠实模拟 api.js 的 pageUrl 关键语义：extra 参数 + 从当前 URL 取 tCode 兜底 */
function makePageUrlStub(currentUrl) {
  return function pageUrl(file, extra, absolute, user) {
    const p = new URLSearchParams();
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach((k) => {
        if (extra[k] !== undefined && extra[k] !== null && String(extra[k]) !== '') p.set(k, String(extra[k]));
      });
    }
    let tc = '';
    try { tc = new URLSearchParams(new URL(currentUrl).search).get('tCode') || ''; } catch (e) {}
    if (!tc && user && user.tenantCode) tc = user.tenantCode;
    if (tc) p.set('tCode', tc);
    const base = (absolute ? '/' : './') + file;
    return p.toString() ? base + '?' + p.toString() : base;
  };
}

function buildSandbox(html, url, opts) {
  const o = opts || {};
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const loc = makeLocation(url);
  const store = makeStorage(o.seedStorage);
  const exceptions = [];

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = doc;
  sandbox.location = loc;
  sandbox.localStorage = store;
  sandbox.sessionStorage = makeStorage();
  sandbox.navigator = { userAgent: 'node-vm-test', clipboard: null };
  sandbox.console = o.quiet ? { log() {}, warn() {}, error() {}, group() {}, groupEnd() {}, groupCollapsed() {} } : console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.URL = URL;
  sandbox.alert = () => {};
  sandbox.confirm = () => true;
  sandbox.prompt = () => null;
  sandbox.print = () => {};
  sandbox.open = () => null;
  sandbox.closed = false;
  sandbox.history = { length: 1, back() {}, forward() {}, pushState() {}, replaceState() {} };
  sandbox.fetch = o.fetch || (async () => ({ ok: false, status: 404, json: async () => ({ code: 404 }) }));
  if (o.globals) Object.keys(o.globals).forEach((k) => { sandbox[k] = o.globals[k]; });

  vm.createContext(sandbox);
  return { sandbox, dom, doc, loc, store, exceptions };
}

/** 从 URL 上取参数（测试断言用，容忍空格键名） */
function paramOf(url, name) {
  const m = new RegExp('[?&]' + name + '=([^&]*)').exec(url || '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

const SNAPSHOT_HTML = '<html><body>'
  + '<a href="' + BASE + '/booking.html?scdid=9001" target="_blank" rel="noopener">直达预定（优选时段）</a>'
  + '<a href="' + BASE + '/booking.html?tid=T1001" target="_blank" rel="noopener">全部排期</a>'
  + '</body></html>';

function okJson(body) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

(async () => {
  const profileHtml = fs.readFileSync(path.join(FRONTEND, 'teacherPublishedProfile.html'), 'utf8');
  const profileScripts = inlineScripts(profileHtml);
  const loginHtml = fs.readFileSync(path.join(FRONTEND, 'login.html'), 'utf8');
  const loginScripts = inlineScripts(loginHtml);
  const bookingHtml = fs.readFileSync(path.join(FRONTEND, 'booking.html'), 'utf8');
  const bookingScripts = inlineScripts(bookingHtml);

  /** 起一个公开页沙箱 */
  async function openProfile(url, seedStorage) {
    const ctx = buildSandbox(profileHtml, url, {
      fetch: okJson({ code: 200, data: { staticHtml: SNAPSHOT_HTML } }),
      seedStorage: seedStorage,
      quiet: true,
      globals: {
        termText: (k) => ({ teacher: '律师', schedule: '排期' }[k] || k),
        sanitizeTenantCode: (s) => String(s || '').trim(),
      },
    });
    profileScripts.forEach((s, i) => vm.runInContext(s, ctx.sandbox, { filename: 'teacherPublishedProfile.html#' + (i + 1) }));
    await new Promise((r) => setTimeout(r, 60));
    return ctx;
  }

  /**
   * 起一个 login.html 沙箱并跑 onload。
   * @param {boolean} doLogin 是否继续走「真实提交登录」流程
   */
  async function openLogin(url, o) {
    const opt = o || {};
    const ctx = buildSandbox(loginHtml, url, {
      seedStorage: opt.seedStorage,
      quiet: true,
      globals: {
        // login.html 依赖的全局（正常由 api.js / auth.js / utility_request.js 提供）
        authenticateUser: async () => ({
          userId: '1', account: 'stu001', role: 'student', token: 'fake-token-ok', name: '张三',
        }),
        redirectToUserPage: function () { ctx.roleJumped = true; },
        pageUrl: makePageUrlStub(url),
        resetLoginForm: () => {},
        handleLogout: () => {},
        sanitizeTenantCode: (s) => String(s || '').trim(),
        applyLoginTenantRule: () => {},
      },
    });
    ctx.roleJumped = false;
    loginScripts.forEach((s, i) => vm.runInContext(s, ctx.sandbox, { filename: 'login.html#' + (i + 1) }));
    if (typeof ctx.sandbox.onload === 'function') ctx.sandbox.onload();
    else ctx.exceptions.push('window.onload 未被赋值');
    if (opt.doLogin) {
      const d = ctx.doc;
      d.getElementById('username').value = 'stu001';
      d.getElementById('password').value = 'p@ssw0rd';
      d.getElementById('login-role').value = 'student';
      d.getElementById('login-form').dispatchEvent(new ctx.dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 1100));   // submitLogin 内 800ms 延迟跳转
    }
    return ctx;
  }

  // =======================================================================
  console.log('\n=== R1 公开页（未登录）点预约链接 → 拦截 + 弹提示层 ===');
  const p1 = await openProfile(BASE + '/teacherPublishedProfile.html?id=P1001&tCode=TENANT_A');
  const mask1 = p1.doc.getElementById('pub-login-mask');
  const link1 = p1.doc.querySelectorAll('#pub-mount a')[0];
  assert('快照链接已注入', !!link1, 'a 数量=' + p1.doc.querySelectorAll('#pub-mount a').length);
  const notPrevented = link1.dispatchEvent(new p1.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('点击被拦截（preventDefault）', notPrevented === false);
  assert('提示层已显示', mask1.style.display === 'flex', mask1.style.display);
  assert('未发生跳转', p1.loc.navigations.length === 0, p1.loc.navigations.join(','));
  assert('URL 的 tCode 已记入本地（供分享链接兜底）', p1.store.getItem('lastTenantCode') === 'TENANT_A',
    String(p1.store.getItem('lastTenantCode')));

  console.log('\n=== R2 「去登录」同时带 tCode 与 redirect ===');
  p1.sandbox.__pubGoLogin();
  const loginUrl1 = p1.loc.navigations[p1.loc.navigations.length - 1] || '';
  console.log('    登录页地址=' + loginUrl1);
  assert('跳转到 login.html', /login\.html/.test(loginUrl1), loginUrl1);
  assert('带 tCode=TENANT_A', paramOf(loginUrl1, 'tCode') === 'TENANT_A', String(paramOf(loginUrl1, 'tCode')));
  assert('带 redirect=原排期深链', paramOf(loginUrl1, 'redirect') === '/booking.html?scdid=9001',
    String(paramOf(loginUrl1, 'redirect')));

  console.log('\n=== R3 login.html（未登录）带 redirect → 必须停在登录表单，不得回跳 ===');
  const fullLoginUrl = new URL(loginUrl1, BASE + '/').href;
  const l1 = await openLogin(fullLoginUrl, {});
  console.log('    跳转序列=' + JSON.stringify(l1.loc.navigations));
  assert('未登录不发生任何跳转（否则 redirect 会被目标页守卫吞掉）', l1.loc.navigations.length === 0,
    l1.loc.navigations.join(' , '));
  assert('未走「按角色进工作台」', l1.roleJumped === false);

  console.log('\n=== R4 未登录时租户编码按 tCode 锁定 ===');
  const tcInput1 = l1.doc.getElementById('login-tenant-code');
  assert('租户编码填入 TENANT_A', tcInput1.value === 'TENANT_A', tcInput1.value);
  assert('租户编码只读（专属链接锁定）', tcInput1.readOnly === true, String(tcInput1.readOnly));
  assert('登录表单可见（用户能输入账号密码）',
    l1.doc.getElementById('username') !== null && l1.doc.getElementById('login-form') !== null);

  console.log('\n=== R5 登录成功 → 自动回到原排期深链 ===');
  const l2 = await openLogin(fullLoginUrl, { doLogin: true });
  const nav5 = l2.loc.navigations[l2.loc.navigations.length - 1] || '';
  console.log('    跳转序列=' + JSON.stringify(l2.loc.navigations));
  assert('登录成功后跳回 /booking.html?scdid=9001', nav5 === '/booking.html?scdid=9001', nav5);
  assert('未走「按角色进工作台」（否则用户被扔进工作台）', l2.roleJumped === false);
  assert('登录态已落盘', !!l2.store.getItem('token'), String(l2.store.getItem('token')));

  console.log('\n=== R6 login.html（已登录）带 redirect → 直接回跳（回归）===');
  const l3 = await openLogin(fullLoginUrl, {
    seedStorage: {
      token: 'fake-token-for-test',
      currentUser: JSON.stringify({ userId: '1', account: 'stu', role: 'student', token: 'fake-token-for-test', tenantCode: 'TENANT_A' }),
    },
  });
  assert('已登录直接回跳该排期', (l3.loc.navigations[0] || '') === '/booking.html?scdid=9001', l3.loc.navigations.join(','));

  console.log('\n=== R7 公开页（分享链接无 tCode）→ 用本地记住的租户编码带入登录页 ===');
  const p2 = await openProfile(BASE + '/teacherPublishedProfile.html?id=P1001', { lastTenantCode: 'TENANT_A' });
  const link2 = p2.doc.querySelectorAll('#pub-mount a')[0];
  link2.dispatchEvent(new p2.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  p2.sandbox.__pubGoLogin();
  const loginUrl2 = p2.loc.navigations[p2.loc.navigations.length - 1] || '';
  assert('无 URL tCode 时回退本地记忆', paramOf(loginUrl2, 'tCode') === 'TENANT_A', loginUrl2);
  assert('redirect 仍然指向该排期', paramOf(loginUrl2, 'redirect') === '/booking.html?scdid=9001',
    String(paramOf(loginUrl2, 'redirect')));

  console.log('\n=== R8 公开页无 tCode 且本地无记忆 → 不拼空 tCode 参数 ===');
  const p3 = await openProfile(BASE + '/teacherPublishedProfile.html?id=P1001', {});
  const link3 = p3.doc.querySelectorAll('#pub-mount a')[0];
  link3.dispatchEvent(new p3.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  p3.sandbox.__pubGoLogin();
  const loginUrl3 = p3.loc.navigations[p3.loc.navigations.length - 1] || '';
  assert('不附加空 tCode', !/[?&]tCode=/.test(loginUrl3), loginUrl3);

  // =======================================================================
  console.log('\n=== R9 booking.html（未登录）直接打开深链 → 跳登录页并带 redirect ===');
  const deepUrl = BASE + '/booking.html?scdid=9001&tCode=TENANT_A';
  const b1 = buildSandbox(bookingHtml, deepUrl, {
    quiet: true,
    globals: {
      pageUrl: makePageUrlStub(deepUrl),
      guardEntryPage: () => { b1.guardRan = true; return false; },
      autoLoginCheck: () => null,
      saveLoginRedirect: () => {},
      termText: (k) => k,
    },
  });
  b1.guardRan = false;
  bookingScripts.forEach((s, i) => vm.runInContext(s, b1.sandbox, { filename: 'booking.html#' + (i + 1) }));
  if (typeof b1.sandbox.onload === 'function') b1.sandbox.onload();
  const b1nav = b1.loc.navigations[b1.loc.navigations.length - 1] || '';
  console.log('    跳转=' + b1nav);
  assert('未登录被送往登录页', /login\.html/.test(b1nav), b1nav);
  assert('带 redirect=本深链（登录后可回来）', paramOf(b1nav, 'redirect') === '/booking.html?scdid=9001&tCode=TENANT_A',
    String(paramOf(b1nav, 'redirect')));
  assert('带 tCode=TENANT_A', paramOf(b1nav, 'tCode') === 'TENANT_A', String(paramOf(b1nav, 'tCode')));
  assert('未再进入旧守卫路径（不重复跳转）', b1.loc.navigations.length === 1, b1.loc.navigations.join(' , '));

  console.log('\n=== R10 booking.html（已登录学生）→ 正常进 student.html（回归）===');
  const b2 = buildSandbox(bookingHtml, deepUrl, {
    quiet: true,
    seedStorage: { token: 'T', currentUser: JSON.stringify({ userId: '9', role: 'student', token: 'T', tenantCode: 'TENANT_A' }) },
    globals: {
      pageUrl: makePageUrlStub(deepUrl),
      guardEntryPage: () => true,
      autoLoginCheck: () => ({ userId: '9', role: 'student', token: 'T', tenantCode: 'TENANT_A' }),
      saveLoginRedirect: () => {},
      termText: (k) => k,
    },
  });
  bookingScripts.forEach((s, i) => vm.runInContext(s, b2.sandbox, { filename: 'booking.html#' + (i + 1) }));
  if (typeof b2.sandbox.onload === 'function') b2.sandbox.onload();
  const b2nav = b2.loc.navigations[b2.loc.navigations.length - 1] || '';
  console.log('    跳转=' + b2nav);
  assert('已登录学生直达 student.html', /student\.html/.test(b2nav), b2nav);
  assert('未跳登录页', !/login\.html/.test(b2nav), b2nav);

  console.log('\n=== R11 跨域 / 异源 redirect 仍被拒绝（防开放重定向回归）===');
  const l4 = await openLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('https://evil.example.com/x.html'), {});
  const nav11 = l4.loc.navigations.join(' ');
  assert('不跳转外域', !/evil\.example\.com/.test(nav11), nav11);
  const l5 = await openLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('javascript:alert(1)'), {});
  assert('不执行 javascript: 伪协议', !/javascript:/i.test(l5.loc.navigations.join(' ')), l5.loc.navigations.join(' '));

  console.log('\n异常收集：' + JSON.stringify([].concat(p1.exceptions, l1.exceptions, l2.exceptions)));
  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
