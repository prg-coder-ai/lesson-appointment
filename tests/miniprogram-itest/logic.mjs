// 小程序核心逻辑冒烟测试（无浏览器 / 无真后端）：
// 把真实的 miniprogram/core + miniprogram/shared 拷为 ESM 副本加载，
// 用 mocked wx + 可控 request 路由跑通「非微信」的全部功能路径，
// 并断言：全程从未触达 /auth/wechat-login、/auth/bind-wechat（按用户要求排除微信登录/绑定）。
// 仅测试，不修改任何产品文件。
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = resolve(fileURLToPath(import.meta.url), '../../../miniprogram');
const SUT = join(dirname(fileURLToPath(import.meta.url)), '_sut');
mkdirSync(SUT, { recursive: true });
cpSync(join(SRC, 'core'), join(SUT, 'core'), { recursive: true });
cpSync(join(SRC, 'shared'), join(SUT, 'shared'), { recursive: true });
writeFileSync(join(SUT, 'package.json'), '{"type":"module"}');

// ---- mocked wx runtime ----
const store = new Map();
const reLaunches = [];
let authFails = 0;
let wechatHit = false;
const calls = [];

const LOGIN_PAYLOAD = { token: 'T1', refreshToken: 'R1', userId: 'u1', account: 'stu1', name: '学生一', role: 'student', tenantCode: 'tA' };
const SERVER_TERM = { teacher: '授课老师(tenant)', course: '科目(tenant)' };

function route(url, method) {
  if (url.includes('/api/v1/auth/login')) return { status: 200, body: { code: 200, message: 'ok', data: LOGIN_PAYLOAD } };
  if (url.includes('/api/v1/term/map')) return { status: 200, body: { code: 200, data: SERVER_TERM } };
  if (url.includes('/api/v1/tenant/industry')) return { status: 200, body: { code: 200, data: { industryCode: 'legal' } } };
  if (url.includes('/api/v1/users/') && url.includes('/inbox')) return { status: 200, body: { code: 200, data: { list: [{ id: 'm1', title: '标题', content: 'hello world' }], total: 1, pageNum: 1, pageSize: 15 } } };
  if (url.includes('/test/401')) return { status: 401, body: { code: 401, message: 'unauthorized' } };
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
    calls.push({ url: cfg.url, method: cfg.method, auth: !!(cfg.header && cfg.header.Authorization) });
    if (cfg.url.includes('wechat-login') || cfg.url.includes('bind-wechat')) wechatHit = true;
    const r = route(cfg.url, cfg.method);
    if (r.fail) { cfg.fail && cfg.fail({ errMsg: 'mock' }); return; }
    cfg.success({ statusCode: r.status, data: r.body });
  }
};
globalThis.getApp = () => ({ globalData: { apiBase: 'http://t', msgBase: 'http://t', onAuthFail: () => { authFails++; } } });

// ---- load real modules ----
const req = await import(pathToFileURL(join(SUT, 'core/request.js')).href);
const { storage, getSession, setSession, clearSession, getToken } = await import(pathToFileURL(join(SUT, 'core/storage.js')).href);
const auth = await import(pathToFileURL(join(SUT, 'core/auth.js')).href);
const term = await import(pathToFileURL(join(SUT, 'core/term.js')).href);
const msg = await import(pathToFileURL(join(SUT, 'core/message.js')).href);
const acq = await import(pathToFileURL(join(SUT, 'core/acquisition.js')).href);
const terms = await import(pathToFileURL(join(SUT, 'shared/terms.js')).href);
const consts = await import(pathToFileURL(join(SUT, 'shared/constants.js')).href);

// ---- assertion harness ----
const results = [];
function ck(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const callOf = (sub) => calls.find(c => c.url.includes(sub));

// 1) storage session roundtrip
clearSession();
setSession({ token: 'X', userId: 'u1', role: 'student' });
ck('storage.setSession/getSession 往返', getSession() && getSession().userId === 'u1' && getToken() === 'X');
clearSession();
ck('storage.clearSession 清空', getSession() === null && getToken() === '');

// 2) requireAuth 无会话 -> 延后 reLaunch，返回 null
clearSession();
reLaunches.length = 0;
const ra = auth.requireAuth();
await sleep(10);
ck('requireAuth(无会话) 返回 null', ra === null);
ck('requireAuth(无会话) 延后 reLaunch 登录页', reLaunches.includes('/pages/login/login'));

// 3) requireAuth 有会话 -> 返回 user，不 reLaunch
setSession({ token: 'X', userId: 'u1', role: 'student' });
reLaunches.length = 0;
const rb = auth.requireAuth();
await sleep(5);
ck('requireAuth(有会话) 返回 user', rb && rb.userId === 'u1');
ck('requireAuth(有会话) 不再 reLaunch', reLaunches.length === 0);

// 4) isRoleTenantCodeMatch 纯逻辑
ck('角色/租户匹配 platform_admin+platform', auth.isRoleTenantCodeMatch('platform_admin', 'platform') === true);
ck('角色/租户匹配 platform_admin+租户=false', auth.isRoleTenantCodeMatch('platform_admin', 'tA') === false);
ck('角色/租户匹配 student+租户=true', auth.isRoleTenantCodeMatch('student', 'tA') === true);
ck('角色/租户匹配 student+platform=false', auth.isRoleTenantCodeMatch('student', 'platform') === false);

// 5) login 全流程（密码登录，mock 后端）
clearSession();
calls.length = 0;
const loginRes = await auth.login({ tenantCode: 'tA', account: 'stu1', password: 'p', role: 'student' });
ck('login 成功返回 token', loginRes && loginRes.token === 'T1');
ck('login 写登录态', getSession() && getToken() === 'T1');
ck('login 调用 /api/v1/auth/login', !!callOf('/api/v1/auth/login'));
ck('login 触发 loadTermMap(/term/map)', !!callOf('/api/v1/term/map'));
ck('login 触发 syncIndustryFromTenant(/tenant/industry)', !!callOf('/api/v1/tenant/industry'));
// term/map 必须 tokenOnly（不带 Bearer）——这是 401 修复的客户端前提
ck('term/map 请求不带 Authorization(tokenOnly)', callOf('/api/v1/term/map').auth === false);
// 服务端词表覆盖 + 行业切换生效
ck('服务端词表覆盖 term(teacher)', term.term('teacher') === '授课老师(tenant)');
ck('行业切换生效 term(student)=咨询者(legal)', term.term('student') === '咨询者');

// 6) goHome 按角色跳首页
reLaunches.length = 0;
auth.goHome();
ck('goHome(student) -> /package-student/home/home', reLaunches.includes('/package-student/home/home'));

// 7) loadTermMap 仅在 token 存在时发请求（无 token 直接 return）
clearSession();
calls.length = 0;
await term.loadTermMap();
ck('loadTermMap(无 token) 不发请求', calls.length === 0);

// 8) terms 纯函数多行业兜底
ck("termText(teacher,education)=教师", terms.termText('teacher', { industry: 'education' }) === '教师');
ck("termText(teacher,legal)=律师", terms.termText('teacher', { industry: 'legal' }) === '律师');
ck("termText(student,counseling)=来访者", terms.termText('student', { industry: 'counseling' }) === '来访者');
ck('termText 未知 key 回退原 key', terms.termText('zzz', { industry: 'education' }) === 'zzz');

// 9) constants 角色映射
ck('homePageForRole(student)', consts.homePageForRole('student') === '/package-student/home/home');
ck('homePageForRole(platform_admin)', consts.homePageForRole('platform_admin') === '/package-admin/home/home');
ck('tabGroupForRole(teacher)=teacher', consts.tabGroupForRole('teacher') === 'teacher');
ck('tabGroupForRole(platform_admin)=admin', consts.tabGroupForRole('platform_admin') === 'admin');
ck('roleLabel(student)=学生', consts.roleLabel('student') === '学生');

// 10) message 收件箱（mock 后端）
setSession({ token: 'T1', userId: 'u1', role: 'student' });
const inbox = await msg.getInbox('u1', { pageNum: 1, pageSize: 15 });
ck('getInbox 返回列表', inbox && Array.isArray(inbox.list) && inbox.list.length === 1);
ck('previewText 截断', msg.previewText(inbox.list[0]) === 'hello world');
ck('fmtTime(0) 空串', msg.fmtTime(0) === '');
ck('fmtTime(时间戳) 格式', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(msg.fmtTime(Date.now())));

// 11) acquisition 首次触达不覆盖
store.delete('attribution');
acq.captureAttribution({ inviter: 'A', source: 'share' });
acq.captureAttribution({ inviter: 'B', source: 'ad' });
const attr = store.get('attribution');
ck('归因 首次触达 inviter 不被覆盖', attr && attr.inviter === 'A');
ck('归因 source 保留', attr && attr.source === 'share');

// 12) 401 通用处理（非微信）：清会话 + 触发 onAuthFail（验证 request 层健壮，非微信路径）
clearSession();
setSession({ token: 'OLD', userId: 'u1', role: 'student' });
authFails = 0;
let threw = false;
try { await req.request({ url: '/test/401', method: 'GET', tokenOnly: false }); } catch (e) { threw = true; }
ck('401 请求 rejected', threw === true);
ck('401 触发 onAuthFail', authFails === 1);
ck('401 后本地会话被清', getToken() === '');

// 13) 微信路径排除断言（核心约束）
ck('全程未触达 /auth/wechat-login', !callOf('/auth/wechat-login') && !wechatHit);
ck('全程未触达 /auth/bind-wechat', !callOf('/auth/bind-wechat') && !wechatHit);
ck('wechatSilentLogin/bindWechat 导出存在但本轮未调用', typeof auth.wechatSilentLogin === 'function' && typeof auth.bindWechat === 'function');

// ---- report ----
const bad = results.filter(r => !r.ok);
for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  -> ' + r.detail));
console.log(`\n==== LOGIC: ${results.length - bad.length} PASS / ${bad.length} FAIL ====`);
process.exit(bad.length ? 1 : 0);
