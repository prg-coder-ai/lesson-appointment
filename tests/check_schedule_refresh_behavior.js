/**
 * 学生端「课程预订」→「排期信息」下的「刷新」按钮行为验证（2026-09-28）
 *
 * 需求：点「刷新」时**保持当前排期不变**，只重新从数据库读取该排期的数据并更新显示，
 *       以便在别处操作（审核 / 取消 / 管理员改课次）后，直接看到最后的结果。
 *
 * 为什么不能沿用 loadSchedule()：它是「切换课程」路径，开头就 resetScheduleInfoPanel()
 * + resetScheduleSelect()，会把选中排期清掉 —— 刷新时用户还得分神重选一次，
 * 且请求往返期间面板是空的；更糟的是请求失败时整块信息被清空，看起来像“刷新完啥也没了”。
 *
 * 方案：Node vm 沙箱加载**真实** frontend/js/student-bookingCards.js，
 * DOM 用 jsdom 真实现，接口（fetchScheduleList / getBookingCountByScheduleId /
 * getBookingInfo / generateScheduleListFromServer）用可观测的假实现 ——
 * 断言点落在「谁被重新调用了」「页面字段变成什么」，而不是只看代码长什么样。
 *
 * 用法：NODE_PATH=<workspace>/node_modules node tests/check_schedule_refresh_behavior.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const SRC = path.join(FRONTEND, 'js', 'student-bookingCards.js');
const code = fs.readFileSync(SRC, 'utf8');

/**
 * template+clone 改造后，「排期信息」DOM 不再由 JS 字符串生成，
 * 而是 clone 自 student.html 里的 <template id="tpl-student-booking">。
 * 测试必须注入**真实**模板（字段 id / 只读属性 / 按钮文案都是生产代码那一份），
 * 否则 renderStudentBookingCards() 取不到模板会直接 return，模板不注入 → 全 FAIL。
 */
const STUDENT_HTML = path.join(FRONTEND, 'student.html');
function extractBookingTemplate() {
  const html = fs.readFileSync(STUDENT_HTML, 'utf8');
  const m = html.match(/<template id="tpl-student-booking">[\s\S]*?<\/template>/);
  if (!m) throw new Error('在 student.html 中找不到 #tpl-student-booking 模板');
  return m[0];
}

let pass = 0, fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};

// 页面骨架：提供挂载点 + **真实**课程预订模板（从 student.html 抽取，保证断言的是生产模板）。
const DOM_HTML = '<!DOCTYPE html><html><body><div id="dynamic-content-center"></div>'
  + extractBookingTemplate()
  + '</body></html>';

/** 排期样本：availableSites 可在刷新前后不同（模拟管理员改席位/被预订） */
const mkSchedule = (id, name, sites, extra) => Object.assign({
  scheduleId: id, courseId: 'C1', name: name, status: 'active',
  availableSites: sites, startDate: '2026-10-01', startTime: '09:00',
  endDate: '2026-10-01', timeZone: 'Asia/Shanghai',
  repeatType: 'none', repeatInterval: null, repeatDays: null,
}, extra || {});

/** 建沙箱：真实脚本 + 真 DOM + 可观测的假接口 */
async function makeSandbox(cfg) {
  cfg = cfg || {};
  const dom = new JSDOM(DOM_HTML, { url: 'http://127.0.0.1:8080/student.html' });
  const doc = dom.window.document;
  const calls = { fetch: [], count: [], booking: [], gen: [], alerts: [] };

  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.document = doc;
  // 源码顶部有 document.write('/js/public/pagefoot.js')，jsdom 无 runScripts 时执行它会改写/清空文档，
  // 把刚注入的 <template> 一并抹掉 → 测出“模板没克隆”。测试不需要 pagefoot.js（getPagebar/Pagination 已垫片），直接桩掉。
  doc.write = function () {};
  doc.open = function () { return doc; };
  doc.close = function () {};
  sb.location = { href: 'http://127.0.0.1:8080/student.html', pathname: '/student.html', search: '', origin: 'http://127.0.0.1:8080' };
  sb.history = { replaceState() {}, pushState() {} };
  const store = new Map();
  sb.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  sb.sessionStorage = sb.localStorage;
  sb.console = { log() {}, warn() {}, error() {} };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = setInterval; sb.clearInterval = clearInterval;
  sb.URL = URL; sb.URLSearchParams = URLSearchParams; sb.Intl = Intl;
  sb.alert = m => { calls.alerts.push(m); };
  sb.confirm = () => true;
  sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };

  // ---- 脚本依赖的全局（student.html 内联脚本/其它 js 提供）----
  sb.userRole = 'student';
  sb.userId = 'U1';
  sb.userTimeZone = 'Asia/Shanghai';
  sb.userTimeZoneDisplay = 'none';
  sb.currentCourseId = '';
  sb.courseList = cfg.courseList || [];
  sb.scheduleList = [];
  sb.scheduleObject = null;
  sb.selectedScheuleId = null;
  sb.scheduleResult = null;

  // ---- 可观测的假接口 ----
  cfg.fetchImpl = cfg.fetchImpl || ((cid, status) => (cfg.list || []).slice());
  sb.fetchScheduleList = async (cid, status) => { calls.fetch.push({ cid, status }); return cfg.fetchImpl(cid, status); };
  sb.getBookingCountByScheduleId = async (sid) => {
    calls.count.push(sid);
    return (typeof cfg.booked === 'function') ? cfg.booked(sid) : (cfg.booked || 0);
  };
  sb.getBookingInfo = async (sid) => { calls.booking.push(sid); return cfg.bookings || []; };
  sb.getUserNameById = async () => (cfg.teacherName || 'T老师');
  sb.generateScheduleListFromServer = async (form) => {
    calls.gen.push(form);
    return (cfg.genResult || []).slice();
  };
  sb.getAppointmentsByBookingId = async () => [];
  sb.tzSwitchTo = async (from, dt) => ({ dateTime: dt, weekday: '周一' });
  // 其余由其它 js 文件提供的外部依赖（本用例不校验其行为，给最小实现即可）
  sb.getRepeatDescription = (type, interval) => '每' + (interval || 1) + '天一次';
  sb.getMyDatetime = async () => ({ dateTime: '2026-10-01 09:00', weekday: '周四' });
  sb.getMyEndDatetime = async () => ({ dateTime: '2026-10-01 10:00', weekday: '周四' });
  sb.checkCourseAndSchedule = () => true;
  sb.operateBookingStatus = async () => ({});   // courseAndBooking.js 提供（本用例不触发）
  // 渲染页面模板所需的分页/请求垫片（返回空课程列表即可）
  sb.Pagination = { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 };
  sb.request = async () => ({ total: 0, totalPages: 0, rows: [] });
  sb.assignLoadobjectListFunction = () => {};
  sb.getPagebar = () => '';
  sb.renderPagination = () => {};

  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'js/student-bookingCards.js' });

  // ★ 关键：所有「排期信息」相关函数与事件绑定都定义在 renderStudentBookingCards() 内部的块作用域里，
  //   只有执行一次之后才会挂到 window 上，同时把真实模板写进 #dynamic-content-center。
  //   所以必须真正跑一遍渲染，才能拿到 loadSchedule / displaySchedule / refreshData_student。
  await sb.window.renderStudentBookingCards();

  return { sb, doc, dom, calls, id: doc.getElementById.bind(doc) };
}

/** 初始化到“已选好课程 + 选中 1001 排期”的状态（等价于用户手点选排期） */
async function presetSelected(env, scheduleId) {
  await env.sb.window.loadSchedule('C1');
  const sel = env.id('scheduleSelect');
  sel.value = String(scheduleId);
  await env.sb.window.displaySchedule();
  return sel;
}

(async function main() {

  // =====================================================================
  console.log('\n=== T1 刷新保持当前排期，且重新读库 ===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, '周一班', 5), mkSchedule(1002, '周三班', 4)], booked: 2 });
    const sel = await presetSelected(env, 1001);
    const before = { fetch: env.calls.fetch.length, count: env.calls.count.length, booking: env.calls.booking.length };
    assert('初始化后排期字段已写入', env.id('scheduleId').value === '1001', env.id('scheduleId').value);
    assert('初始化后剩余员额 = 5-2 = 3', env.id('now_availableSites').value === '3', env.id('now_availableSites').value);

    await env.sb.window.refreshData_student();

    assert('刷新后下拉选中项仍是原排期 1001（未被重置）', sel.value === '1001', sel.value);
    assert('刷新后 #scheduleId 仍是 1001', env.id('scheduleId').value === '1001', env.id('scheduleId').value);
    assert('刷新重新拉取了排期列表（再次读库）', env.calls.fetch.length === before.fetch + 1,
      before.fetch + ' -> ' + env.calls.fetch.length);
    assert('刷新重新读取了已预订人数', env.calls.count.length === before.count + 1,
      before.count + ' -> ' + env.calls.count.length);
    assert('刷新重新读取了我的预订状态', env.calls.booking.length === before.booking + 1,
      before.booking + ' -> ' + env.calls.booking.length);
    assert('刷新未产生任何 alert（正常路径不应弹窗）', env.calls.alerts.length === 0, env.calls.alerts.join('|'));
  }

  // =====================================================================
  console.log('\n=== T2 刷新后显示的是最新数据（席位减少 → 满额）===');
  {
    const list = [mkSchedule(1001, '周一班', 5), mkSchedule(1002, '周三班', 4)];
    const env = await makeSandbox({ list: list, booked: 2 });
    await presetSelected(env, 1001);
    assert('刷新前剩余 3（非满额）', env.id('now_availableSites').value === '3');
    assert('刷新前无满额样式', !env.id('now_availableSites').classList.contains('site-full'));

    // 模拟别处操作：管理员把总席位调小 / 又多了人预订
    env.sb.scheduleList[0].availableSites = 2;
    env.sb.fetchScheduleList = async (cid, status) => {
      env.calls.fetch.push({ cid, status });
      return [mkSchedule(1001, '周一班', 2), mkSchedule(1002, '周三班', 4)];
    };
    env.sb.getBookingCountByScheduleId = async (sid) => { env.calls.count.push(sid); return 2; };

    await env.sb.window.refreshData_student();

    assert('刷新后总席位字段更新为新值 2', env.id('availableSites').value === '2', env.id('availableSites').value);
    assert('刷新后剩余 2-2 = 0 → 显示「满额」', env.id('now_availableSites').value === '满额',
      env.id('now_availableSites').value);
    assert('数值载体 data-remaining = 0（判定口径未被文案污染）',
      env.id('now_availableSites').getAttribute('data-remaining') === '0',
      env.id('now_availableSites').getAttribute('data-remaining'));
    assert('满额样式 site-full 已挂上', env.id('now_availableSites').classList.contains('site-full'));
    assert('刷新后仍停留在原排期 1001', env.id('scheduleId').value === '1001');
  }

  // =====================================================================
  console.log('\n=== T3 原排期已失效（被取消/删除/非 active）===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, '周一班', 5), mkSchedule(1002, '周三班', 4)], booked: 1 });
    await presetSelected(env, 1001);
    env.sb.fetchScheduleList = async (cid, status) => {
      env.calls.fetch.push({ cid, status });
      return [mkSchedule(1002, '周三班', 4)];      // 1001 已不在有效列表中
    };
    await env.sb.window.refreshData_student();
    assert('失效后下拉回到占位项', env.id('scheduleSelect').value === '', env.id('scheduleSelect').value);
    assert('失效后面板被清空（#scheduleId 为空）', env.id('scheduleId').value === '', env.id('scheduleId').value);
    assert('失效后剩余员额清空（不留上一个排期的数据）',
      env.id('now_availableSites').value === '', env.id('now_availableSites').value);
    assert('失效后不残留满额样式', !env.id('now_availableSites').classList.contains('site-full'));
    assert('失效后仍保留另一个有效排期可选',
      env.id('scheduleSelect').options.length === 2, env.id('scheduleSelect').options.length + ' 项');
  }

  // =====================================================================
  console.log('\n=== T4 刷新请求失败：保持页面原样，不清空（与 loadSchedule 的关键差异）===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, '周一班', 5)], booked: 2 });
    const sel = await presetSelected(env, 1001);
    env.sb.fetchScheduleList = async () => { throw new Error('network down'); };

    await env.sb.window.refreshData_student();

    assert('失败时给出提示', env.calls.alerts.length === 1, env.calls.alerts.join('|'));
    assert('失败时下拉选中项保持 1001', sel.value === '1001', sel.value);
    assert('失败时 #scheduleId 保持 1001（未被清空）', env.id('scheduleId').value === '1001', env.id('scheduleId').value);
    assert('失败时剩余员额保持 3（旧数据仍可用）',
      env.id('now_availableSites').value === '3', env.id('now_availableSites').value);
    assert('失败时排期日期字段保持原值', env.id('startDate').value === '2026-10-01', env.id('startDate').value);
  }

  // =====================================================================
  console.log('\n=== T5 已展开课次列表时，刷新自动重放预览（拿到最后的结果）===');
  {
    const env = await makeSandbox({
      list: [mkSchedule(1001, '周一班', 5)], booked: 1,
      genResult: [{ id: 'a1', date: '2026-10-01', time: '09:00' }, { id: 'a2', date: '2026-10-03', time: '09:00' }],
    });
    await presetSelected(env, 1001);
    await env.sb.window.previewSchedule();
    assert('预览已展开课次列表', env.calls.gen.length === 1, env.calls.gen.length);
    assert('结果区已有行', env.id('resultBody').children.length === 2, env.id('resultBody').children.length);

    await env.sb.window.refreshData_student();
    assert('刷新后自动重放了一次预览（无需用户再点）', env.calls.gen.length === 2, env.calls.gen.length);
    assert('结果区仍是 2 行', env.id('resultBody').children.length === 2, env.id('resultBody').children.length);
    assert('刷新后仍停留在原排期', env.id('scheduleId').value === '1001');
  }

  // =====================================================================
  console.log('\n=== T5b 未展开课次列表时，刷新不擅自发起预览 ===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, '周一班', 5)], booked: 1, genResult: [] });
    await presetSelected(env, 1001);
    await env.sb.window.refreshData_student();
    assert('未预览过 → 刷新不触发预览请求', env.calls.gen.length === 0, env.calls.gen.length);
  }

  // =====================================================================
  console.log('\n=== T6 未选课程时点刷新：清空面板，不抛异常、不误报失败 ===');
  {
    const env = await makeSandbox({ list: [] });
    env.sb.currentCourseId = '';
    let threw = null;
    try { await env.sb.window.refreshData_student(); } catch (e) { threw = e; }
    assert('未选课程时不抛异常', !threw, threw && threw.message);
    // 没有课程就没有「该排期」可刷：退回重载排期列表，但 loadSchedule 在 cid 为空时
    // 会提前返回（resetScheduleInfoPanel + return []），因此不应发出排期请求
    assert('未选课程时不发起排期请求（无对象可刷）', env.calls.fetch.length === 0, env.calls.fetch.length);
    assert('未选课程时面板保持清空状态', env.id('scheduleId').value === '', env.id('scheduleId').value);
    assert('未选课程时不误报「刷新失败」', env.calls.alerts.length === 0, env.calls.alerts.join('|'));
  }

  // =====================================================================
  console.log('\n=== T7 刷新按钮状态复位（含异常路径）===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, '周一班', 5)], booked: 0 });
    await presetSelected(env, 1001);
    await env.sb.window.refreshData_student();
    assert('正常路径：按钮文案复位为「刷新」', env.id('refreshBtn').textContent === '刷新', env.id('refreshBtn').textContent);
    assert('正常路径：按钮恢复可点', env.id('refreshBtn').disabled === false);

    env.sb.fetchScheduleList = async () => { throw new Error('boom'); };
    await env.sb.window.refreshData_student();
    assert('异常路径：按钮文案仍复位为「刷新」', env.id('refreshBtn').textContent === '刷新', env.id('refreshBtn').textContent);
    assert('异常路径：按钮恢复可点（未卡在禁用态）', env.id('refreshBtn').disabled === false);
  }

  // =====================================================================
  console.log('\n=== T8 源码守卫：两条路径共用同一份下拉填充口径 ===');
  {
    const fnBody = (name) => {
      const i = code.indexOf('function ' + name + '(');
      if (i < 0) return '';
      // 取到下一个顶层缩进函数声明为止（粗略但够用）
      const rest = code.slice(i);
      const m = rest.slice(1).search(/\n {8}(async )?function /);
      return m < 0 ? rest : rest.slice(0, m + 1);
    };
    assert('存在 fillScheduleSelect 提取函数', typeof code.match(/function fillScheduleSelect\(/) !== 'undefined');
    assert('loadSchedule 复用 fillScheduleSelect',
      /cnt = fillScheduleSelect\(scheduleList\)/.test(fnBody('loadSchedule')));
    assert('refreshData_student 复用 fillScheduleSelect 并传入原排期',
      /fillScheduleSelect\(scheduleList, keepScheduleId\)/.test(fnBody('refreshData_student')));
    assert('refreshData_student 会重新渲染（displaySchedule）',
      /await displaySchedule\(\)/.test(fnBody('refreshData_student')));
    assert('refreshData_student 有失败提示且不清空页面（alert + return 成对）',
      /alert\('刷新失败，请稍后重试'\)[\s\S]{0,80}return;/.test(fnBody('refreshData_student')));
    assert('refreshData_student 不再整段重置面板（仅原排期失效时清空）',
      (fnBody('refreshData_student').match(/resetScheduleInfoPanel\(\)/g) || []).length === 1);
  }

  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  if (fail) process.exit(1);
})().catch(e => { console.error('测试异常终止:', e); process.exit(1); });
