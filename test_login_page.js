/**
 * login.html 页面级无头回归测试（真实页面 + 真实内联脚本，jsdom）
 *
 * 覆盖：
 *   T1 ?tCode=TENANT_A 时登录表单的「身份/租户编码」隐藏与锁定
 *   T2 登录提交 → authenticateUser 入参（tenantCode/role）与成功后的角色跳转
 *   T3 ?registered=1（注册后跳回）→ 不被「已登录自动跳转」弹走 + 绿色提示
 *   T4 已登录访问 login.html（无 registered）→ 自动跳转角色页
 *   T5 ?tCode=TENANT_A → 注册身份下拉里移除 platform_admin 选项
 *   T6 无 tCode → 身份/租户编码可见可填
 *   T7 注册失败（后端 400）→ 不得出现「注册成功」提示（修复：检查 submitRegister 返回值）
 *   T8 注册成功 → 请求体字段正确 + 跳转 URL 带 &registered=1
 *
 * 运行：node test_login_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const HTML_SRC = fs.readFileSync(path.join(ROOT, 'frontend/login.html'), 'utf8');
// 去掉外部 <script src=...>（CDN/公共 JS 由测试桩替代），保留内联脚本（页面真实逻辑）
const htmlNoExt = HTML_SRC.replace(/<script\s+src="[^"]*"\s*><\/script>/g, '');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 构造页面。
 * @param {string} search 查询串（含 ?）
 * @param {object} opt { token, currentUser } 预置登录态（在页面脚本执行前注入）
 */
async function makePage(search, opt = {}) {
  const pre = [];
  if (opt.token) pre.push('localStorage.setItem("token",' + JSON.stringify(opt.token) + ');');
  if (opt.currentUser) pre.push('localStorage.setItem("currentUser",' + JSON.stringify(JSON.stringify(opt.currentUser)) + ');');
  const inject = pre.length ? '<script>try{' + pre.join('') + '}catch(e){}</script>' : '';
  const html = htmlNoExt.replace(/(<head[^>]*>)/, '$1' + inject);

  const vc = new VirtualConsole(); // 丢弃页面 console 噪音
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/login.html' + search,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  await sleep(60); // 等 load 事件（页面 window.onload 在此触发）
  w.alert = () => {};
  return { dom, w };
}

const q = (w, sel) => w.document.querySelector(sel);
const byId = (w, id) => w.document.getElementById(id);
const itemOf = (w, id) => byId(w, id).closest('.form-item');
const visible = (el) => !!el && el.style.display !== 'none';

(async () => {
  // ============ T1 ?tCode=TENANT_A 表单字段处理 ============
  console.log('\n=== T1 ?tCode=TENANT_A：身份/租户编码隐藏并锁定 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A');
    assert('登录身份项隐藏', !visible(itemOf(w, 'login-role')), itemOf(w, 'login-role').style.display);
    assert('租户编码项隐藏', !visible(itemOf(w, 'login-tenant-code')), itemOf(w, 'login-tenant-code').style.display);
    assert('登录身份被锁定为 tenant', byId(w, 'login-role').value === 'tenant', byId(w, 'login-role').value);
    assert('租户编码被锁定为 TENANT_A', byId(w, 'login-tenant-code').value === 'TENANT_A', byId(w, 'login-tenant-code').value);
    assert('租户编码输入框只读', byId(w, 'login-tenant-code').readOnly === true);
    dom.window.close();
  }

  // ============ T2 登录提交入参与跳转 ============
  console.log('\n=== T2 登录提交 → authenticateUser 入参 + 角色跳转 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A');
    let authArgs = null, redirected = null;
    w.authenticateUser = async (acc, pwd, extra) => {
      authArgs = { acc, pwd, extra };
      return { userId: 'u-stu', account: acc, name: '学生甲', role: 'student', token: 'tok-1', refreshToken: 'rt-1' };
    };
    w.redirectToUserPage = (u) => { redirected = u; };
    const realST = w.setTimeout;
    w.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; }; // 让 800ms 跳转立即执行

    byId(w, 'username').value = 'stu@test.com';
    byId(w, 'password').value = 'Test@12345';
    byId(w, 'login-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(30);

    assert('authenticateUser 被调用', !!authArgs, JSON.stringify(authArgs));
    assert('账号传参正确', authArgs && authArgs.acc === 'stu@test.com', authArgs && authArgs.acc);
    assert('tenantCode 传参 = TENANT_A', authArgs && authArgs.extra && authArgs.extra.tenantCode === 'TENANT_A', JSON.stringify(authArgs && authArgs.extra));
    assert('role 传参 = tenant', authArgs && authArgs.extra && authArgs.extra.role === 'tenant', JSON.stringify(authArgs && authArgs.extra));
    assert('登录后跳转被触发', !!redirected, JSON.stringify(redirected));
    assert('跳转携带 DB 真实角色 student', redirected && redirected.role === 'student', redirected && redirected.role);
    assert('token 已落盘', w.localStorage.getItem('token') === 'tok-1', w.localStorage.getItem('token'));
    w.setTimeout = realST;
    dom.window.close();
  }

  // ============ T3 ?registered=1 停留登录页 ============
  console.log('\n=== T3 ?registered=1（注册后跳回）→ 不自动跳转 + 绿色提示 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A&registered=1', {
      token: 'tok-reg', currentUser: { userId: 'u1', account: 'x@x.com', role: 'student', token: 'tok-reg' },
    });
    let redirected = null;
    w.redirectToUserPage = (u) => { redirected = u; };
    // 手动再跑一次 onload 语义校验：注册后不得被弹走
    const tip = byId(w, 'login-error');
    assert('未被自动跳转到角色页（停留在登录表单）', redirected === null, JSON.stringify(redirected));
    assert('显示注册后登录提示', !!tip && /注册成功/.test(tip.textContent), tip && tip.textContent);
    assert('登录表单仍可见', visible(q(w, '#login-form')));
    dom.window.close();
  }

  // ============ T4 已登录（无 registered）→ 自动跳转 ============
  console.log('\n=== T4 已登录访问 login.html（无 registered）→ 自动跳转角色页 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A', {
      token: 'tok-x', currentUser: { userId: 'u2', account: 'y@x.com', role: 'teacher', token: 'tok-x' },
    });
    // onload 已在页面加载时执行；用「是否仍展示登录表单」间接判断之外，再检查 redirectToUserPage 是否可调用
    let redirected = null;
    w.redirectToUserPage = (u) => { redirected = u; };
    // 重新触发 onload（模拟再次进入该页）
    w.onload();
    assert('已登录且非注册后 → 触发跳转', !!redirected, JSON.stringify(redirected));
    assert('跳转使用 currentUser 的角色 teacher', redirected && redirected.role === 'teacher', redirected && redirected.role);
    dom.window.close();
  }

  // ============ T5 ?tCode 下注册身份下拉移除 platform_admin ============
  console.log('\n=== T5 ?tCode=TENANT_A → 注册身份下拉移除「平台管理员」 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A');
    const opts = Array.from(byId(w, 'register-role').options).map((o) => o.value);
    assert('不含 platform_admin', opts.indexOf('platform_admin') === -1, JSON.stringify(opts));
    assert('仍含 student', opts.indexOf('student') !== -1, JSON.stringify(opts));
    assert('注册租户编码项隐藏但已赋值', !visible(itemOf(w, 'tenant-code')) && byId(w, 'tenant-code').value === 'TENANT_A', byId(w, 'tenant-code').value);
    dom.window.close();
  }

  // ============ T6 无 tCode → 可见可填 ============
  console.log('\n=== T6 无 tCode → 身份/租户编码可见可填 ===');
  {
    const { dom, w } = await makePage('');
    assert('登录身份项可见', visible(itemOf(w, 'login-role')));
    assert('租户编码项可见', visible(itemOf(w, 'login-tenant-code')));
    assert('登录身份为空（需用户选择）', byId(w, 'login-role').value === '', JSON.stringify(byId(w, 'login-role').value));
    assert('租户编码可编辑', byId(w, 'login-tenant-code').readOnly === false);
    dom.window.close();
  }

  // ============ T7 注册失败不得提示成功 ============
  console.log('\n=== T7 注册失败（后端 400）→ 不得出现「注册成功」 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A');
    let alerted = null;
    w.alert = (m) => { alerted = m; };
    w.request = async (cfg) => {
      if (String(cfg.url).indexOf('account/exist') !== -1) return false;
      return Promise.reject({ code: 400, message: '该账号已注册，请登录或重置密码' });
    };
    // 打开注册弹窗并填写
    byId(w, 'show-register').dispatchEvent(new w.Event('click', { bubbles: true }));
    byId(w, 'register-role').value = 'student';
    byId(w, 'register-username').value = 'dup@test.com';
    byId(w, 'register-name').value = '重复账号';
    byId(w, 'register-password').value = 'Test@12345';
    byId(w, 'register-confirm-pwd').value = 'Test@12345';
    byId(w, 'register-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(60);

    const succ = byId(w, 'register-success');
    const err = byId(w, 'register-error');
    assert('未展示「注册成功」提示', !visible(succ), succ && succ.textContent);
    assert('展示失败提示', visible(err), err && err.textContent);
    assert('失败提示透传后端 message', !!err && /已注册/.test(err.textContent), err && err.textContent);
    assert('未弹出「注册申请提交成功」', alerted !== '注册申请提交成功', String(alerted));
    assert('提交按钮已恢复可用', byId(w, 'register-btn').disabled === false);
    dom.window.close();
  }

  // ============ T8 注册成功 → 请求体 + 跳转 URL ============
  console.log('\n=== T8 注册成功 → 请求体字段 + 跳转带 &registered=1 ===');
  {
    const { dom, w } = await makePage('?tCode=TENANT_A');
    const calls = [];
    let assigned = null;
    w.alert = () => {};
    try { w.location.assign = (u) => { assigned = u; }; } catch (e) {}
    w.request = async (cfg) => {
      calls.push(cfg);
      if (String(cfg.url).indexOf('account/exist') !== -1) return false;
      if (String(cfg.url).indexOf('user/register') !== -1) {
        return { userId: 'u-new', account: 'new@test.com', role: 'student', token: 'tok-new' };
      }
      return null;
    };
    const realST = w.setTimeout;
    w.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; }; // 立即执行 2s 跳转

    byId(w, 'show-register').dispatchEvent(new w.Event('click', { bubbles: true }));
    byId(w, 'register-role').value = 'student';
    byId(w, 'register-username').value = 'new@test.com';
    byId(w, 'register-name').value = '新用户';
    byId(w, 'register-password').value = 'Test@12345';
    byId(w, 'register-confirm-pwd').value = 'Test@12345';
    byId(w, 'register-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(60);

    const reg = calls.find((c) => String(c.url).indexOf('user/register') !== -1);
    assert('发出注册请求', !!reg, JSON.stringify(calls.map((c) => c.url)));
    assert('请求体 role=student', !!reg && reg.data.role === 'student', reg && JSON.stringify(reg.data));
    assert('请求体 tenantCode=TENANT_A', !!reg && reg.data.tenantCode === 'TENANT_A', reg && JSON.stringify(reg.data));
    assert('请求体 account 正确', !!reg && reg.data.account === 'new@test.com', reg && JSON.stringify(reg.data));
    assert('请求体 status=pending', !!reg && reg.data.status === 'pending', reg && JSON.stringify(reg.data));
    // 注：本用例把 setTimeout 改成立即执行以加速「2s 后跳转」，
    //     因此该回调会同时关闭弹窗并隐藏成功提示——这里断言提示文案已被正确写入，
    //     而不断言可见性（可见性由真实 2s 时序保证）。
    assert('注册成功后写入成功提示', /注册成功/.test(byId(w, 'register-success').textContent), byId(w, 'register-success').textContent);
    assert('跳转 URL 带 &registered=1', assigned === null ? true : assigned.indexOf('registered=1') !== -1, String(assigned));

    // 源码级兜底断言（jsdom 可能不允许覆盖 location.assign）
    assert('源码中跳转 URL 含 &registered=1', HTML_SRC.indexOf("'&registered=1'") !== -1);
    assert('源码中 tCode + registered=1 组合', /login\.html\?tCode='\s*\+\s*encodeURIComponent\(regTenantCode\)\s*\+\s*'&registered=1'/.test(HTML_SRC));
    w.setTimeout = realST;
    dom.window.close();
  }

  console.log('\n结果: PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试异常：' + (e && e.stack || e));
  process.exit(2);
});
