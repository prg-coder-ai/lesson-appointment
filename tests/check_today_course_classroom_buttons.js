/**
 * 「今日课程」列表的课堂入口按钮验证（2026-11-13）
 *
 * 覆盖 classroomButtonsFor(cardInfo, role) 的阶段分支（实现在 appointmentNotes.js，
 * 判定与按钮拼装委托给 my-classroom-core.js）：
 *
 *   | 阶段        | 学生           | 教师                        |
 *   |------------|----------------|-----------------------------|
 *   | upcoming   | 进入课程        | 课程准备 + 进入课程           |
 *   | live       | 进入课程        | 进入课程                     |
 *   | past       | 课程回看        | 课程回看                     |
 *   | 已取消/拒绝 | 无              | 无                          |
 *   | admin 角色  | 无（本需求只管师生）| 无                        |
 *
 * 另含：课次标识拼装（classIndex=2 → sid~2）、课堂未开通时不出按钮、时间缺失不出按钮、
 *      以及"两个渲染点确实调用了它"的静态防回归。
 *
 * 用法：node tests/check_today_course_classroom_buttons.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const CORE = path.join(FRONTEND, 'js', 'public', 'my-classroom-core.js');
const NOTES = path.join(FRONTEND, 'js', 'public', 'appointmentNotes.js');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.error('需要 jsdom：npm install --no-save jsdom');
  process.exit(2);
}

let pass = 0;
let fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  :: ' + extra : '')); }
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="dynamic-content-center"></div></body></html>',
  { url: 'http://127.0.0.1:8080/teacher.html' });
const doc = dom.window.document;

const sb = {};
sb.window = sb;
sb.self = sb;
sb.globalThis = sb;
sb.document = doc;
doc.write = function () {};
sb.console = console;
sb.localStorage = (function () {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  };
})();
sb.location = { href: 'http://127.0.0.1:8080/teacher.html', pathname: '/teacher.html', search: '', origin: 'http://127.0.0.1:8080' };
sb.history = { replaceState() {}, pushState() {} };
sb.pageUrl = function (name, params) {
  let qs = '';
  if (params) {
    qs = '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  }
  return './' + name + qs;
};
sb.ApiPaths = { ENDPOINTS: { CLASSROOM_MATERIAL_FILE: (sid) => '/api/v1/classrooms/' + sid + '/materials/file' } };
sb.hasClassroom = () => true;
sb.getClassroomApiBaseUrl = () => '';
sb.ensureClassroomConfig = async () => ({ enabled: true });
// appointmentNotes.js 顶层与行渲染会用到的少量依赖（本用例只调按钮函数，仍给最小桩避免报错）
sb.userRole = 'teacher';
sb.userId = 't-1';
sb.termText = (k) => ({ teacher: '教师', student: '学生', course: '课程', leave: '请假' }[k] || k);
sb.Pagination = { pageNum: 1, pageSize: 10, total: 0, totalPages: 0 };
sb.applyTerms = () => {};
sb.getPagebar = () => '';
sb.assignLoadobjectListFunction = () => {};
sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };

vm.createContext(sb);
vm.runInContext(fs.readFileSync(CORE, 'utf8'), sb, { filename: 'my-classroom-core.js' });
vm.runInContext(fs.readFileSync(NOTES, 'utf8'), sb, { filename: 'appointmentNotes.js' });

/**
 * 相对当前时间生成 UTC 裸串（后端 appointmentDatetime 就是这种形态）。
 * 注意 offsetMs 是**偏移量**：负数=过去、正数=未来（函数名里的 Ago 是历史命名，别按字面理解）。
 */
function utcAgoMs(offsetMs) {
  const d = new Date(Date.now() + offsetMs);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function card(overrides) {
  const base = {
    scheduleId: 'sched-A',
    classIndex: 1,
    status: 'active',
    rawDatetime: utcAgoMs(-2 * 3600 * 1000), // 默认：2 小时前（负数偏移）→ 已结束（课时 60）
    classDuration: 60
  };
  return Object.assign(base, overrides || {});
}

function has(html, text) {
  return String(html || '').indexOf(text) >= 0;
}

console.log('[0] 基础导出');
assert('appointmentNotes.js 暴露 classroomButtonsFor', typeof sb.classroomButtonsFor === 'function');
assert('core 暴露 classroomKeyOf / classroomPhase / buildEntryButtons',
  typeof sb.MyClassroomCore.classroomKeyOf === 'function'
  && typeof sb.MyClassroomCore.classroomPhase === 'function'
  && typeof sb.MyClassroomCore.buildEntryButtons === 'function');
assert('core 暴露行内入口 window.ClassroomEntry',
  sb.ClassroomEntry && typeof sb.ClassroomEntry.enter === 'function'
  && typeof sb.ClassroomEntry.replay === 'function'
  && typeof sb.ClassroomEntry.prep === 'function');

console.log('\n[1] 课次标识拼装（与后端 ClassroomKey.of 同规则）');
assert('classIndex=1 → 裸 id', sb.MyClassroomCore.classroomKeyOf('sid-1', 1) === 'sid-1');
assert('classIndex=2 → sid~2', sb.MyClassroomCore.classroomKeyOf('sid-1', 2) === 'sid-1~2');
assert('classIndex=null → 裸 id', sb.MyClassroomCore.classroomKeyOf('sid-1', null) === 'sid-1');
assert('classIndex=-1 → 裸 id（历史默认值）', sb.MyClassroomCore.classroomKeyOf('sid-1', -1) === 'sid-1');

console.log('\n[2] 阶段判定（UTC 裸串 + 课时）');
const P = sb.MyClassroomCore.classroomPhase;
assert('2 小时前 + 60 分钟 → past', P(utcAgoMs(-2 * 3600e3), 60) === 'past', P(utcAgoMs(-2 * 3600e3), 60));
assert('10 分钟前 + 60 分钟 → live', P(utcAgoMs(-10 * 60e3), 60) === 'live');
assert('2 小时后 → upcoming', P(utcAgoMs(2 * 3600e3), 60) === 'upcoming');
assert('时间缺失 → unknown', P(null, 60) === 'unknown');
assert('带 Z 后缀也能解析', P(new Date(Date.now() - 3 * 3600e3).toISOString(), 60) === 'past');

console.log('\n[3] 教师端按钮组合');
var tb = sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(2 * 3600e3) }), 'teacher');
assert('未开始 → 课程准备 + 进入课程', has(tb, '课程准备') && has(tb, '进入课程'), tb);
assert('未开始 → 无课程回看', !has(tb, '课程回看'));

var tbLive = sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(-10 * 60e3) }), 'teacher');
assert('进行中 → 进入课程', has(tbLive, '进入课程'), tbLive);
assert('进行中 → 无课程准备/课程回看', !has(tbLive, '课程准备') && !has(tbLive, '课程回看'));

var tbPast = sb.classroomButtonsFor(card(), 'teacher');
assert('已结束 → 课程回看', has(tbPast, '课程回看'), tbPast);
assert('已结束 → 无进入课程', !has(tbPast, '进入课程'));

console.log('\n[4] 学生端按钮组合');
var st = sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(2 * 3600e3) }), 'student');
assert('未开始 → 进入课程', has(st, '进入课程'), st);
assert('未开始 → 无课程准备（教师专属）', !has(st, '课程准备'));
var stPast = sb.classroomButtonsFor(card(), 'student');
assert('已结束 → 课程回看', has(stPast, '课程回看'), stPast);
assert('已结束 → 无进入课程', !has(stPast, '进入课程'));

console.log('\n[5] 不该出现按钮的场景');
assert('已取消预约 → 无按钮', sb.classroomButtonsFor(card({ status: 'cancelled' }), 'teacher') === '');
assert('拒绝/删除态 → 无按钮',
  sb.classroomButtonsFor(card({ status: 'reject' }), 'student') === ''
  && sb.classroomButtonsFor(card({ status: 'delete' }), 'student') === '');
assert('admin 角色 → 无按钮', sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(2 * 3600e3) }), 'admin') === '');
assert('时间缺失 → 无按钮', sb.classroomButtonsFor(card({ rawDatetime: null }), 'teacher') === '');
sb.hasClassroom = () => false;
assert('课堂未开通 → 无按钮', sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(2 * 3600e3) }), 'teacher') === '');
sb.hasClassroom = () => true;

console.log('\n[6] 跳转目标');
var k2 = sb.classroomButtonsFor(card({ classIndex: 2, rawDatetime: utcAgoMs(2 * 3600e3) }), 'teacher');
assert('第 2 课次按钮带 sid~2', has(k2, 'sched-A~2'), k2);
assert('课程准备走 ClassroomEntry.prep', has(k2, 'ClassroomEntry.prep'));
var kPast = sb.classroomButtonsFor(card(), 'student');
assert('课程回看走 ClassroomEntry.replay', has(kPast, 'ClassroomEntry.replay'), kPast);
var kLive = sb.classroomButtonsFor(card({ rawDatetime: utcAgoMs(-10 * 60e3) }), 'student');
assert('进入课程走 ClassroomEntry.enter', has(kLive, 'ClassroomEntry.enter'), kLive);

console.log('\n[7] 静态防回归：两个渲染点都接了按钮');
const notesSrc = fs.readFileSync(NOTES, 'utf8');
const trCall = /formAppointmentTr[\s\S]*?classroomButtonsFor\(cardInfo, userRole\)/.test(notesSrc);
const grpCall = /formAppointmentGroupTr[\s\S]*?classroomButtonsFor\(target, 'teacher'\)/.test(notesSrc);
assert('学生/管理员行 formAppointmentTr 调用了 classroomButtonsFor', trCall);
assert('教师聚合行 formAppointmentGroupTr 调用了 classroomButtonsFor', grpCall);
assert('processOne 带出 rawDatetime 与 classDuration',
  /rawDatetime:\s*appointment\.appointmentDatetime/.test(notesSrc)
  && /classDuration:\s*scheduleObject\.classDuration/.test(notesSrc));

console.log('\n[8] 课程准备页存在且挂载正确');
const prepHtml = path.join(FRONTEND, 'classroom-prep.html');
assert('classroom-prep.html 存在', fs.existsSync(prepHtml));
const prepSrc = fs.readFileSync(prepHtml, 'utf8');
assert('准备页引入 classroom-prep.js', /js\/classroom\/classroom-prep\.js/.test(prepSrc));
assert('准备页引入 my-classroom-core.js', /js\/public\/my-classroom-core\.js/.test(prepSrc));
assert('准备页引入 feature-flags.js', /js\/public\/feature-flags\.js/.test(prepSrc));

console.log('\n==== ' + (fail ? 'FAILED' : 'ALL PASS') + '  pass=' + pass + ' fail=' + fail + ' ====');
process.exit(fail ? 1 : 0);
