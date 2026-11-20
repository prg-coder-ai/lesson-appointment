/**
 * 回归：Token 自动续期的四条失效路径（2026-11-20 N10 §3 的 1~4 号修复）
 *
 * 覆盖（每条都对应一个「修之前会红」的断言）：
 *   ① autoLoginCheck：access 过期不再清态、不再返回 null（A1）
 *   ② autoLoginCheck：currentUser 里的旧快照不再导致判过期（B1 的取值顺序）
 *   ③ refreshAccessTokenOnce：刷新成功后 currentUser.token 同步（B1 主路径）
 *   ④ ClassroomWS：重连现取 localStorage.token，而不是复用 connect 时的快照（C1）
 *
 * 跑法：node tests/check_token_refresh_recovery.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fail++;
    console.log('  ✗ ' + name + (detail === undefined ? '' : '  → ' + detail));
  }
}

/** 造一个不验签的 JWT，只给前端 isJwtExpired 解析 exp 用（标准 base64，atob 可解） */
function makeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
  return b64({ alg: 'HS512', typ: 'JWT' }) + '.' + b64(payload) + '.sig';
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** 静音 jsdom 的 "Not implemented: navigation" 噪音（api.js 顶层含跳转逻辑） */
function makeDom(html, url) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  vc.on('error', () => {});
  return new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: vc });
}

/** 最小 axios 替身：够 api.js / utility_request.js 初始化与保底请求用 */
function fakeAxios(opts) {
  const o = opts || {};
  const inst = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    get: () => Promise.resolve({ status: 200, data: { code: 200, data: null } }),
    post: (url) => (o.post ? o.post(url) : Promise.resolve({ status: 200, data: { code: 200, data: {} } }))
  };
  return {
    create: () => inst,
    get: inst.get,
    post: inst.post
  };
}

/* ==================== ① ② autoLoginCheck ==================== */
function testAutoLoginCheck() {
  console.log('①② autoLoginCheck：过期不再清态、快照不再误判');

  const dom = makeDom('<!doctype html><html><body></body></html>', 'https://demo.test/student.html');
  const w = dom.window;
  w.axios = fakeAxios();
  w.eval(read('frontend/js/public/api.js'));

  const expired = makeJwt({ userId: 'u1', role: 'student', exp: nowSec() - 600 });
  const fresh = makeJwt({ userId: 'u1', role: 'student', exp: nowSec() + 3600 });

  w.localStorage.setItem('token', expired);
  w.localStorage.setItem('refreshToken', 'RT-still-valid');
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'u1', role: 'student', token: expired }));

  const info = w.autoLoginCheck();
  check('过期 access 仍返回 userInfo（不再跳登录）', !!info && info.userId === 'u1', JSON.stringify(info));
  check('过期 access 不清 refreshToken（唯一能救会话的东西）',
    w.localStorage.getItem('refreshToken') === 'RT-still-valid', w.localStorage.getItem('refreshToken'));
  check('过期 access 不清 currentUser', !!w.localStorage.getItem('currentUser'));

  // ② 旧快照 + 新 token 共存：修复后不因「快照过期」清态（旧代码读快照 → 判过期 → 清态）
  // 注意：本断言验证的是「不再清态」，不是「取值优先级」——后者已被测试 ③ 间接覆盖
  // （刷新写回后两份值一致，读哪个都不过期）。
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'u1', role: 'student', token: expired }));
  w.localStorage.setItem('token', fresh);
  w.localStorage.setItem('refreshToken', 'RT2');
  const info2 = w.autoLoginCheck();
  check('快照过期但实际 token 有效时不清理会话',
    !!info2 && w.localStorage.getItem('refreshToken') === 'RT2', JSON.stringify(info2));

  // 真无会话仍然要清（这条不能被上面的修复带歪）
  w.localStorage.removeItem('token');
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'u1', role: 'student', token: '' }));
  const info3 = w.autoLoginCheck();
  check('确实没有 token 时仍按未登录处理', !info3, JSON.stringify(info3));

  dom.window.close();
}

/* ==================== ③ refreshAccessTokenOnce ==================== */
async function testRefreshSyncsCurrentUser() {
  console.log('③ refreshAccessTokenOnce：刷新后 currentUser.token 同步');

  const dom = makeDom('<!doctype html><html><body></body></html>', 'https://demo.test/student.html');
  const w = dom.window;
  let posted = 0;
  w.axios = fakeAxios({
    post: () => {
      posted++;
      return Promise.resolve({
        status: 200,
        data: { code: 200, data: { token: 'NEW-TOKEN', refreshToken: 'NEW-RT' } }
      });
    }
  });
  w.eval(read('frontend/js/public/utility_request.js'));

  check('对外暴露 refreshAccessTokenOnce', typeof w.refreshAccessTokenOnce === 'function');

  w.localStorage.setItem('token', 'OLD-TOKEN');
  w.localStorage.setItem('refreshToken', 'OLD-RT');
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'u1', role: 'student', token: 'OLD-TOKEN' }));

  const t = await w.refreshAccessTokenOnce();
  check('返回新 access token', t === 'NEW-TOKEN', String(t));
  check('localStorage.token 已更新', w.localStorage.getItem('token') === 'NEW-TOKEN', w.localStorage.getItem('token'));
  check('localStorage.refreshToken 已轮换', w.localStorage.getItem('refreshToken') === 'NEW-RT', w.localStorage.getItem('refreshToken'));

  const cur = JSON.parse(w.localStorage.getItem('currentUser') || '{}');
  check('currentUser.token 同步为新值（B1 核心，修前一直是旧值）', cur.token === 'NEW-TOKEN', JSON.stringify(cur));
  check('刷新只打一次刷新接口', posted === 1, String(posted));

  dom.window.close();
}

/* ==================== ④ ClassroomWS 重连取新 token ==================== */
function testWsUsesFreshToken() {
  console.log('④ ClassroomWS：重连现取 localStorage.token');

  const dom = makeDom('<!doctype html><html><body></body></html>', 'https://demo.test/classroom.html');
  const w = dom.window;
  const urls = [];
  function FakeWS(url) {
    urls.push(url);
    this.readyState = 1;
    this.send = function () {};
    this.close = function () {};
  }
  FakeWS.OPEN = 1;
  FakeWS.CONNECTING = 0;
  w.WebSocket = FakeWS;

  w.eval(read('frontend/js/public/classroom-ws.js'));
  check('导出 ClassroomWS', !!w.ClassroomWS);

  // 直接铺一个会话，跳过 connect（避免心跳定时器挂住进程）
  w.ClassroomWS._sessions['sid-1'] = {
    token: 'STALE-TOKEN',            // connect 时的旧快照
    base: 'ws://demo.test/ws/classrooms/sid-1',
    traceId: 'trace-1',
    handlers: {},
    sockets: {},
    retryTimers: {},
    attempts: {},
    hbTimer: null,
    allOpen: false,
    closedByUser: false
  };

  w.localStorage.setItem('token', 'FRESH-TOKEN');
  w.ClassroomWS._openChannel('sid-1', 'signal');

  const last = urls[urls.length - 1] || '';
  check('重连 URL 带最新 token（修前带 STALE-TOKEN）',
    last.indexOf('access_token=FRESH-TOKEN') >= 0, last);
  check('重连 URL 不带旧快照', last.indexOf('STALE-TOKEN') < 0, last);

  // 取不到 localStorage（隐私模式）时沿用旧值，不能把 token 变成 empty
  const dom2 = makeDom('<!doctype html><html><body></body></html>', 'https://demo.test/classroom.html');
  const w2 = dom2.window;
  const urls2 = [];
  function FakeWS2(url) { urls2.push(url); this.readyState = 1; this.send = function () {}; this.close = function () {}; }
  FakeWS2.OPEN = 1;
  w2.WebSocket = FakeWS2;
  w2.eval(read('frontend/js/public/classroom-ws.js'));
  w2.ClassroomWS._sessions['sid-2'] = {
    token: 'KEEP-ME', base: 'ws://demo.test/ws/classrooms/sid-2', traceId: 't2',
    handlers: {}, sockets: {}, retryTimers: {}, attempts: {}, hbTimer: null,
    allOpen: false, closedByUser: false
  };
  w2.ClassroomWS._openChannel('sid-2', 'signal');
  check('localStorage 无 token 时沿用会话里的旧值（不清空）',
    (urls2[urls2.length - 1] || '').indexOf('access_token=KEEP-ME') >= 0, urls2[urls2.length - 1]);

  dom.window.close();
  dom2.window.close();
}

/* ==================== ⑤ 登录成功分支：refreshToken 必须落盘且不被覆盖 ==================== */
/**
 * 2026-11-20 实测发现（N10 §3.1 6 号）：
 * login.html 密码登录成功分支曾在 auth.js 写完 refreshToken 之后，紧跟一行
 *   localStorage.setItem('refreshToken', user.refreshToken || '')
 * 而 user 是 authenticateUser 返回的 currentUser 快照（不含 refreshToken）
 * → 每次登录都把刚写好的凭证覆盖成空串，1 小时后刷新报「刷新凭证为空」直接掉线。
 *
 * 这里两条防线：
 *   ① 源码级：登录/推广会话落地处不得再出现 `|| ''` 这种"没有就写空串"的写法；
 *   ② 行为级：authenticateUser 走完一遍，localStorage.refreshToken 必须等于后端下发的值。
 */
function codeLines(src) {
  return src.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}

async function testLoginPersistsRefreshToken() {
  console.log('⑤ 登录成功分支：refreshToken 落盘且不被覆盖');

  // ① 源码级：扒掉注释后再匹配，避免把「反例说明」当成真代码
  const emptyOverwrite = /setItem\(\s*['"]refreshToken['"]\s*,[^)]*\|\|\s*''\s*\)/;
  const loginCode = codeLines(read('frontend/login.html')).filter((l) => emptyOverwrite.test(l));
  check('login.html 无 `setItem(\'refreshToken\', x || \'\')` 覆盖写法',
    loginCode.length === 0, JSON.stringify(loginCode));

  const promoCode = codeLines(read('frontend/js/public/promo.js'))
    .filter((l) => /writeStorage\(\s*['"]refreshToken['"]\s*,[^)]*\|\|\s*''\s*\)/.test(l));
  check('promo.js 同样不写空串', promoCode.length === 0, JSON.stringify(promoCode));

  // ② 行为级：authenticateUser 内部 saveCurrentUserSession 是唯一落盘点
  const dom = makeDom('<!doctype html><html><body></body></html>', 'https://demo.test/login.html');
  const w = dom.window;
  const resp = {
    userId: 'u-rt', account: 'acc', name: '名字', role: 'student',
    tenantCode: 't-code', token: 'ACCESS-TOKEN', refreshToken: 'REFRESH-EYJ-VALUE'
  };
  // auth.js 顶层要求 window.request 存在；login() 就是 request({url:'/auth/login'})
  w.request = () => Promise.resolve(resp);
  w.eval(read('frontend/js/public/auth.js'));

  let session = null;
  try {
    session = await w.authenticateUser('acc', 'pwd');
  } catch (e) {
    check('authenticateUser 登录不抛错', false, String(e));
  }
  check('localStorage.refreshToken = 后端下发值（不是空串）',
    w.localStorage.getItem('refreshToken') === 'REFRESH-EYJ-VALUE',
    JSON.stringify(w.localStorage.getItem('refreshToken')));
  check('localStorage.token 同时落盘',
    w.localStorage.getItem('token') === 'ACCESS-TOKEN',
    JSON.stringify(w.localStorage.getItem('token')));
  check('currentUser 快照仍然不带 refreshToken（不扩大 XSS 面）',
    !!session && session.refreshToken === undefined, JSON.stringify(session));
  check('落盘的 currentUser JSON 里也不含 refreshToken',
    (w.localStorage.getItem('currentUser') || '').indexOf('REFRESH-EYJ-VALUE') < 0,
    w.localStorage.getItem('currentUser'));

  dom.window.close();
}

/* ==================== 主流程 ==================== */
(async function main() {
  testAutoLoginCheck();
  await testRefreshSyncsCurrentUser();
  testWsUsesFreshToken();
  await testLoginPersistsRefreshToken();

  console.log('\n共 ' + (pass + fail) + ' 项：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试执行异常：', e);
  process.exit(1);
});
