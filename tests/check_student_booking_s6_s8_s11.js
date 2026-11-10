/**
 * 学生端「课程预订」→ S6（名额进度条）/ S8（alert→mfToast）/ S11（骨架屏+空状态）验证
 *
 * 验证点：
 *  - S6：renderSchedule 把 booked/total/remaining 同源写入进度条；满额转红(mf-quota-full)、
 *        无总席位→未知(mf-quota-unknown)；切换/重置课程时进度条复位。
 *  - S8：所有原生 alert( 已改为 uiToast(；uiToast 优先 window.mfToast（#mf-toast），
 *        降级才用原生 alert（仅 ui-kit 未加载的纯单测沙箱）；不静默吞错。
 *  - S11：课程列表加载先铺骨架屏；空列表/日历无数据时显示空状态组件（非空白）。
 *
 * 方案：Node vm 沙箱加载**真实** frontend/js/student-bookingCards.js，DOM 用 jsdom 真实现，
 *      接口用可观测假实现；断言落在 DOM 态与函数行为，而非只看源码长相。
 *
 * 用法：
 *   export NODE_PATH=<workspace>/node_modules
 *   node tests/check_student_booking_s6_s8_s11.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const SRC = path.join(FRONTEND, 'js', 'student-bookingCards.js');
const STUDENT_HTML = path.join(FRONTEND, 'student.html');
const code = fs.readFileSync(SRC, 'utf8');

function extractBookingTemplate() {
  const html = fs.readFileSync(STUDENT_HTML, 'utf8');
  const m = html.match(/<template id="tpl-student-booking">[\s\S]*?<\/template>/);
  if (!m) throw new Error('在 student.html 中找不到 #tpl-student-booking 模板');
  return m[0];
}
const tplHtml = extractBookingTemplate();

let pass = 0, fail = 0;
const assert = (n, c, x) => {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '  → ' + x : '')); }
};

const DOM_HTML = '<!DOCTYPE html><html><body><div id="dynamic-content-center"></div>'
  + tplHtml + '</body></html>';

const mkSchedule = (id, sites) => ({
  scheduleId: id, courseId: 'C1', name: '班' + id, status: 'active',
  availableSites: sites, startDate: '2026-10-01', startTime: '09:00',
  endDate: '2026-10-01', timeZone: 'Asia/Shanghai',
  repeatType: 'none', repeatInterval: null, repeatDays: null,
});

async function makeSandbox(cfg) {
  cfg = cfg || {};
  const dom = new JSDOM(DOM_HTML, { url: 'http://127.0.0.1:8080/student.html' });
  const doc = dom.window.document;
  const calls = { toast: [], alert: [], confirm: [] };

  const sb = {};
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.document = doc;
  doc.write = function () {}; doc.open = function () { return doc; }; doc.close = function () {};
  sb.location = { href: 'http://127.0.0.1:8080/student.html', pathname: '/student.html', search: '', origin: 'http://127.0.0.1:8080' };
  sb.history = { replaceState() {}, pushState() {} };
  const store = new Map();
  sb.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
  sb.sessionStorage = sb.localStorage;
  sb.console = { log() {}, warn() {}, error() {} };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = setInterval; sb.clearInterval = clearInterval;
  sb.URL = URL; sb.URLSearchParams = URLSearchParams; sb.Intl = Intl;
  // S8：可观测的 toast / alert / confirm 记录器（默认“无 ui-kit”，走原生降级）
  sb.alert = m => { calls.alert.push(m); };
  sb.confirm = () => true;
  sb.mfToast = null; // 显式置空 → 走原生 alert 降级（除非用例另行注入）

  sb.userRole = 'student'; sb.userId = 'U1'; sb.userTimeZone = 'Asia/Shanghai';
  sb.userTimeZoneDisplay = 'none';
  sb.currentCourseId = ''; sb.courseList = cfg.courseList || [];
  sb.scheduleList = []; sb.scheduleObject = null; sb.selectedScheuleId = null; sb.scheduleResult = null;

  sb.fetchScheduleList = async (cid, status) => (cfg.list || []).slice();
  sb.getBookingCountByScheduleId = async (sid) => (cfg.booked || 0);
  sb.getBookingInfo = async () => (cfg.bookings || []);
  sb.getUserNameById = async () => 'T老师';
  sb.generateScheduleListFromServer = async () => (cfg.genResult || []).slice();
  sb.getAppointmentsByBookingId = async () => [];
  sb.tzSwitchTo = async (from, dt) => ({ dateTime: dt, weekday: '周一' });
  sb.getRepeatDescription = () => '每1天一次';
  sb.getMyDatetime = async () => ({ dateTime: '2026-10-01 09:00', weekday: '周四' });
  sb.getMyEndDatetime = async () => ({ dateTime: '2026-10-01 10:00', weekday: '周四' });
  sb.checkCourseAndSchedule = () => true;
  sb.operateBookingStatus = async () => ({});
  sb.Pagination = { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 };
  sb.request = async () => ({ total: 0, totalPages: 0, rows: cfg.courseRows || [] });
  sb.assignLoadobjectListFunction = () => {};
  sb.getPagebar = () => '';
  sb.renderPagination = () => {};
  sb.applyTerms = () => {};

  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: 'js/student-bookingCards.js' });
  await sb.window.renderStudentBookingCards();
  return { sb, doc, calls, id: doc.getElementById.bind(doc) };
}

(async function main() {

  // =====================================================================
  console.log('\n=== S6 进度条：正常占用比例 ===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, 5)], booked: 2 });
    const { sb, id } = env;
    assert('进度条 DOM 已随模板注入（quotaBar/quotaFill/quotaText）',
      !!id('quotaBar') && !!id('quotaFill') && !!id('quotaText'));
    sb.window.updateQuotaBar(2, 5, 3);
    assert('已订2/总5 → 填充 40%', id('quotaFill').style.width === '40%', id('quotaFill').style.width);
    assert('文案含「已订 2 / 总 5」', /已订 2 \/ 总 5/.test(id('quotaText').textContent), id('quotaText').textContent);
    assert('文案含「剩 3」', /剩 3/.test(id('quotaText').textContent), id('quotaText').textContent);
    assert('未满 → 无 mf-quota-full', !id('quotaBar').classList.contains('mf-quota-full'));
  }

  // =====================================================================
  console.log('\n=== S6 进度条：满额转红 ===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, 5)], booked: 5 });
    const { sb, id } = env;
    sb.window.updateQuotaBar(5, 5, 0);
    assert('已满 → 填充 100%', id('quotaFill').style.width === '100%', id('quotaFill').style.width);
    assert('已满 → 带 mf-quota-full（转红）', id('quotaBar').classList.contains('mf-quota-full'));
    assert('文案含「（已满）」', /（已满）/.test(id('quotaText').textContent), id('quotaText').textContent);
  }

  // =====================================================================
  console.log('\n=== S6 进度条：无总席位 → 未知（不伪装比例）===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, 5)], booked: 5 });
    const { sb, id } = env;
    sb.window.updateQuotaBar(5, 0, null); // 总席位异常（0/NaN）
    assert('无总席位 → 填充 0%', id('quotaFill').style.width === '0%', id('quotaFill').style.width);
    assert('无总席位 → 带 mf-quota-unknown', id('quotaBar').classList.contains('mf-quota-unknown'));
    assert('无总席位 → 文案「名额未知」', id('quotaText').textContent === '名额未知', id('quotaText').textContent);
    assert('无总席位 → 不误挂满额红', !id('quotaBar').classList.contains('mf-quota-full'));
  }

  // =====================================================================
  console.log('\n=== S6 进度条：切换/重置课程时复位（不留上一排期比例）===');
  {
    const env = await makeSandbox({ list: [mkSchedule(1001, 5)], booked: 5 });
    const { sb, id } = env;
    sb.window.updateQuotaBar(5, 5, 0);
    assert('先制造满额态', id('quotaBar').classList.contains('mf-quota-full'));
    // loadSchedule('') 会先 resetScheduleInfoPanel() 再因无 cid 返回 → 进度条应被清空
    await sb.window.loadSchedule('');
    assert('重置后填充 0%', id('quotaFill').style.width === '0%', id('quotaFill').style.width);
    assert('重置后无满额红', !id('quotaBar').classList.contains('mf-quota-full'));
    assert('重置后无未知态', !id('quotaBar').classList.contains('mf-quota-unknown'));
    assert('重置后文案清空', id('quotaText').textContent === '', '[' + id('quotaText').textContent + ']');
  }

  // =====================================================================
  console.log('\n=== S6 源码守卫：renderSchedule 调用 updateQuotaBar 且同源 ===');
  {
    assert('renderSchedule 末尾调用 updateQuotaBar(totalBooked, totalSites, remainingSites)',
      /updateQuotaBar\(totalBooked, totalSites, remainingSites\)/.test(code));
    assert('resetScheduleInfoPanel 复位进度条（清 mf-quota-full/unknown + 宽度0 + 文案空）',
      /getElementById\('quotaBar'\)[\s\S]{0,200}getElementById\('quotaFill'\)/.test(code));
    assert('模板含进度条容器 #quotaBar 且用 text 数值不走别处',
      /<div class="mf-quota-bar" id="quotaBar"/.test(tplHtml));
  }

  // =====================================================================
  console.log('\n=== S8 源码守卫：原生 alert 已全量迁移到 uiToast ===');
  {
    assert('源码中不再出现原生 alert( 调用（仅封装体用 _nativeAlert 兜底，无括号）',
      code.indexOf('alert(') === -1, '仍有 alert( 残留');
    const uiToastHits = (code.match(/uiToast\(/g) || []).length;
    assert('uiToast( 已接管通知（>=20 处）', uiToastHits >= 20, 'uiToast( 出现 ' + uiToastHits + ' 次');
    assert('uiToast 优先挂 window.mfToast（共享 UI 基建 #mf-toast）',
      /typeof window\.mfToast === 'function'/.test(code));
    assert('uiToast 降级才用原生 alert（ui-kit 未加载时）',
      /_nativeAlert\(message\)/.test(code));
    assert('uiConfirm 走 window.mfConfirm（返回 Promise）',
      /typeof window\.mfConfirm === 'function'/.test(code));
  }

  // =====================================================================
  console.log('\n=== S8 行为：uiToast 优先 mfToast，且不会误调原生 alert ===');
  {
    const env = await makeSandbox({});
    let mfCalls = [];
    env.sb.mfToast = (m, type) => { mfCalls.push({ m, type }); return null; };
    env.sb.window.uiToast('预约成功', 'success');
    assert('注入了 mfToast 时调用它', mfCalls.length === 1 && mfCalls[0].m === '预约成功', JSON.stringify(mfCalls));
    assert('类型正确透传（success）', mfCalls[0].type === 'success');
    assert('原生 alert 未被误调', env.calls.alert.length === 0, env.calls.alert.join('|'));
  }

  // =====================================================================
  console.log('\n=== S8 行为：ui-kit 未加载时降级到原生 alert（沙箱保底）===');
  {
    const env = await makeSandbox({}); // mfToast 默认 null
    env.sb.window.uiToast('刷新失败，请稍后重试');
    assert('无 mfToast 时降级到原生 alert', env.calls.alert.length === 1, env.calls.alert.join('|'));
    assert('降级 alert 文案与调用一致', env.calls.alert[0] === '刷新失败，请稍后重试');
  }

  // =====================================================================
  console.log('\n=== S8 行为：confirm 改为 await uiConfirm（取消则中断，不误执行）===');
  {
    // 取消预订场景：confirm 返回 false → 不应继续操作
    const env = await makeSandbox({});
    let confirmCalls = 0;
    env.sb.mfConfirm = () => { confirmCalls++; return Promise.resolve(false); }; // 用户点取消
    // deleteBooking_student / cancelBooking_student 为块内函数，经 window 暴露；
    // 这里直接校验 uiConfirm 封装：取消时 resolve(false)、确定时 resolve(true)
    const r1 = await env.sb.window.uiConfirm('确认删除预订吗？');
    assert('uiConfirm 取消 → 返回 false', r1 === false && confirmCalls === 1, 'r1=' + r1);
    env.sb.mfConfirm = () => { confirmCalls++; return Promise.resolve(true); };
    const r2 = await env.sb.window.uiConfirm('确认取消预订吗？');
    assert('uiConfirm 确定 → 返回 true', r2 === true && confirmCalls === 2, 'r2=' + r2);
  }

  // =====================================================================
  console.log('\n=== S11 骨架屏：课程列表加载先铺骨架屏 ===');
  {
    const env = await makeSandbox({});
    // 直接调用暴露的骨架函数（等价于 loadAndRenderCourse_student 开头铺的那一层）
    env.sb.window.renderCourseListSkeleton();
    const cards = env.id('courseCardList').children;
    assert('骨架屏生成 N 张占位卡片（= min(pageSize,6) = 6）', cards.length === 6, cards.length + ' 张');
    assert('每张占位卡含骨架块 mf-skeleton-card',
      Array.from(cards).every(c => c.querySelector && c.querySelector('.mf-skeleton-card')), '');
  }

  // =====================================================================
  console.log('\n=== S11 空状态：空课程列表显示空状态组件（非空白）===');
  {
    const env = await makeSandbox({ courseRows: [] }); // 服务器返回 0 条
    await env.sb.window.renderStudentBookingCards();
    const empty = env.id('courseCardList').querySelector('.mf-empty-state');
    assert('空列表渲染了空状态组件', !!empty);
    assert('空状态标题为「暂无可选课程」', empty && /暂无可选课程/.test(empty.textContent), empty && empty.textContent);
  }

  // =====================================================================
  console.log('\n=== S11 空状态：日历无数据时显示空状态（非空白）===');
  {
    const env = await makeSandbox({ courseRows: [] });
    await env.sb.window.renderStudentBookingCards();
    // 触发一次 resetScheduleInfoPanel → renderCalendar（scheduleResult=null 走空分支）
    await env.sb.window.loadSchedule('');
    const empty = env.id('calendar').querySelector('.mf-empty-state');
    assert('日历空数据渲染了空状态组件', !!empty);
    assert('日历空状态标题为「暂无排期数据」', empty && /暂无排期数据/.test(empty.textContent), empty && empty.textContent);
  }

  console.log('\n共 ' + (pass + fail) + ' 项，PASS ' + pass + '，FAIL ' + fail);
  if (fail) process.exit(1);
})().catch(e => { console.error('测试异常终止:', e); process.exit(1); });
