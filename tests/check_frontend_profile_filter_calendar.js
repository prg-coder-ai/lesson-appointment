/**
 * 前端双端改进「余下工作」无头集成测试（vm + jsdom + 假接口）
 *
 * 覆盖本轮落地的：
 *  - S2a/b/c 学生个人中心（资料查看 / 改密入口 / 微信绑定入口）
 *  - T5     教师个人中心（删除 mock，改真实会话渲染）
 *  - S9     课程列表本地筛选（语言/难度/授课形式）
 *  - S7     日历月份切换（保留 35 天 + 当月高亮 + 上/下月导航）
 *  - S10    学生个人统计卡（本人 booking/page 统计）
 *  - S3     课程详情页（新建页 smoke）
 *  - S5     教师列表页（新建页 smoke）
 *  - T4     删除学生评价 mock（静态守卫）
 *
 * 用法：
 *   NODE_PATH=<jsdom 所在 node_modules> node tests/check_frontend_profile_filter_calendar.js
 * 例：
 *   NODE_PATH=/c/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules node tests/check_frontend_profile_filter_calendar.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');

let pass = 0, fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  :: ' + x : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseSandbox(html, url) {
  const dom = new JSDOM(html, { url: url || 'http://127.0.0.1:8080/student.html' });
  const doc = dom.window.document;
  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.document = doc;
  doc.write = function () {}; doc.open = function () { return doc; }; doc.close = function () {};
  sb.location = { href: url || 'http://127.0.0.1:8080/student.html', pathname: '/student.html', search: '', origin: 'http://127.0.0.1:8080', assign() {}, replace() {}, toString() { return this.href; } };
  sb.history = { length: 1, back() {}, forward() {}, pushState() {}, replaceState() {} };
  const store = new Map();
  sb.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  sb.sessionStorage = sb.localStorage;
  sb.console = { log() {}, warn() {}, error() {}, info() {} };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout; sb.setInterval = setInterval; sb.clearInterval = clearInterval;
  sb.URL = URL; sb.URLSearchParams = URLSearchParams; sb.Intl = Intl;
  sb.alert = () => {}; sb.confirm = () => true; sb.Event = dom.window.Event; sb.MouseEvent = dom.window.MouseEvent;
  sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
  sb.Pagination = { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 };
  vm.createContext(sb);
  return { sb, doc };
}
function loadFile(sb, rel) {
  const code = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
  vm.runInContext(code, sb, { filename: rel });
}

// ===========================================================================
// S2a/b/c + S10：学生个人中心
// ===========================================================================
(async function studentProfile() {
  console.log('\n========== S2a/b/c + S10 学生个人中心 ==========');
  const { sb, doc } = baseSandbox('<div id="container"></div>');
  const container = doc.getElementById('container');

  let nameByIdCalls = [];
  let wxStatusCalls = 0;
  let chgPwdCalls = 0, wxBindCalls = 0, myBookingCalls = 0;

  sb.getCurrentUserInfo = () => ({ userId: 'U1001', account: 'stu01', name: '王同学', role: 'student', tenantCode: 'TENANT_A' });
  sb.getUserNameById = (id) => { nameByIdCalls.push(id); return Promise.resolve('王同学(权威)'); };
  sb.showChangePasswordDialog = () => { chgPwdCalls++; };
  sb.showWechatBindDialog = () => { wxBindCalls++; };
  sb.getWechatBindStatus = () => { wxStatusCalls++; return Promise.resolve({ bound: true }); };
  sb.loadAdminPageContent = (key) => { if (key === 'my_booking') myBookingCalls++; };
  sb.getBookingListPage = () => Promise.resolve({ rows: [
    { status: 'booking' }, { status: 'waiting' }, { status: 'cancelling' },
    { status: 'booked' }, { status: 'bookProved' }, { status: 'rej-cancelling' },
    { status: 'completed' }, { status: 'canceled' }, { status: 'rej-booking' },
    { status: 'frozen' }, { status: 'weird-unknown' },
  ] });

  loadFile(sb, 'js/student-profile.js');
  assert('renderStudentProfile 已暴露到 window', typeof sb.window.renderStudentProfile === 'function');

  sb.window.renderStudentProfile(container);
  await sleep(15);

  console.log('\n--- S2a 资料查看 ---');
  assert('渲染了「个人信息」卡', /个人信息/.test(container.textContent));
  assert('显示账号 stu01', /stu01/.test(container.textContent));
  assert('显示角色「学生」', /学生/.test(container.textContent));
  assert('显示租户编码 TENANT_A', /TENANT_A/.test(container.textContent));
  assert('去调 getUserNameById 取权威姓名（按 userId 字符串）', nameByIdCalls.length === 1 && nameByIdCalls[0] === 'U1001', JSON.stringify(nameByIdCalls));
  assert('权威姓名已写入 #sp-name', doc.getElementById('sp-name').textContent === '王同学(权威)');

  console.log('\n--- S2b 改密入口 / S2c 微信绑定入口 ---');
  const chgBtn = doc.getElementById('sp-chgpwd');
  const wxBtn = doc.getElementById('sp-wx');
  const mbBtn = doc.getElementById('sp-mybooking');
  assert('存在「修改密码」按钮', !!chgBtn);
  assert('存在「微信绑定」按钮', !!wxBtn);
  assert('存在「我的预订」按钮', !!mbBtn);
  chgBtn.dispatchEvent(new sb.window.Event('click'));
  assert('点修改密码 → 调 showChangePasswordDialog', chgPwdCalls === 1, 'calls=' + chgPwdCalls);
  wxBtn.dispatchEvent(new sb.window.Event('click'));
  assert('点微信绑定 → 调 showWechatBindDialog', wxBindCalls === 1, 'calls=' + wxBindCalls);
  mbBtn.dispatchEvent(new sb.window.Event('click'));
  assert('点我的预订 → 调 loadAdminPageContent("my_booking")', myBookingCalls === 1, 'calls=' + myBookingCalls);
  assert('微信已绑定 → 文案变「微信已绑定（点击管理）」', doc.getElementById('sp-wx-label').textContent === '微信已绑定（点击管理）');

  console.log('\n--- S10 个人统计卡 ---');
  const stats = doc.getElementById('sp-stats');
  const tiles = stats.querySelectorAll('.sp-stat-tile');
  assert('统计生成 5 个计数块', tiles.length === 5, 'tiles=' + tiles.length);
  const valOf = (label) => {
    for (const t of tiles) {
      if (t.querySelector('.sp-stat-label').textContent === label) return Number(t.querySelector('.sp-stat-val').textContent);
    }
    return null;
  };
  assert('总预订 = 11（含 1 个未知状态）', valOf('总预订') === 11, valOf('总预订'));
  assert('待确认 = 3（booking+waiting+cancelling）', valOf('待确认') === 3, valOf('待确认'));
  assert('已确认 = 3（booked+bookProved+rej-cancelling）', valOf('已确认') === 3, valOf('已确认'));
  assert('已完成 = 1（completed）', valOf('已完成') === 1, valOf('已完成'));
  assert('已取消 = 3（canceled+rej-booking+frozen）', valOf('已取消') === 3, valOf('已取消'));
  // 方案 A 细分小字：大类 tile 下浅色标注构成
  var pendingTile = Array.from(tiles).find(function (t) { return t.querySelector('.sp-stat-label').textContent === '待确认'; });
  var canceledTile = Array.from(tiles).find(function (t) { return t.querySelector('.sp-stat-label').textContent === '已取消'; });
  assert('待确认细分含「候补」', /候补/.test(pendingTile.textContent));
  assert('待确认细分含「取消待确认」', /取消待确认/.test(pendingTile.textContent));
  assert('已取消细分含「拒绝预订」', /拒绝预订/.test(canceledTile.textContent));
  assert('已取消细分含「删除」', /删除/.test(canceledTile.textContent));
  // 反向：未知状态不兜底进「已取消」（历史上 else canceled++ 会把未知状态误算成已取消）
  assert('未知状态 weird-unknown 未污染「已取消」', valOf('已取消') === 3, valOf('已取消'));
  assert('未知状态单独计入「其它」提示', /其它（未识别状态）1/.test(stats.textContent));

  console.log('\n--- S2a 反向：未登录 → 不抛错，显示未登录提示 ---');
  const c2 = doc.createElement('div');
  doc.body.appendChild(c2);
  sb.getCurrentUserInfo = () => null;
  let threw = false;
  try { sb.window.renderStudentProfile(c2); } catch (e) { threw = true; }
  assert('未登录渲染不抛异常', !threw);
  assert('未登录显示提示文案', /未登录/.test(c2.textContent));

  console.log('\n--- S10 反向：统计接口失败 → 显示「统计加载失败」 ---');
  const { sb: sb3, doc: doc3 } = baseSandbox('<div id="c3"></div>');
  sb3.getCurrentUserInfo = () => ({ userId: 'U9', account: 'a', name: 'n', role: 'student', tenantCode: 'T' });
  sb3.getUserNameById = () => Promise.resolve('n');
  sb3.showChangePasswordDialog = () => {}; sb3.showWechatBindDialog = () => {};
  sb3.getWechatBindStatus = () => Promise.resolve({ bound: false });
  sb3.loadAdminPageContent = () => {};
  sb3.getBookingListPage = () => Promise.reject(new Error('network'));
  loadFile(sb3, 'js/student-profile.js');
  sb3.window.renderStudentProfile(doc3.getElementById('c3'));
  await sleep(15);
  assert('统计失败显示「统计加载失败」', /统计加载失败/.test(doc3.getElementById('c3').textContent));
})();

// ===========================================================================
// T5：教师个人中心（删除 mock，真实渲染）
// ===========================================================================
(async function teacherProfile() {
  console.log('\n========== T5 教师个人中心（删除 mock）==========');
  const { sb, doc } = baseSandbox('<div id="tcontainer"></div>');
  const container = doc.getElementById('tcontainer');
  let nameByIdCalls = [];

  sb.getCurrentUserInfo = () => ({ userId: 'T2001', account: 'tea01', name: '赵老师', role: 'teacher', tenantCode: 'TENANT_A' });
  sb.getUserNameById = (id) => { nameByIdCalls.push(id); return Promise.resolve('赵老师(权威)'); };
  sb.showChangePasswordDialog = () => {};
  sb.showWechatBindDialog = () => {};
  sb.getWechatBindStatus = () => Promise.resolve({ bound: false });

  loadFile(sb, 'js/teacher-profile.js');
  assert('renderTeacherProfile 已暴露到 window', typeof sb.window.renderTeacherProfile === 'function');
  sb.window.renderTeacherProfile(container);
  await sleep(10);

  assert('渲染真实姓名「赵老师」', /赵老师/.test(container.textContent));
  assert('去调 getUserNameById 取权威姓名', nameByIdCalls.length === 1 && nameByIdCalls[0] === 'T2001', JSON.stringify(nameByIdCalls));
  assert('权威姓名已写入 #tp-name', doc.getElementById('tp-name').textContent === '赵老师(权威)');
  // 反向：删除 mock 后，不应再出现旧 hardcode 假数据
  assert('不再出现 mock 假数据「李华」', !/李华/.test(container.textContent));
  assert('不再出现 mock 假数据「4.9分」', !/4\.9分/.test(container.textContent));
  assert('不再出现 mock 假数据「擅长」教学标签', !/擅长/.test(container.textContent));
})();

// ===========================================================================
// S9：课程列表本地筛选
// ===========================================================================
(async function courseFilter() {
  console.log('\n========== S9 课程列表本地筛选 ==========');
  const { sb, doc } = baseSandbox('<div id="dynamic-content-center"></div>');
  const defs = [
    'course-workLanguage-select', 'course-difficulty-select', 'course-classForm-select',
  ];
  defs.forEach((id) => {
    const s = doc.createElement('select');
    s.id = id;
    doc.body.appendChild(s);
  });
  const countTip = doc.createElement('span');
  countTip.id = 'course-filter-count';
  doc.body.appendChild(countTip);
  const list = doc.createElement('div');
  list.id = 'courseCardList';
  const mk = (wl, diff, form) => {
    const c = doc.createElement('div');
    c.className = 'course-card';
    c.setAttribute('data-work-language', wl);
    c.setAttribute('data-difficulty-level', diff);
    c.setAttribute('data-class-form', form);
    list.appendChild(c);
  };
  mk('中文', '初级', '一对一');
  mk('中文', '中级', '小班');
  mk('English', '初级', '一对一');
  mk('中文', '初级', '小班');
  doc.body.appendChild(list);

  loadFile(sb, 'js/student-bookingCards.js');

  console.log('\n--- 选项聚合 ---');
  sb.window.syncCourseFilterOptions();
  const wlSel = doc.getElementById('course-workLanguage-select');
  const opts = Array.from(wlSel.options).map((o) => o.value);
  assert('授课语言下拉聚合出 中文 + English（含「全部」占位）', opts.indexOf('中文') >= 0 && opts.indexOf('English') >= 0, JSON.stringify(opts));

  console.log('\n--- 正向：按授课语言=中文 过滤 ---');
  wlSel.value = '中文';
  sb.window.applyCourseLocalFilter();
  const cards = Array.from(list.querySelectorAll('.course-card'));
  const visible = cards.filter((c) => c.style.display !== 'none');
  assert('仅中文课程可见（3 门，另 1 门为 English）', visible.length === 3, 'visible=' + visible.length);
  assert('英文课程被隐藏', cards[2].style.display === 'none');
  const tip = doc.getElementById('course-filter-count');
  assert('筛选计数提示为「筛选后 3 门」', tip && /筛选后 3 门/.test(tip.textContent), tip && tip.textContent);

  console.log('\n--- 叠加：中文 + 初级 + 一对一 ---');
  doc.getElementById('course-difficulty-select').value = '初级';
  doc.getElementById('course-classForm-select').value = '一对一';
  sb.window.applyCourseLocalFilter();
  const vis2 = Array.from(list.querySelectorAll('.course-card')).filter((c) => c.style.display !== 'none');
  assert('三条件叠加后仅剩 1 门（中文+初级+一对一）', vis2.length === 1, 'visible=' + vis2.length);

  console.log('\n--- 反向：清空下拉 → 全部可见 ---');
  defs.forEach((id) => { doc.getElementById(id).value = ''; });
  sb.window.applyCourseLocalFilter();
  const vis3 = Array.from(list.querySelectorAll('.course-card')).filter((c) => c.style.display !== 'none');
  assert('清空筛选后 4 门全部可见', vis3.length === 4, 'visible=' + vis3.length);

  console.log('\n--- 重置筛选（resetCourseFilter）清空下拉 + 不抛错 ---');
  let rerenderCalls = 0;
  sb.window.loadAndRenderCourse_student = () => { rerenderCalls++; };
  wlSel.value = '中文';
  sb.window.resetCourseFilter();
  assert('resetCourseFilter 清空授课语言下拉', wlSel.value === '');
  assert('resetCourseFilter 触发重新渲染（loadAndRenderCourse_student）', rerenderCalls === 1, 'calls=' + rerenderCalls);
})();

// ===========================================================================
// S7：日历月份切换
// ===========================================================================
(async function calendar() {
  console.log('\n========== S7 日历月份切换 ==========');
  // calendar 必须有父节点（renderCalendarGrid 用 cal.parentElement 插导航头）
  const { sb, doc } = baseSandbox('<div id="calPanel"><div id="calendar"></div></div>');
  loadFile(sb, 'js/student-bookingBrowserCards.js');
  assert('renderCalendar 已暴露', typeof sb.window.renderCalendar === 'function');
  assert('shiftCalendarMonth 已暴露', typeof sb.window.shiftCalendarMonth === 'function');
  assert('resetCalendarView 已暴露', typeof sb.window.resetCalendarView === 'function');

  // 测试数据落在 2026-10（今天 2026-10-26 也在该月，便于验证 today 高亮）
  const data = [
    { date: '2026-10-05' }, { date: '2026-10-20' }, { date: '2026-10-26' },
  ];
  sb.window.renderCalendar(data);

  const nav = doc.querySelector('.calendar-nav');
  assert('渲染了月份导航头', !!nav);
  const title = doc.querySelector('.calendar-nav-title');
  assert('导航标题为「2026年10月」', title && title.textContent === '2026年10月', title && title.textContent);

  const days = Array.from(doc.getElementById('calendar').children);
  assert('保留 35 天布局', days.length === 35, 'days=' + days.length);
  assert('已排期日被标记 marked（3 个）', days.filter((d) => d.classList.contains('marked')).length === 3, days.filter((d) => d.classList.contains('marked')).length);
  const todayCells = days.filter((d) => d.classList.contains('today'));
  assert('今天恰好有一个单元格被高亮 today', todayCells.length === 1, 'today=' + todayCells.length);
  assert('today 单元格同时属于当月高亮', todayCells.length === 1 && todayCells[0].classList.contains('current-month'));
  const curMonth = days.filter((d) => d.classList.contains('current-month'));
  assert('当月（10月）日期带 current-month 高亮', curMonth.length >= 28, 'curMonth=' + curMonth.length);
  const outMonth = days.filter((d) => !d.classList.contains('current-month'));
  assert('跨月补齐的日期不带 current-month', outMonth.every((d) => !d.classList.contains('current-month')));

  console.log('\n--- 月份切换：上月 ---');
  // 找到「‹ 上月」按钮并点击（其 click handler 调 shiftCalendarMonth(-1)）
  const prevBtn = doc.querySelector('.calendar-nav-btn');
  prevBtn.dispatchEvent(new sb.window.Event('click'));
  const title2 = doc.querySelector('.calendar-nav-title');
  assert('点上月 → 标题变「2026年9月」', title2 && title2.textContent === '2026年9月', title2 && title2.textContent);
  const days2 = Array.from(doc.getElementById('calendar').children);
  assert('切换后仍 35 天', days2.length === 35, 'days=' + days2.length);
  assert('9 月视图中无 10 月数据被标记（数据缓存仍在，但不在该月）', days2.filter((d) => d.classList.contains('marked')).length === 0, days2.filter((d) => d.classList.contains('marked')).length);

  console.log('\n--- 月份切换：下月（回到 10 月并越过到 11 月）---');
  // 回到 10 月再 +1 → 11 月
  const btns = doc.querySelectorAll('.calendar-nav-btn');
  btns[1].dispatchEvent(new sb.window.Event('click')); // +1 → 10 月
  const btns2 = doc.querySelectorAll('.calendar-nav-btn');
  btns2[1].dispatchEvent(new sb.window.Event('click')); // +1 → 11 月
  const title3 = doc.querySelector('.calendar-nav-title');
  assert('连续 +1 两次 → 标题「2026年11月」', title3 && title3.textContent === '2026年11月', title3 && title3.textContent);

  console.log('\n--- resetCalendarView：新数据重新锚定月份 ---');
  sb.window.resetCalendarView();
  sb.window.renderCalendar([{ date: '2026-03-15' }]);
  const title4 = doc.querySelector('.calendar-nav-title');
  assert('切到 3 月数据 → 标题「2026年3月」', title4 && title4.textContent === '2026年3月', title4 && title4.textContent);
})();

// ===========================================================================
// S3：课程详情页（新建页 smoke）
// ===========================================================================
(async function courseDetail() {
  console.log('\n========== S3 课程详情页 smoke ==========');
  const html = '<!DOCTYPE html><html><body>'
    + '<a id="cd-back"></a><div id="cd-mount"></div>'
    + '<div id="cd-teacher-card" style="display:none"><div id="cd-teacher"></div></div>'
    + '<div id="cd-schedule"></div></body></html>';
  const { sb, doc } = baseSandbox(html, 'http://127.0.0.1:8080/course-detail.html?courseId=CX1');
  sb.location.search = '?courseId=CX1';
  let courseFetched = null, schedFetched = null;
  sb.getCourseById = (id) => { courseFetched = id; return Promise.resolve({ courseId: id, courseName: '合同法精讲', languageType: 'legal', workLanguage: '中文', difficultyLevel: '初级', classDuration: 90, classForm: '1v1', classFee: 299, feature: '案例,实务', content: '系统讲解', imageUrl: '' }); };
  sb.fetchScheduleList = (cid, st) => { schedFetched = [cid, st]; return Promise.resolve([{ date: '2026-11-01', time: '10:00', status: 'active' }]); };
  sb.getTenantCodeParam = () => 'TENANT_A';
  sb.request = () => Promise.resolve([]);
  sb.applyTerms = () => {}; sb.applyDocumentTitle = () => {};
  sb.pageUrl = (f) => './' + f;
  sb.termText = (k) => ({ teacher: '律师' }[k] || k);
  sb.enumTermText = () => ''; sb.courseTypeText = () => '法律'; sb.workLanguageText = (v) => v;

  loadFile(sb, 'js/course-detail.js');
  await sleep(40);

  assert('getCourseById 被调用且参数=URL 的 courseId', courseFetched === 'CX1', courseFetched);
  const mount = doc.getElementById('cd-mount');
  assert('课程名「合同法精讲」已挂载', /合同法精讲/.test(mount.textContent));
  assert('课时/形式/费用三联已渲染', /90 分钟/.test(mount.textContent) && /¥299/.test(mount.textContent));
  assert('教师区显示（有 teacherId）', doc.getElementById('cd-teacher-card').style.display !== 'none');
  assert('教师区含「查看律师详情」深链', /查看律师详情/.test(doc.getElementById('cd-teacher').textContent), doc.getElementById('cd-teacher').textContent);
  assert('排期列表已拉取（fetchScheduleList 收到 active）', schedFetched && schedFetched[1] === 'active', JSON.stringify(schedFetched));
  assert('排期渲染出一条 2026-11-01', /2026-11-01/.test(doc.getElementById('cd-schedule').textContent));

  console.log('\n--- 反向：缺 courseId → 显示错误提示 ---');
  const { sb: sb2, doc: doc2 } = baseSandbox(html.replace('course-detail.html?courseId=CX1', 'course-detail.html'), 'http://127.0.0.1:8080/course-detail.html');
  sb2.location.search = '';
  sb2.getCourseById = () => Promise.resolve(null);
  sb2.fetchScheduleList = () => Promise.resolve([]);
  sb2.getTenantCodeParam = () => ''; sb2.request = () => Promise.resolve([]);
  sb2.applyTerms = () => {}; sb2.applyDocumentTitle = () => {}; sb2.pageUrl = (f) => f;
  sb2.termText = (k) => k; sb2.enumTermText = () => ''; sb2.courseTypeText = () => ''; sb2.workLanguageText = (v) => v;
  loadFile(sb2, 'js/course-detail.js');
  await sleep(20);
  assert('缺 courseId → 显示「缺少课程参数」', /缺少课程参数/.test(doc2.getElementById('cd-mount').textContent));

  console.log('\n--- 反向：courseId 存在但课程不存在 → 显示加载失败 ---');
  const { sb: sb3, doc: doc3 } = baseSandbox(html, 'http://127.0.0.1:8080/course-detail.html?courseId=NOPE');
  sb3.location.search = '?courseId=NOPE';
  sb3.getCourseById = () => Promise.resolve(null);
  sb3.fetchScheduleList = () => Promise.resolve([]);
  sb3.getTenantCodeParam = () => ''; sb3.request = () => Promise.resolve([]);
  sb3.applyTerms = () => {}; sb3.applyDocumentTitle = () => {}; sb3.pageUrl = (f) => f;
  sb3.termText = (k) => k; sb3.enumTermText = () => ''; sb3.courseTypeText = () => ''; sb3.workLanguageText = (v) => v;
  loadFile(sb3, 'js/course-detail.js');
  await sleep(20);
  assert('课程不存在 → 显示「课程不存在或加载失败」', /课程不存在或加载失败/.test(doc3.getElementById('cd-mount').textContent));
})();

// ===========================================================================
// S5：教师列表页（新建页 smoke）
// ===========================================================================
(async function teacherList() {
  console.log('\n========== S5 教师列表页 smoke ==========');
  const html = '<!DOCTYPE html><html><body><a id="tl-back"></a><div id="tl-grid"></div></body></html>';
  const { sb, doc } = baseSandbox(html, 'http://127.0.0.1:8080/teacher-list.html?tCode=TENANT_A');
  sb.location.search = '?tCode=TENANT_A';
  let reqUrl = null, reqParams = null;
  sb.request = (cfg) => { reqUrl = cfg.url; reqParams = cfg.params; return Promise.resolve([{ publishedProfileId: 'P1', teacherId: 'T1', name: '孙律师', title: '资深', summary: 's' }, { publishedProfileId: 'P2', teacherId: 'T2', name: '周律师', title: '专职', summary: 's2' }]); };
  sb.getTenantCodeParam = () => 'TENANT_A';
  sb.applyTerms = () => {}; sb.applyDocumentTitle = () => {};
  sb.pageUrl = (f) => './' + f;
  sb.termText = (k) => ({ teacher: '律师' }[k] || k);

  loadFile(sb, 'js/teacher-list.js');
  await sleep(40);
  assert('拉取师资列表接口被调用', /teacher\/published\/public-list/.test(reqUrl || ''), reqUrl);
  assert('接口带 tenantCode=TENANT_A', reqParams && reqParams.tenantCode === 'TENANT_A', JSON.stringify(reqParams));
  const cards = doc.querySelectorAll('#tl-grid .tl-card');
  assert('渲染出 2 张师资卡片', cards.length === 2, 'cards=' + cards.length);
  assert('卡片含姓名「孙律师」', /孙律师/.test(doc.getElementById('tl-grid').textContent));

  console.log('\n--- 点击卡片 → 跳转公开页（不泄露身份，仅 publishedProfileId）---');
  if (typeof sb.window.__tlCardClick === 'function') sb.window.__tlCardClick(0);
  const target = sb.location.href;
  assert('点卡片跳转 teacherPublishedProfile.html?id=P1', /teacherPublishedProfile\.html/.test(target) && /[?&]id=P1/.test(target), target);
  assert('跳转不携带 userId（仅 id）', !/[?&]teacherId=/.test(target) && !/[?&]userId=/.test(target), target);

  console.log('\n--- 反向：空列表 → 显示空状态 ---');
  const { sb: sb2, doc: doc2 } = baseSandbox(html, 'http://127.0.0.1:8080/teacher-list.html');
  sb2.location.search = '';
  sb2.request = () => Promise.resolve([]);
  sb2.getTenantCodeParam = () => '';
  sb2.applyTerms = () => {}; sb2.applyDocumentTitle = () => {};
  sb2.pageUrl = (f) => f; sb2.termText = (k) => ({ teacher: '律师' }[k] || k);
  loadFile(sb2, 'js/teacher-list.js');
  await sleep(20);
  assert('空列表显示「暂无可展示的律师信息」', /暂无可展示的律师信息/.test(doc2.getElementById('tl-grid').textContent));
})();

// ===========================================================================
// T4：删除学生评价 mock（静态守卫）
// ===========================================================================
(async function studentEvalMockRemoved() {
  console.log('\n========== T4 删除学生评价 mock（静态守卫）==========');
  const shtml = fs.readFileSync(path.join(FRONTEND, 'student.html'), 'utf8');
  const banned = ['course_review', 'evaluation-modal', 'evaluation-textarea', 'star-rating', 'evaluateCourse', 'submitEvaluation', 'selectStar', 'updateStarRating', 'closeEvaluationModal', 'editEvaluation', 'evaluation-card'];
  banned.forEach((tok) => {
    assert('student.html 不含残留「' + tok + '」', !new RegExp('\\b' + tok.replace(/[-]/g, '\\-') + '\\b').test(shtml), '仍命中 ' + tok);
  });
  assert('student.html 不再有硬编码占位「张三」', !/张三/.test(shtml));
  assert('student.html 仍保留 profile 菜单（未误删）', /menu-item[^>]*key="profile"/.test(shtml));

  // T5 配套：teacher.html 的活动代码（case 块）不应再含旧 mock 假数据
  const thtml = fs.readFileSync(path.join(FRONTEND, 'teacher.html'), 'utf8');
  const profileCase = /case 'profile':[\s\S]*?break;\s*\}/.exec(thtml);
  const reviewCase = /case 'student_review':[\s\S]*?break;\s*\}/.exec(thtml);
  assert('teacher.html 的 profile 活动 case 调用 renderTeacherProfile（真实渲染）', profileCase && /renderTeacherProfile/.test(profileCase[0]));
  assert('teacher.html 的 profile 活动 case 不含旧 mock 假数据「李华」', profileCase && !/李华/.test(profileCase[0]));
  assert('teacher.html 的 student_review 活动 case 已改为「暂未开放」空状态（非评价 mock 假数据）', reviewCase && /暂未开放/.test(reviewCase[0]));
  assert('teacher.html 的 student_review 活动 case 不含评价 mock「4.9分/李四」', reviewCase && !/4\.9分/.test(reviewCase[0]) && !/李四/.test(reviewCase[0]));
  assert('teacher.html 已引入 teacher-profile.js', /js\/teacher-profile\.js/.test(thtml));
})();

// ===========================================================================
console.log('\n\n############################################');
console.log('前端双端改进测试汇总：共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
console.log('############################################');
process.exit(fail ? 1 : 0);
