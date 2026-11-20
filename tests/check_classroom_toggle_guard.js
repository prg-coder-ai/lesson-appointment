/**
 * 回归：课堂开关的「显隐 / 守卫 / 平台端状态列」（2026-11-20 三处修订）
 *
 * 覆盖（每条都对应一个「修之前会红」的断言）：
 *   ① guardClassroom：本标签页还没核对过配置时不再直接踢人（修前 hasClassroom()=false 即跳走，
 *      把刚开通/缓存为空的用户误踢出课堂——与"课堂菜单消失"是同一类误判）
 *   ② guardClassroom：核对后明确未开通 → 退回角色首页；明确开通 → 留下
 *   ③ guardClassroom：拿不到配置（网络/未登录）不踢人，交给页面自身守卫
 *   ④ classroom-prep.js：入口先 ensureClassroomConfig 再 guardClassroom（修前完全不看开关，
 *      未开通租户拿到历史链接仍能打开设备检测页，点「进入课堂」才被 8092 403 拦住）
 *   ⑤ 平台端租户列表：表头有「课堂」列、列数与行模板 td 数一致、三态文案齐全
 *
 * 为什么用 vm 而不是 jsdom：jsdom 的 window.location 是**不可重定义**的
 * （`delete window.location` 返回 false、`defineProperty` 抛 "Cannot redefine property: location"），
 * 跳转只能断言"没跳"，断言不了"跳去哪"。feature-flags 对外只依赖
 * localStorage / sessionStorage / request / ApiPaths / document.querySelectorAll / location，
 * 手搓一个沙箱比跟 jsdom 的导航限制较劲更直接。
 *
 * 跑法：node tests/check_classroom_toggle_guard.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const tick = (n) => new Promise((r) => setTimeout(r, (n || 1) * 8));

/** 造一个最小浏览器沙箱：可观察 location.href，可控 request 返回值。 */
function makeSandbox(opts) {
  const o = opts || {};
  const mkStore = () => {
    const m = Object.create(null);
    return {
      getItem: (k) => (m[k] === undefined ? null : m[k]),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; },
      clear: () => { Object.keys(m).forEach((k) => delete m[k]); }
    };
  };
  const localStorage = mkStore();
  const sessionStorage = mkStore();
  const nav = { href: '', pathname: '/classroom-prep.html', search: '?scheduleId=s1' };

  const win = {
    localStorage,
    sessionStorage,
    location: nav,
    document: { querySelectorAll: () => (o.menuItems || []) },
    console,
    ApiPaths: { ENDPOINTS: { ECLASSROOM_CONFIG: '/api/v1/eclassroom/config' } },
    request: o.request || (() => Promise.resolve(null))
  };
  win.window = win;

  // 会话基线：默认已登录学生、token 在位（ensureConfig 需要它才发请求）
  localStorage.setItem('currentUser', JSON.stringify({ userId: 'u1', role: o.role || 'student' }));
  localStorage.setItem('token', 'T-1');

  const ctx = vm.createContext(win);
  return {
    win, nav, localStorage, sessionStorage,
    load(file) { vm.runInContext(read(file), ctx, { filename: file }); }
  };
}

/* ==================== ①②③ guardClassroom ==================== */
async function testGuardClassroom() {
  console.log('①②③ guardClassroom：未核对不误踢、核对后按结果收敛');

  // ① 未核对 + 缓存是 false（脏快照）：修前会立刻跳走
  {
    let requested = 0;
    const s = makeSandbox({ role: 'student', request: () => { requested++; return Promise.resolve({ enabled: false }); } });
    s.load('frontend/js/public/feature-flags.js');
    s.localStorage.setItem('eclassroomConfig', JSON.stringify({ enabled: false }));

    const ret = s.win.guardClassroom();
    check('未核对时先返回 true（不立即踢人）', ret === true, String(ret));
    check('未核对时不立即跳转', s.nav.href === '', s.nav.href);
    await tick(3);
    check('核对明确未开通 → 退回学生首页', /student\.html$/.test(s.nav.href), s.nav.href);
    check('核对过程确实打了 config 接口', requested >= 1, String(requested));
  }

  // ② 已核对 + 明确未开通：同步踢出
  {
    const s = makeSandbox({ role: 'teacher', request: () => Promise.resolve({ enabled: false }) });
    s.load('frontend/js/public/feature-flags.js');
    s.localStorage.setItem('eclassroomConfig', JSON.stringify({ enabled: false }));
    s.sessionStorage.setItem('eclassroomConfigVerified', '1');

    const ret = s.win.guardClassroom();
    check('已核对未开通：返回 false', ret === false, String(ret));
    check('已核对未开通：退回教师首页', /teacher\.html$/.test(s.nav.href), s.nav.href);
  }

  // ② 已开通：同步放行，不跳
  {
    const s = makeSandbox({ role: 'student', request: () => Promise.resolve({ enabled: true }) });
    s.load('frontend/js/public/feature-flags.js');
    s.localStorage.setItem('eclassroomConfig', JSON.stringify({ enabled: true }));
    s.sessionStorage.setItem('eclassroomConfigVerified', '1');

    const ret = s.win.guardClassroom();
    await tick(2);
    check('已开通：返回 true 且不跳转', ret === true && s.nav.href === '', ret + ' / ' + s.nav.href);
  }

  // ③ 拿不到配置：不踢人（宁可见一次，也不无声踢出）
  {
    const s = makeSandbox({ role: 'student', request: () => Promise.reject(new Error('network down')) });
    s.load('frontend/js/public/feature-flags.js');

    const ret = s.win.guardClassroom();
    await tick(3);
    check('配置取不到时不踢人（留给页面自身 401/登录守卫）', ret === true && s.nav.href === '', ret + ' / ' + s.nav.href);
  }

  // 未登录（无 currentUser / 无 token）：配置未知时同样不在这里踢，避免和登录守卫互相打转
  {
    const s = makeSandbox({ role: 'student', request: () => Promise.resolve(null) });
    s.localStorage.removeItem('currentUser');
    s.localStorage.removeItem('token');
    s.load('frontend/js/public/feature-flags.js');
    const ret = s.win.guardClassroom();
    await tick(3);
    check('无会话 + 配置未知：不跳转（不发散为死循环）', ret === true && s.nav.href === '', ret + ' / ' + s.nav.href);
  }
}

/* ==================== ④ 课堂准备页接入 ==================== */
function testPrepPageWired() {
  console.log('④ classroom-prep 入口先核对再守卫');

  const src = read('frontend/js/classroom/classroom-prep.js');
  // 定位 run 入口（从 "run: function" 到 "doRun: function" 之间）
  const start = src.indexOf('run: function');
  const end = src.indexOf('doRun: function');
  const runBody = (start >= 0 && end > start) ? src.slice(start, end) : '';

  check('run 入口存在且已拆出 doRun', start >= 0 && end > start, start + '/' + end);
  check('run 内调用了 ensureClassroomConfig（先核对）',
    /ensureClassroomConfig/.test(runBody), runBody.slice(0, 80));
  check('run 内调用了 guardClassroom（再判定）',
    /guardClassroom/.test(runBody), runBody.slice(0, 80));
  check('原页面逻辑仍在 doRun 里（没被误删）', /this\.key = param\('scheduleId'\)/.test(src));
  check('classroom-prep.html 确实引入了 feature-flags',
    /js\/public\/feature-flags\.js/.test(read('frontend/classroom-prep.html')));
}

/* ==================== ⑤ 平台端租户列表课堂状态列 ==================== */
function testTenantListColumn() {
  console.log('⑤ 平台端租户列表：课堂状态列');

  const html = read('frontend/platform_admin.html');
  const theadMatch = html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/g) || [];
  const tenantHead = theadMatch.find((h) => h.indexOf('机构名称') >= 0) || '';
  const thCount = (tenantHead.match(/<th>/g) || []).length;
  check('租户表头含「课堂」列', /<th>课堂<\/th>/.test(tenantHead), tenantHead.slice(0, 120));
  check('租户表头列数为 10', thCount === 10, String(thCount));

  const js = read('frontend/js/platform-admin-tenant.js');
  check('空数据占位 colspan 与列数一致（10）', /colspan="10"/.test(js));
  check('行模板渲染课堂状态', /classroomStatusText\(t\.classroomEnabled\)/.test(js));

  // 每行 td 数必须与表头一致，否则整张表错位（这类问题眼睛很难发现）
  const rowStart = js.indexOf('return `<tr>');
  const rowEnd = js.indexOf('</tr>`', rowStart);
  const rowTpl = (rowStart >= 0 && rowEnd > rowStart) ? js.slice(rowStart, rowEnd) : '';
  const tdCount = (rowTpl.match(/<td>/g) || []).length;
  check('行模板 td 数为 10', tdCount === 10, String(tdCount));

  check('三态文案齐全（未开通 / 已启用 / 已禁用）',
    /'已启用'/.test(js) && /'已禁用'/.test(js) && /'未开通'/.test(js));
  check('null 与 0 分开处理（未开通 ≠ 已禁用）',
    /v === 1/.test(js) && /v === 0/.test(js), '缺少 null/0 区分');
}

/* ==================== 主流程 ==================== */
(async function main() {
  await testGuardClassroom();
  testPrepPageWired();
  testTenantListColumn();

  console.log('\n共 ' + (pass + fail) + ' 项：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试执行异常：', e);
  process.exit(1);
});
