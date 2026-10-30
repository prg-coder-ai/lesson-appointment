/**
 * 回归测试：student-landing.html?tCode=TENANT_A 加载时不得跳转到 login.html
 *
 * 根因：frontend/js/public/api.js 顶层（脚本解析即执行）第 61 行 InitUserInfo();
 *       未登录时内部会 window.location.href = pageUrl('login.html')，
 *       而 student-landing.html 引入了 api.js → 公开落地页一打开就被踢到登录页。
 *
 * 判据说明：api.js 内部有独立 IIFE 自带一份 pageUrl 并 window.pageUrl = ... 覆盖全局，
 *          因此「hook window.pageUrl」无效（会假通过）。本测试改用 jsdom 的真实导航事件
 *          （jsdom 不支持真实导航，跳转时抛 "Not implemented: navigation ..."）作为判据，
 *          并用 T7 反向用例证明该判据确实能捕捉此 bug。
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const API_SRC = fs.readFileSync('frontend/js/public/api.js', 'utf8');
const LANDING_HTML = fs.readFileSync('frontend/student-landing.html', 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? ('  :: ' + extra) : '')); }
}

/**
 * 在 jsdom 中执行真实 api.js，返回是否发生「浏览器导航」
 * @param {string} url
 * @param {object} opt { publicLanding, publicPage, loggedIn, stripGuard }
 */
function runApi(url, opt) {
  opt = opt || {};
  const vc = new VirtualConsole();
  const navs = [];
  vc.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navs.push(e.message); });
  vc.on('error', () => {});

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: url,
    runScripts: 'dangerously',
    virtualConsole: vc,
  });
  const w = dom.window;

  let src = API_SRC;
  if (opt.stripGuard) {
    // 反向用例：还原为「修复前」写法（移除公开页守卫），验证本测试能捕捉该缺陷
    src = src.replace(
      "if (!isPublicPage && !window.location.pathname.endsWith('login.html')) {",
      "if (!window.location.pathname.endsWith('login.html')) {"
    );
  }

  if (opt.publicLanding) w.eval('window.__PUBLIC_LANDING__ = true;');
  if (opt.publicPage) w.eval('window.__PUBLIC_PAGE__ = true;');
  if (opt.loggedIn) w.eval("localStorage.setItem('currentUser', JSON.stringify({userId:'1',role:'student',token:'jwt-x'}));");

  let err = null;
  try { w.eval(src); } catch (e) { err = e; }

  return { navs: navs.length, err: err, w: w };
}

console.log('\n=== T1 源码不变量 ===');
assert('api.js 含 isPublicPage 判定', API_SRC.indexOf('isPublicPage') >= 0);
assert('api.js 含 __PUBLIC_LANDING__ 守卫', API_SRC.indexOf('__PUBLIC_LANDING__') >= 0);
assert('api.js 含 __PUBLIC_PAGE__ 守卫', API_SRC.indexOf('__PUBLIC_PAGE__') >= 0);
assert(
  'landing 页在 api.js 之前置 __PUBLIC_LANDING__（顺序不变量）',
  LANDING_HTML.indexOf('__PUBLIC_LANDING__') >= 0 &&
    LANDING_HTML.indexOf('__PUBLIC_LANDING__') < LANDING_HTML.indexOf('js/public/api.js')
);

console.log('\n=== T2 公开落地页：未登录加载 student-landing.html 不得导航到登录页 ===');
{
  const r = runApi('http://localhost:8080/student-landing.html?tCode=TENANT_A', { publicLanding: true });
  assert('api.js 执行无异常', !r.err, r.err && r.err.message);
  assert('未发生导航（未被踢回登录页）', r.navs === 0, 'navs=' + r.navs);
}

console.log('\n=== T3 公开落地页：__PUBLIC_PAGE__ 标记同样不导航 ===');
{
  const r = runApi('http://localhost:8080/student-landing.html?tCode=TENANT_A', { publicPage: true });
  assert('api.js 执行无异常', !r.err, r.err && r.err.message);
  assert('未发生导航', r.navs === 0, 'navs=' + r.navs);
}

console.log('\n=== T4 对照：普通页（admin.html）未登录仍须跳登录页（守卫未被过度放宽）===');
{
  const r = runApi('http://localhost:8080/admin.html', {});
  assert('发生了导航（跳登录页）', r.navs > 0, 'navs=' + r.navs);
}

console.log('\n=== T5 对照：login.html 自身未登录不导航（原有 endsWith 守卫保留）===');
{
  const r = runApi('http://localhost:8080/login.html?tCode=TENANT_A', {});
  assert('未发生导航', r.navs === 0, 'navs=' + r.navs);
}

console.log('\n=== T6 已登录访问落地页：不导航 ===');
{
  const r = runApi('http://localhost:8080/student-landing.html?tCode=TENANT_A', { publicLanding: true, loggedIn: true });
  assert('api.js 执行无异常', !r.err, r.err && r.err.message);
  assert('未发生导航', r.navs === 0, 'navs=' + r.navs);
}

console.log('\n=== T7 反向用例：去掉守卫（修复前写法）应复现「落地页被踢回登录页」===');
{
  const r = runApi('http://localhost:8080/student-landing.html?tCode=TENANT_A', { publicLanding: true, stripGuard: true });
  assert('确实发生导航（证明本测试判据有效，非恒真）', r.navs > 0, 'navs=' + r.navs);
}

console.log('\n----------------------------------------');
console.log('结果: ' + pass + '/' + (pass + fail) + ' 通过, ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
