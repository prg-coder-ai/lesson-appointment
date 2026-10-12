/**
 * 登录门槛后移验证（真实页面源码 + 真实脚本源码，vm 沙箱）
 *
 * 为什么不用纯 jsdom 加载页面：jsdom 的 window.location 是 unforgeable，
 * 无法拦截 `location.href = xxx`，导致"跳到哪个页面"这类断言全部失真（实测过）。
 * 这里改用「jsdom 提供真实 document + vm 沙箱提供自建 location」：
 *   - document 用 jsdom 真实现 → 事件派发 / closest / appendChild 全真实
 *   - location / localStorage / fetch 用可控 stub → 可精确断言跳转目标
 *
 * 待验证的行为链（2026-09-28）：
 *   student-landing.html 未登录点师资卡片 → 直接开 teacherPublishedProfile.html（不再跳登录）
 *   → 公开页点快照里的「排期/预约」链接 → 不静默跳转，先弹页面内登录提示层
 *   → 点「去登录」带 redirect=该排期 → login.html 登录成功后回跳该排期
 *   → login.html 对 redirect 做同源白名单校验（防开放重定向）
 *
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_teacher_profile_login_gate.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const BASE = 'http://127.0.0.1:8080';

let pass = 0;
let fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

// ---------------------------------------------------------------------------
// 基础垫片
// ---------------------------------------------------------------------------

/** 可控 location：记录每一次跳转赋值/调用 */
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

/** 从 html 里按顺序取出内联脚本源码 */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) out.push(m[1]);
  }
  return out;
}

/**
 * 建沙箱：document 来自 jsdom（真实），window/location/storage/fetch 可控。
 * @returns {{sandbox, dom, loc, store, addListenerLog, exceptions}}
 */
function buildSandbox(html, url, opts) {
  const o = opts || {};
  const dom = new JSDOM(html, { url });          // 不执行脚本，只要真实 DOM
  const doc = dom.window.document;
  const loc = makeLocation(url);
  const store = makeStorage(o.seedStorage);
  const exceptions = [];
  const addListenerLog = [];

  // 记录 document.addEventListener 的注册（诊断用）
  const origAdd = doc.addEventListener.bind(doc);
  doc.addEventListener = (type, fn, opt) => { addListenerLog.push(type); return origAdd(type, fn, opt); };

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

  // 页面脚本里的 window.onload = fn 会挂到 sandbox.onload（window === sandbox）
  vm.createContext(sandbox);
  return { sandbox, dom, doc, loc, store, addListenerLog, exceptions };
}

/** 载入前端源码文件到沙箱 */
function loadFile(sandbox, rel) {
  const code = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

/** 快照 staticHtml：含「直达预定 / 全部排期」两个站内预约深链 */
const SNAPSHOT_HTML = '<!DOCTYPE html><html><head><style>.publish-wrapper{max-width:900px;}</style></head><body>'
  + '<div class="publish-wrapper"><h1>张明 · 民商事争议解决</h1>'
  + '<section><h3>可预约时间</h3>'
  + '<div>2026-10-01 - 09:00~11:00</div>'
  + '<div><a href="booking.html?scdid=9001" target="_blank" rel="noopener">直达预定（优选时段）</a></div>'
  + '<div><a href="booking.html?tid=T1001" target="_blank" rel="noopener">全部排期</a></div>'
  + '<div><a href="https://example.com/other" target="_blank">外部链接</a></div>'
  + '</section></div></body></html>';

function okJson(body) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

(async () => {
  const profileHtml = fs.readFileSync(path.join(FRONTEND, 'teacherPublishedProfile.html'), 'utf8');
  const scripts = inlineScripts(profileHtml);

  // =======================================================================
  console.log('\n=== T1 公开页（未登录）：点排期 → 弹提示层，不发生跳转 ===');
  const t1 = buildSandbox(profileHtml, BASE + '/teacherPublishedProfile.html?id=P1001', {
    fetch: okJson({ code: 200, data: { staticHtml: SNAPSHOT_HTML } }),
  });
  scripts.forEach((s, i) => vm.runInContext(s, t1.sandbox, { filename: 'teacherPublishedProfile.html#' + (i + 1) }));
  await new Promise((r) => setTimeout(r, 60));

  const mask = t1.doc.getElementById('pub-login-mask');
  assert('页面自带登录提示层（默认隐藏）', !!mask && mask.style.display === 'none', mask && mask.style.display);
  assert('document 上已注册 click 委托', t1.addListenerLog.indexOf('click') >= 0, t1.addListenerLog.join(','));

  const injected = t1.doc.querySelectorAll('#pub-mount a');
  assert('快照里的预约链接已注入到公开页', injected.length >= 3, 'a 数量=' + injected.length);

  const linkSchedule = injected[0];   // booking.html?scdid=9001
  const linkTeacher = injected[1];    // booking.html?tid=T1001
  const linkExternal = injected[2];   // 站外链接
  console.log('    第一个链接 href=' + (linkSchedule && linkSchedule.getAttribute('href')));

  const notPrevented = linkSchedule.dispatchEvent(new t1.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('未登录点击排期被拦截（preventDefault）', notPrevented === false);
  assert('提示层已显示', mask.style.display === 'flex', mask.style.display);
  assert('点击未触发任何跳转', t1.loc.navigations.length === 0, t1.loc.navigations.join(' , '));

  console.log('\n=== T2 「去登录」跳 login.html 并带上 redirect=该排期 ===');
  t1.sandbox.__pubGoLogin();
  const goTarget = t1.loc.navigations[t1.loc.navigations.length - 1] || '';
  const redirectOf = (url) => {
    const m = /[?&]redirect=([^&]*)/.exec(url || '');
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  };
  assert('跳转到 login.html', /login\.html/.test(goTarget), goTarget);
  assert('redirect 指向被点的排期', redirectOf(goTarget) === '/booking.html?scdid=9001', redirectOf(goTarget));
  assert('无 tCode 时不附加空 tCode 参数', !/[?&]tCode=/.test(goTarget), goTarget);

  console.log('\n=== T3 提示层交互：取消可关闭，且站外链接不被接管 ===');
  t1.sandbox.__pubHideLoginTip();
  assert('取消后提示层隐藏', mask.style.display === 'none', mask.style.display);
  const extPrevented = linkExternal.dispatchEvent(new t1.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('站外链接不被拦截（未被 preventDefault）', extPrevented === true);
  assert('站外链接不弹提示层', mask.style.display === 'none', mask.style.display);

  console.log('\n=== T4 公开页（已登录）：点排期 → 放行，不弹层 ===');
  t1.store.setItem('token', 'fake-token-for-test');
  const second = linkTeacher.dispatchEvent(new t1.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('已登录点击排期不被拦截', second === true);
  assert('已登录不弹提示层', mask.style.display === 'none', mask.style.display);

  // =======================================================================
  console.log('\n=== T5 公开页带 tCode：去登录保留租户上下文 ===');
  const t5 = buildSandbox(profileHtml, BASE + '/teacherPublishedProfile.html?id=P1001&tCode=TENANT_A', {
    fetch: okJson({ code: 200, data: { staticHtml: SNAPSHOT_HTML } }),
  });
  scripts.forEach((s, i) => vm.runInContext(s, t5.sandbox, { filename: 'teacherPublishedProfile.html#' + (i + 1) }));
  await new Promise((r) => setTimeout(r, 60));
  const links5 = t5.doc.querySelectorAll('#pub-mount a');
  links5[1].dispatchEvent(new t5.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  t5.sandbox.__pubGoLogin();
  const goTarget5 = t5.loc.navigations[t5.loc.navigations.length - 1] || '';
  assert('带 tCode=TENANT_A', /[?&]tCode=TENANT_A/.test(goTarget5), goTarget5);
  assert('redirect 指向 tid 深链', redirectOf(goTarget5) === '/booking.html?tid=T1001', redirectOf(goTarget5));

  // =======================================================================
  // 真实快照里的链接由 teacherInfo-publish.js 的 bookingDeepLink() 生成，
  // 形态是 **绝对地址**（FRONTEND_ORIGIN + /booking.html?scdid=…），
  // 因此除了相对形式，还必须覆盖「绝对同源」与「绝对异源」两种形态。
  console.log('\n=== T5b 公开页：绝对同源 booking 链接同样被接管 ===');
  const ABS_SNAPSHOT = '<html><body>'
    + '<a href="' + BASE + '/booking.html?scdid=9100" target="_blank">直达预定（优选时段）</a>'
    + '<a href="https://other.example.com/booking.html?scdid=9100" target="_blank">异源预约链接</a>'
    + '</body></html>';
  const t5b = buildSandbox(profileHtml, BASE + '/teacherPublishedProfile.html?id=P1001', {
    fetch: okJson({ code: 200, data: { staticHtml: ABS_SNAPSHOT } }),
  });
  scripts.forEach((s, i) => vm.runInContext(s, t5b.sandbox, { filename: 'teacherPublishedProfile.html#' + (i + 1) }));
  await new Promise((r) => setTimeout(r, 60));
  const absLinks = t5b.doc.querySelectorAll('#pub-mount a');
  const absSame = absLinks[0].dispatchEvent(new t5b.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('绝对同源链接被拦截', absSame === false);
  assert('提示层已显示', t5b.doc.getElementById('pub-login-mask').style.display === 'flex');
  t5b.sandbox.__pubGoLogin();
  const absGo = t5b.loc.navigations[t5b.loc.navigations.length - 1] || '';
  assert('redirect 归一化为同源路径', redirectOf(absGo) === '/booking.html?scdid=9100', redirectOf(absGo));

  console.log('\n=== T5c 公开页：异源 booking 链接不接管（降级放行）===');
  t5b.sandbox.__pubHideLoginTip();   // 先复位提示层，否则断言到的是上一步的残留状态
  const absOther = absLinks[1].dispatchEvent(new t5b.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert('异源链接不被拦截', absOther === true);
  assert('异源链接不弹提示层', t5b.doc.getElementById('pub-login-mask').style.display === 'none');
  // =======================================================================
  const loginHtml = fs.readFileSync(path.join(FRONTEND, 'login.html'), 'utf8');
  const loginScripts = inlineScripts(loginHtml);
  const loggedInStorage = {
    token: 'fake-token-for-test',
    currentUser: JSON.stringify({ userId: '1', account: 'stu', role: 'student', token: 'fake-token-for-test', tenantCode: 'TENANT_A' }),
  };

  /**
   * 跑 login.html：断言 onload 的跳转决策。
   * @returns {{loc, roleJumped: boolean, exceptions: string[]}}
   */
  function runLogin(url) {
    const ctx = buildSandbox(loginHtml, url, {
      seedStorage: loggedInStorage,
      quiet: true,
      globals: {
        // login.html 依赖 api.js 的几个全局；这里给最小 stub，只记录"是否回退到角色跳转"
        redirectToUserPage: function () { ctx.roleJumped = true; },
        pageUrl: (f) => './' + f + '?tCode=TENANT_A',
        resetLoginForm: () => {},
        handleLogout: () => {},
        sanitizeTenantCode: (s) => String(s || '').trim(),
      },
    });
    ctx.roleJumped = false;
    try {
      loginScripts.forEach((s, i) => vm.runInContext(s, ctx.sandbox, { filename: 'login.html#' + (i + 1) }));
      if (typeof ctx.sandbox.onload === 'function') ctx.sandbox.onload();
      else ctx.exceptions.push('window.onload 未被赋值');
    } catch (e) {
      ctx.exceptions.push(e.message);
    }
    return ctx;
  }

  console.log('\n=== T6 login.html：合法 redirect → 登录态直接回跳该排期 ===');
  const t6 = runLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('/booking.html?scdid=9001'));
  console.log('    跳转序列=' + JSON.stringify(t6.loc.navigations) + '  exceptions=' + JSON.stringify(t6.exceptions));
  assert('回跳到该排期深链', (t6.loc.navigations[0] || '') === '/booking.html?scdid=9001', t6.loc.navigations.join(','));
  assert('未走「按角色进工作台」', t6.roleJumped === false);

  console.log('\n=== T7 login.html：跨域 redirect 被拒绝（防开放重定向）===');
  const t7 = runLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('https://evil.example.com/x.html'));
  const nav7 = t7.loc.navigations.join(' ');
  assert('不跳转到外域', !/evil\.example\.com/.test(nav7), nav7);
  assert('回退到按角色跳转', t7.roleJumped === true, 'roleJumped=' + t7.roleJumped + ' nav=' + nav7);

  console.log('\n=== T8 login.html：伪协议 redirect 被拒绝 ===');
  const t8 = runLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('javascript:alert(1)'));
  assert('不执行 javascript: 伪协议', !/javascript:/i.test(t8.loc.navigations.join(' ')), t8.loc.navigations.join(' '));
  assert('回退到按角色跳转', t8.roleJumped === true);

  console.log('\n=== T9 login.html：协议相对地址 //evil.com 被拒绝 ===');
  const t9 = runLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('//evil.example.com/x.html'));
  assert('不跳转到 //evil.example.com', !/evil\.example\.com/.test(t9.loc.navigations.join(' ')), t9.loc.navigations.join(' '));

  console.log('\n=== T10 login.html：相对形式 redirect（无前导斜杠）也被接受 ===');
  const t10 = runLogin(BASE + '/login.html?tCode=TENANT_A&redirect=' + encodeURIComponent('booking.html?scdid=777'));
  assert('回跳到 booking.html?scdid=777', (t10.loc.navigations[0] || '') === '/booking.html?scdid=777', t10.loc.navigations.join(','));

  // =======================================================================
  console.log('\n=== T11 landing 页（未登录）：点师资卡片 → 直接开公开页 ===');
  const landingHtml = fs.readFileSync(path.join(FRONTEND, 'student-landing.html'), 'utf8');
  const carouselSrc = fs.readFileSync(path.join(FRONTEND, 'js/teacherCardCarousel.js'), 'utf8');

  const t11 = buildSandbox(landingHtml, BASE + '/student-landing.html?tCode=TENANT_A', {
    quiet: true,
    globals: {
      getTenantCodeParam: () => 'TENANT_A',
      termText: (k) => ({ teacher: '律师', schedule: '排期' }[k] || k),
      applyTerms: () => {},
      // 真实公开列表接口的裁剪 VO
      request: async () => ([
        { publishedProfileId: 'P1001', teacherId: 'T1001', name: '张明', title: '资深执业律师', summary: '十年诉讼经验', coverUrl: '' },
      ]),
    },
  });
  vm.runInContext(carouselSrc, t11.sandbox, { filename: 'js/teacherCardCarousel.js' });
  await t11.sandbox.renderTeacherCardCarousel('teacherCardCarousel');
  assert('卡片渲染成功（拿到 1 张）', t11.doc.querySelectorAll('#teacherCardCarousel .tc-card').length === 1,
    'count=' + t11.doc.querySelectorAll('#teacherCardCarousel .tc-card').length);

  t11.sandbox.__onTeacherCardClick(0);
  const cardTarget = t11.loc.navigations[t11.loc.navigations.length - 1] || '';
  assert('未登录点卡片打开公开页', /teacherPublishedProfile\.html/.test(cardTarget), cardTarget);
  assert('不再跳登录页', !/login\.html/.test(cardTarget), cardTarget);
  assert('带 id=<publishedProfileId>', /[?&]id=P1001/.test(cardTarget), cardTarget);

  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
