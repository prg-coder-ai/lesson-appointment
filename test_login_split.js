const fs = require('fs');
const vm = require('vm');
const root = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/beforeRun/dist/';
const idx = fs.readFileSync(root + 'index.html', 'utf8');
const landing = fs.readFileSync(root + 'student-landing.html', 'utf8');
const login = fs.readFileSync(root + 'login.html', 'utf8');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + detail : '')); }
}

console.log('=== 字符串不变量（dist）===');
assert('login.html 承载登录表单', login.includes('login-form'));
assert('login.html 含 redirectToUserPage', login.includes('redirectToUserPage'));
assert('login.html 含 closeLoginPage', login.includes('closeLoginPage'));
assert('index 早期脚本未登录→login.html', idx.includes("location.replace('login.html')"));
assert('index 早期脚本有tCode→landing', idx.includes("location.replace('student-landing.html?tCode="));
assert('landing 登录入口指向 login.html', /login\.html/.test(landing) && !/href="index\.html"/.test(landing));

console.log('\n=== index 早期脚本跳转行为（vm 加载真实 dist 源码）===');
const m = idx.match(/<script>([\s\S]*?location\.replace[\s\S]*?)<\/script>/);
const early = m ? m[1] : '';
assert('提取 index 早期脚本块', !!early);

function runEarly(search, hasToken) {
  const store = {};
  if (hasToken) store.token = 'jwt-x'; // 模拟“已登录”：early 脚本读 localStorage.getItem('token') 判断
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  let replaced = null;
  const win = { location: { search, replace: u => { replaced = u; } }, localStorage, sanitizeTenantCode: x => x, encodeURIComponent, URLSearchParams };
  win.window = win;
  const sb = { window: win, localStorage, console, encodeURIComponent, URLSearchParams };
  sb.location = win.location;
  vm.createContext(sb);
  try { vm.runInContext(early, sb, { filename: 'early' }); } catch (e) { console.log('  [ERR] early run: ' + e.message); }
  return replaced;
}
assert('?tCode =tenant_A 未登录 → landing(干净tCode,无from)', runEarly('?tCode =tenant_A', false) === 'student-landing.html?tCode=tenant_A', runEarly('?tCode =tenant_A', false));
assert('无 tCode 未登录 → login.html', runEarly('', false) === 'login.html', runEarly('', false));
assert('带 noredirect=1 → 不跳（防循环）', runEarly('?tCode=TENANT_A&noredirect=1', false) === null);
assert('已登录 → 不跳（交 body 脚本进角色页）', runEarly('?tCode=TENANT_A', true) === null);

console.log('\n=== 真实后端（landing 展示非空）===');
(async () => {
  try {
    const r = await fetch('http://localhost:8080/api/v1/teacher/published/public-list?tenantCode=TENANT_A', { signal: AbortSignal.timeout(3000) });
    let n = -1;
    try { const j = await r.json(); n = (j && j.data && Array.isArray(j.data)) ? j.data.length : -1; } catch (e) {}
    assert('public-list 返回教师(TENANT_A) 且 >0', r.status === 200 && n > 0, 'status=' + r.status + ' n=' + n);
  } catch (e) { console.log('  [WARN] 后端不可达，跳过 public-list 断言: ' + e.message); }
  console.log('\n结果: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})();
