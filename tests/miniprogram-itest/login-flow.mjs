// 聚焦测试：密码登录全流程（修复"登录后不跳转 + 仍有 wechat-login 调用"）
// 用真实 core/auth.js + core/request.js + core/term.js + core/storage.js（ESM 副本 + mocked wx）。
// 两个场景：
//   A. 后端正常（term/map 返回 200）
//   B. 极端：term/map 返回 401（模拟未部署 401 修复的旧后端）——验证公开接口 401 不再清登录态/跳登录页
// 并断言：登录后能正确 reLaunch 到分包首页；全程不发 /auth/wechat-login。
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = resolve(fileURLToPath(import.meta.url), '../../../miniprogram');
const SUT = join(dirname(fileURLToPath(import.meta.url)), '_sut_login');
mkdirSync(SUT, { recursive: true });
cpSync(join(SRC, 'core'), join(SUT, 'core'), { recursive: true });
cpSync(join(SRC, 'shared'), join(SUT, 'shared'), { recursive: true });
writeFileSync(join(SUT, 'package.json'), '{"type":"module"}');

let TERM_MAP_STATUS = 200;
const store = new Map();
const reLaunches = [];
let authFails = 0;
let wechatHit = false;
const calls = [];
const LOGIN_PAYLOAD = { token: 'T1', refreshToken: 'R1', userId: 'u1', account: 'stu1', name: '学生一', role: 'student', tenantCode: 'tA' };

function route(url) {
  if (url.includes('/api/v1/auth/login')) return { status: 200, body: { code: 200, message: 'ok', data: LOGIN_PAYLOAD } };
  if (url.includes('/api/v1/term/map')) return TERM_MAP_STATUS === 200
    ? { status: 200, body: { code: 200, data: { teacher: '授课老师' } } }
    : { status: 401, body: { code: 401, message: 'unauthorized' } };
  if (url.includes('/api/v1/tenant/industry')) return { status: 200, body: { code: 200, data: { industryCode: 'legal' } } };
  return { status: 200, body: { code: 200, data: {} } };
}
globalThis.wx = {
  getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
  setStorageSync: (k, v) => store.set(k, v),
  removeStorageSync: (k) => store.delete(k),
  clearStorageSync: () => store.clear(),
  showToast: () => {},
  reLaunch: (o) => reLaunches.push(o.url),
  navigateTo: () => {},
  login: (o) => o && o.success && o.success({ code: 'FAKECODE' }),
  request: (cfg) => {
    calls.push({ url: cfg.url, auth: !!(cfg.header && cfg.header.Authorization) });
    if (cfg.url.includes('wechat-login') || cfg.url.includes('bind-wechat')) wechatHit = true;
    const r = route(cfg.url);
    cfg.success({ statusCode: r.status, data: r.body });
  }
};
globalThis.getApp = () => ({ globalData: { apiBase: 'http://t', msgBase: 'http://t', onAuthFail: () => { authFails++; } } });

const { getToken, clearSession } = await import(pathToFileURL(join(SUT, 'core/storage.js')).href);
const auth = await import(pathToFileURL(join(SUT, 'core/auth.js')).href);
const term = await import(pathToFileURL(join(SUT, 'core/term.js')).href);

const results = [];
const ck = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const callOf = (sub) => calls.find(c => c.url.includes(sub));

// ---- 场景 A：term/map 200（正常后端）----
TERM_MAP_STATUS = 200;
clearSession(); calls.length = 0; reLaunches.length = 0; authFails = 0; wechatHit = false;
const resA = await auth.login({ tenantCode: 'tA', account: 'stu1', password: 'p', role: 'student' });
ck('A: login 返回 token', resA && resA.token === 'T1');
ck('A: 登录态写入', getToken() === 'T1');
ck('A: term/map 用 tokenOnly(不带 Bearer)', callOf('/api/v1/term/map').auth === false);
reLaunches.length = 0;
auth.goHome();
ck('A: goHome -> /package-student/home/home', reLaunches.includes('/package-student/home/home'));
ck('A: 未发 wechat-login', !wechatHit && !callOf('/auth/wechat-login'));

// ---- 场景 B：term/map 返回 401（公开接口 401 不应踢登录/清会话）----
TERM_MAP_STATUS = 401;
clearSession(); calls.length = 0; reLaunches.length = 0; authFails = 0; wechatHit = false;
const resB = await auth.login({ tenantCode: 'tA', account: 'stu1', password: 'p', role: 'student' });
ck('B: login 仍成功返回 token（未被 401 中断）', resB && resB.token === 'T1');
ck('B: 登录态保留（tokenOnly 401 不清 session）', getToken() === 'T1');
ck('B: 未触发 onAuthFail（未跳登录页）', authFails === 0);
reLaunches.length = 0;
auth.goHome();
ck('B: goHome -> /package-student/home/home（登录后正确跳转）', reLaunches.includes('/package-student/home/home'));
ck('B: 未发 wechat-login', !wechatHit && !callOf('/auth/wechat-login'));

// ---- 场景 C：微信静默登录不在密码登录流程中自动触发 ----
ck('C: wechatSilentLogin 导出存在', typeof auth.wechatSilentLogin === 'function');
ck('C: 全流程未触达 wechat-login/bind-wechat', !callOf('/auth/wechat-login') && !callOf('/auth/bind-wechat'));

const bad = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + r.detail));
console.log(`\n==== LOGIN-FLOW: ${results.length - bad.length} PASS / ${bad.length} FAIL ====`);
process.exit(bad.length ? 1 : 0);
