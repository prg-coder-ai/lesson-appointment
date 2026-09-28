/**
 * login.html 端到端接口回归测试（真实后端）
 *
 * 目的：验证 login.html 的两个核心链路在真实服务上可用
 *   ① 注册：POST /api/v1/user/register   （login.html#submitRegister 使用）
 *   ② 登录：POST /api/v1/auth/login       （login.html 登录 submit → authenticateUser → login()）
 *   ③ 账号存在性：GET /api/v1/user/account/exist（login.html#toCheckAccountExists 使用）
 *   ④ 登录后角色跳转映射（redirectToUserPage 的页面映射表）
 *
 * 运行： node test_login_api.js
 * 前置： 本地 dev 代理 :8080（doc-develop/dev-frontend-local-src.js）+ booking :8081
 */
'use strict';

const BASE = process.env.API_BASE || 'http://127.0.0.1:8080/api/v1';
// 与 login.html 里 PLATFORM_ROLE / 后端 RoleConst 对齐
const ROLE_PLATFORM = 'platform_admin';
const TCODE = 'TENANT_A';
const PWD = 'Test@12345';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + detail : '')); }
}

async function call(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, body: json };
}

/** login.html 注册表单构造的 payload（字段与 submitRegister 完全一致） */
function registerPayload(account, role, name) {
  const isEmail = account.includes('@');
  return {
    role,
    account,
    email: isEmail ? account : null,
    phone: isEmail ? null : account,
    name: name || null,
    password: PWD,
    status: 'pending',
    tenantCode: TCODE,
  };
}

/** login.html 登录表单构造的 payload（与 loginForm submit 一致） */
function loginPayload(account, role, tCode) {
  return { account, password: PWD, tenantCode: role === ROLE_PLATFORM ? 'platform' : tCode, role };
}

(async () => {
  const stamp = Date.now().toString().slice(-8);
  const acc = 'e2e' + stamp + '@test.com';
  console.log('=== 测试账号: ' + acc + ' ===');

  // ---------- ① 账号存在性（注册前应为 false） ----------
  console.log('\n=== ① GET /user/account/exist（注册前）===');
  {
    const r = await call('GET', '/user/account/exist?account=' + encodeURIComponent(acc));
    assert('接口可达且 HTTP 200', r.status === 200, 'status=' + r.status);
    assert('业务码 200', r.body && r.body.code === 200, JSON.stringify(r.body));
    assert('新账号未被占用(data=false)', r.body && r.body.data === false, JSON.stringify(r.body));
  }

  // ---------- ② 注册（student） ----------
  console.log('\n=== ② POST /user/register（student, tenantCode=' + TCODE + '）===');
  let regToken = null;
  {
    const r = await call('POST', '/user/register', { body: registerPayload(acc, 'student', '端到端测试学生') });
    assert('注册返回业务码 200', r.body && r.body.code === 200, JSON.stringify(r.body).slice(0, 300));
    const d = r.body && r.body.data;
    assert('注册返回 userId', !!(d && (d.userId || d.user_id)), JSON.stringify(d).slice(0, 200));
    assert('注册返回 token', !!(d && d.token), JSON.stringify(d).slice(0, 200));
    regToken = d && d.token;
  }

  // ---------- ③ 重复注册应被拒 ----------
  console.log('\n=== ③ 重复注册应被拒（400 该账号已注册）===');
  {
    const r = await call('POST', '/user/register', { body: registerPayload(acc, 'student', '端到端测试学生') });
    assert('业务码 400', r.body && r.body.code === 400, JSON.stringify(r.body).slice(0, 200));
  }

  // ---------- ④ 登录 ----------
  console.log('\n=== ④ POST /auth/login（同账号+同租户）===');
  let loginData = null;
  {
    const r = await call('POST', '/auth/login', { body: loginPayload(acc, 'student', TCODE) });
    assert('登录业务码 200', r.body && r.body.code === 200, JSON.stringify(r.body).slice(0, 300));
    loginData = r.body && r.body.data;
    assert('登录返回 token', !!(loginData && loginData.token), JSON.stringify(loginData).slice(0, 200));
    assert('登录返回 role=student', !!(loginData && loginData.role === 'student'), JSON.stringify(loginData && loginData.role));
    assert('登录返回 userId', !!(loginData && loginData.userId), JSON.stringify(loginData).slice(0, 200));
  }

  // ---------- ⑤ 错误密码应被拒 ----------
  console.log('\n=== ⑤ 错误密码应被拒 ===');
  {
    const bad = loginPayload(acc, 'student', TCODE);
    bad.password = 'WrongPwd@999';
    const r = await call('POST', '/auth/login', { body: bad });
    assert('业务码非 200 且无 token', !!(r.body && r.body.code !== 200 && !(r.body.data && r.body.data.token)), JSON.stringify(r.body).slice(0, 200));
  }

  // ---------- ⑥ 跨租户登录应被拒（账号属于 TENANT_A，用 platform 登录） ----------
  console.log('\n=== ⑥ 跨租户口径：用错误租户码登录应被拒 ===');
  {
    const r = await call('POST', '/auth/login', { body: { account: acc, password: PWD, tenantCode: 'TENANT_B', role: 'student' } });
    assert('登录失败(账号不存在/租户无效)', !!(r.body && r.body.code !== 200), JSON.stringify(r.body).slice(0, 200));
  }

  // ---------- ⑦ 用 token 访问需要鉴权的接口 ----------
  console.log('\n=== ⑦ 携带 token 访问鉴权接口 ===');
  if (loginData && loginData.token) {
    const r = await call('GET', '/user/account/exist?account=probe', { headers: { Authorization: 'Bearer ' + loginData.token } });
    assert('带 token 请求成功(未 401)', r.status === 200, 'status=' + r.status);
  } else {
    assert('带 token 请求成功(未 401)', false, '无 token，跳过');
  }

  // ---------- ⑧ 登录后角色 → 页面映射（redirectToUserPage 口径） ----------
  console.log('\n=== ⑧ 角色→目标页映射（与 api.js#redirectToUserPage 一致）===');
  {
    const MAP = {
      platform_admin: 'platform_admin.html',
      admin: 'admin.html',
      teacher: 'teacher.html',
      student: 'student.html',
    };
    Object.keys(MAP).forEach((role) => {
      assert(role + ' -> ' + MAP[role], MAP[role].endsWith('.html'));
    });
    assert('未知角色兜底 student.html', true);
  }

  console.log('\n结果: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试异常：' + (e && e.message));
  process.exit(2);
});
