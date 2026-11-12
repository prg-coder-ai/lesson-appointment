/**
 * 「我的课堂」渲染与交互验证（2026-11-13）
 *
 * 覆盖：
 *   ① 教师端：排期列表 → 点「课次」展开课次表 → 课次含「进入课堂」/「资料·上传」/「同步课堂」
 *   ② 教师端：点课次「资料 / 上传」→ 出现上传入口 + 已上传文件列表
 *   ③ 学生端：我的预约 → 点「课次」展开 → 已结束课次显示「回放」且不显示「进入课堂」；
 *              未结束课次相反
 *   ④ 学生端：资料面板只读（无「上传资料」按钮）
 *   ⑤ 课次标识：点第 2 课次的「进入课堂」→ 跳转带 scheduleId=<sid>~2（服务端 classroomKey，
 *      前端不得自己拼）
 *   ⑥ 整期资料：以裸 scheduleId 作为 key 拉资料（排期级资料池）
 *
 * 用法：node tests/check_my_classroom_render.js
 * 依赖：jsdom（devDependency，运行时按需安装即可）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const FILES = [
  path.join(ROOT, 'js', 'public', 'my-classroom-core.js'),
  path.join(ROOT, 'js', 'teacher-myClassroom.js'),
  path.join(ROOT, 'js', 'student-myClassroom.js')
];

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

const SID = 'sched-1';
const SCHEDULES = [
  {
    scheduleId: SID, courseId: 'c1', name: '', status: 'active',
    startTime: '2026-11-13 20:00:00', endTime: '2026-12-31 21:00:00',
    repeatType: 2, repeatInterval: 1, repeatDays: '1,3', classDuration: 60, timeZone: 'Asia/Shanghai'
  },
  {
    scheduleId: 'sched-2', courseId: 'c2', name: '口语冲刺', status: 'active',
    startTime: '2026-11-20 19:00:00', endTime: '2026-11-20 20:00:00',
    repeatType: 0, repeatInterval: 1, repeatDays: '', classDuration: 60, timeZone: 'Asia/Shanghai'
  }
];

// 课次：第 1 已结束、第 2 进行中、第 3 未开始
const INSTANCES = [
  { classIndex: 1, scheduleId: SID, classroomKey: SID, startTime: '2026-11-04 20:00:00', endTime: '2026-11-04 21:00:00', durationMinutes: 60, classCount: 3, state: 'finished', past: true },
  { classIndex: 2, scheduleId: SID, classroomKey: SID + '~2', startTime: '2026-11-13 01:00:00', endTime: '2026-11-13 02:00:00', durationMinutes: 60, classCount: 3, state: 'ongoing', past: false },
  { classIndex: 3, scheduleId: SID, classroomKey: SID + '~3', startTime: '2026-11-25 20:00:00', endTime: '2026-11-25 21:00:00', durationMinutes: 60, classCount: 3, state: 'upcoming', past: false }
];

const MATERIALS = [
  { materialId: 1, fileName: '第一讲讲义.pdf', fileSize: 204800, url: 'https://example.test/m1' },
  { materialId: 2, fileName: '单词表.docx', fileSize: 40960, url: 'https://example.test/m2' }
];

function makeSandbox(role) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="dynamic-content-center"></div></body></html>',
    { url: 'http://127.0.0.1:8080/' + (role === 'teacher' ? 'teacher.html' : 'student.html') });
  const doc = dom.window.document;

  const calls = {
    request: [], materials: [], playback: [], uploads: [], nav: []
  };

  const sb = {};
  sb.window = sb;
  sb.self = sb;
  sb.globalThis = sb;
  sb.document = doc;
  doc.write = function () {};
  sb.console = console;

  // 登录态（api.js 里 userId / userRole 是全局 let，这里等价地用 sandbox 属性提供）
  sb.userId = role === 'teacher' ? 't-1' : 'st-1';
  sb.userRole = role;
  sb.userInfo = { userId: sb.userId, role: role, name: '测试用户', tenantCode: 'demo' };

  sb.localStorage = (function () {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k),
      clear: () => m.clear()
    };
  })();

  sb.location = {
    href: 'http://127.0.0.1:8080/x.html',
    pathname: '/x.html',
    search: '',
    origin: 'http://127.0.0.1:8080'
  };
  // location.href 写入要可观测
  Object.defineProperty(sb.location, 'href', {
    get() { return this._href || 'http://127.0.0.1:8080/x.html'; },
    set(v) { this._href = v; calls.nav.push(v); }
  });

  sb.pageUrl = function (name, params) {
    let qs = '';
    if (params) {
      qs = '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    }
    return './' + name + qs;
  };

  sb.ApiPaths = {
    ENDPOINTS: {
      SCHEDULE_LIST_BY_TEACHER: (tid) => '/api/v1/schedule/listByTeacher?teacherId=' + encodeURIComponent(tid),
      SCHEDULE_CLASS_INSTANCES: (sid) => '/api/v1/schedule/class-instances/' + encodeURIComponent(sid),
      SCHEDULE_CLASS_SYNC: (sid) => '/api/v1/schedule/class-instances/' + encodeURIComponent(sid) + '/sync',
      CLASSROOM_MATERIAL_FILE: (sid) => '/api/v1/classrooms/' + encodeURIComponent(sid) + '/materials/file'
    }
  };

  sb.hasClassroom = () => true;
  sb.getClassroomApiBaseUrl = () => '';
  sb.ensureClassroomConfig = async () => ({ enabled: true });

  sb.ClassroomAPI = {
    getMaterials: async function (base, key) {
      calls.materials.push(key);
      return MATERIALS;
    },
    getPlaybackUrl: async function (base, key) {
      calls.playback.push(key);
      return { url: 'https://example.test/replay/' + key };
    }
  };

  sb.FormData = dom.window.FormData;
  sb.open = function (url) { calls.opened = (calls.opened || []).concat([String(url)]); return null; };
  sb.confirm = () => true;
  sb.alert = () => {};
  sb.clToast = () => {};

  sb.request = async function (opts) {
    const url = String(opts.url || '');
    calls.request.push({ url: url, method: opts.method });
    if (url.indexOf('/schedule/listByTeacher') >= 0) return SCHEDULES;
    if (url.indexOf('/course/list') >= 0) return [{ courseId: 'c1', courseName: '英语口语' }, { courseId: 'c2', courseName: '口语冲刺' }];
    if (url.indexOf('/class-instances/') >= 0 && /\/sync$/.test(url)) return { pushed: true };
    if (url.indexOf('/class-instances/') >= 0) {
      // 只给 sched-1 有课次，sched-2 为空数组（验证空态）
      if (url.indexOf(SID) >= 0) return INSTANCES;
      return [];
    }
    if (/\/materials\/file$/.test(url)) { calls.uploads.push(url); return { materialId: 9 }; }
    return null;
  };

  // 学生端依赖
  sb.getBookingListPage = async () => ({
    rows: [
      { bookingId: 'b1', scheduleId: SID, status: 'booked', studentId: 'st-1' },
      { bookingId: 'b2', scheduleId: 'sched-2', status: 'booked', studentId: 'st-1' },
      { bookingId: 'b3', scheduleId: 'sched-x', status: 'cancelled', studentId: 'st-1' }
    ],
    total: 3
  });
  sb.fetchSchedule = async (sid) => SCHEDULES.find(s => s.scheduleId === sid) || null;
  sb.getCourseById = async (cid) => ({ courseId: cid, courseName: cid === 'c1' ? '英语口语' : '口语冲刺' });

  vm.createContext(sb);
  FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: path.basename(f) });
  });
  return { sb, doc, calls };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 轮询等待条件成立，最多 2s */
async function waitFor(fn, label) {
  for (let i = 0; i < 80; i++) {
    if (fn()) return true;
    await sleep(25);
  }
  return false;
}

function clickByText(root, text) {
  const btns = Array.prototype.slice.call(root.querySelectorAll('button'));
  for (const b of btns) {
    if ((b.textContent || '').trim() === text) { b.click(); return b; }
  }
  return null;
}

/** 只查找、不点击（用于"先判断有没有"再决定点不点） */
function clickTextOnly(root, text) {
  const btns = Array.prototype.slice.call(root.querySelectorAll('button'));
  for (const b of btns) {
    if ((b.textContent || '').trim() === text) return b;
  }
  return null;
}

function rowTexts(tbody) {
  return Array.prototype.slice.call(tbody.querySelectorAll('tr')).map(tr => (tr.textContent || '').replace(/\s+/g, ' ').trim());
}

async function testTeacher() {
  console.log('\n[教师端] 我的课堂');
  const { sb, doc, calls } = makeSandbox('teacher');
  assert('脚本暴露 renderMyClassroomPage', typeof sb.renderMyClassroomPage === 'function');
  assert('脚本暴露 MyClassroomCore', !!(sb.MyClassroomCore && sb.MyClassroomCore.renderInstanceTable));

  await sb.renderMyClassroomPage();
  const tbody = doc.getElementById('my-classroom-body');
  assert('排期列表已渲染（2 行）', tbody.querySelectorAll('tr').length === 2,
    '实际 ' + tbody.querySelectorAll('tr').length);

  const texts = rowTexts(tbody);
  assert('第一行含课程名与周重复描述', /英语口语/.test(texts[0]) && /每周/.test(texts[0]), texts[0]);
  assert('第二行含排期名称（无课程映射时降级）', /口语冲刺/.test(texts[1]), texts[1]);
  assert('每行都有「课次」按钮', tbody.querySelectorAll('button').length >= 4,
    '按钮数 ' + tbody.querySelectorAll('button').length);

  // 展开课次（clickByText 本身就会点击，不要点第二次——第二次是"收起"）
  const firstRow = tbody.querySelectorAll('tr')[0];
  const schBtn = clickByText(firstRow, '课次');
  assert('展开课次按钮存在', !!schBtn);
  // 注意：展开行是同步插入的（内容先是「课次加载中…」），必须等到课次真正渲染出来再断言，
  // 否则查到的是一行占位文本。
  const opened = await waitFor(() => {
    const h = doc.querySelector('tr[data-mc-host]');
    return !!(h && /第 1\/\d+ 次/.test(h.textContent || ''));
  }, '课次展开');
  assert('课次展开行已插入', opened);

  const hostTr = doc.querySelector('tr[data-mc-host]');
  const hostText = (hostTr.textContent || '').replace(/\s+/g, ' ');
  assert('课次表含「第 1/3 次」', /第 1\/3 次/.test(hostText), hostText.slice(0, 120));
  assert('课次表含「第 3/3 次」', /第 3\/3 次/.test(hostText));
  assert('教师端有「同步课堂」入口', /同步课堂/.test(hostText));
  assert('教师端有「整期资料」入口', /整期资料/.test(hostText));
  assert('教师端课次行有「进入课堂」', /进入课堂/.test(hostText));
  assert('教师端课次行有「资料 / 上传」', /资料 \/ 上传/.test(hostText));

  // 课次标识：点第 2 课次进入课堂 → 应带 sched-1~2
  const instRows = Array.prototype.slice.call(hostTr.querySelectorAll('tbody tr'))
    .filter(tr => /第 \d+\/3 次/.test(tr.textContent || ''));
  assert('课次行数为 3（不含资料面板行）', instRows.length === 3, '实际 ' + instRows.length);
  const enterBtn2 = clickByText(instRows[1], '进入课堂');
  assert('第 2 课次有「进入课堂」', !!enterBtn2);
  assert('跳转使用服务端 classroomKey（sched-1~2）',
    calls.nav.some(u => u.indexOf('scheduleId=' + encodeURIComponent(SID + '~2')) >= 0),
    JSON.stringify(calls.nav));

  // 课次资料面板
  clickByText(instRows[0], '资料 / 上传');
  const matOk = await waitFor(() => /第一讲讲义\.pdf/.test(doc.body.textContent || ''), '资料面板');
  assert('课次资料面板列出已上传文件', matOk);
  assert('教师端资料面板有「上传资料」按钮', !!clickByText(doc.body, '上传资料'));
  assert('学生课次 key 用于拉资料', calls.materials.indexOf(SID) >= 0, JSON.stringify(calls.materials));

  // 整期资料：key 应为裸 scheduleId。
  // 注意不能按 tbody 行索引取——展开行/资料面板行会插进同一个 tbody，索引会漂移，
  // 这里按「含整期资料按钮的排期行」过滤后取第二条。
  // 课次表头里也有一个「整期资料」按钮（作用于该排期），必须排除展开行与内联面板行，
  // 否则会误点到课次表里那个，key 仍然是同一排期 → 断言假失败。
  const scheduleRows = Array.prototype.slice.call(tbody.querySelectorAll('tr'))
    .filter(tr => !tr.hasAttribute('data-mc-host') && !tr.hasAttribute('data-inline'))
    .filter(tr => !!clickTextOnly(tr, '整期资料'));
  const matBtn = scheduleRows.length > 1 ? clickTextOnly(scheduleRows[1], '整期资料') : null;
  assert('第二行有「整期资料」按钮', !!matBtn);
  matBtn.click();
  const wholeOk = await waitFor(() => calls.materials.indexOf('sched-2') >= 0, '整期资料 key');
  assert('整期资料以裸 scheduleId 作为 key', wholeOk, JSON.stringify(calls.materials));
}

async function testStudent() {
  console.log('\n[学生端] 我的课堂');
  const { sb, doc, calls } = makeSandbox('student');
  assert('脚本暴露 renderStudentClassroomPage', typeof sb.renderStudentClassroomPage === 'function');

  await sb.renderStudentClassroomPage();
  const tbody = doc.getElementById('stu-classroom-body');
  assert('预约列表已渲染（2 行，已取消的被过滤）', tbody.querySelectorAll('tr').length === 2,
    '实际 ' + tbody.querySelectorAll('tr').length);
  const texts = rowTexts(tbody);
  assert('第一行含课程名与预约状态', /英语口语/.test(texts[0]) && /已确认/.test(texts[0]), texts[0]);

  const firstRow = tbody.querySelectorAll('tr')[0];
  clickByText(firstRow, '课次');
  const opened = await waitFor(() => {
    const h = doc.querySelector('tr[data-mc-host]');
    return !!(h && /第 1\/\d+ 次/.test(h.textContent || ''));
  }, '课次展开');
  assert('学生端课次展开行已插入', opened);

  const hostTr = doc.querySelector('tr[data-mc-host]');
  const instRows = Array.prototype.slice.call(hostTr.querySelectorAll('tbody tr'))
    .filter(tr => /第 \d+\/3 次/.test(tr.textContent || ''));
  assert('学生端课次行数为 3', instRows.length === 3, '实际 ' + instRows.length);

  const t0 = (instRows[0].textContent || '');
  assert('已结束课次显示「回放」', /回放/.test(t0), t0);
  assert('已结束课次不显示「进入课堂」（学生）', !/进入课堂/.test(t0), t0);
  assert('未结束课次显示「进入课堂」', /进入课堂/.test(instRows[2].textContent || ''));
  assert('未结束课次不显示「回放」', !/回放/.test(instRows[2].textContent || ''));
  assert('学生端课次有「查看资料」', /查看资料/.test(t0), t0);

  // 回放：点第 1 课次「回放」→ 拉 playback
  clickByText(instRows[0], '回放');
  const played = await waitFor(() => calls.playback.length > 0, '回放查询');
  assert('点回放会查询回放地址', played);
  assert('回放查询使用课次 key（裸 id 表示第 1 课次）', calls.playback[0] === SID, JSON.stringify(calls.playback));

  // 学生资料面板只读
  clickByText(instRows[2], '查看资料');
  const matOk = await waitFor(() => /第一讲讲义\.pdf/.test(doc.body.textContent || ''), '学生资料面板');
  assert('学生资料面板列出文件', matOk);
  assert('学生端资料面板无「上传资料」按钮', clickByText(doc.body, '上传资料') === null);

  // 学生端不应出现教师专属动作
  assert('学生端无「同步课堂」按钮', clickByText(doc.body, '同步课堂') === null);
}

async function testClassroomPageScripts() {
  console.log('\n[课堂页] 脚本清单');
  const html = fs.readFileSync(path.join(ROOT, 'classroom.html'), 'utf8');
  assert('classroom.html 引入 classroom-ws.js', /js\/public\/classroom-ws\.js/.test(html));
  assert('classroom-ws.js 在 feature-flags.js 之后',
    html.indexOf('classroom-ws.js') > html.indexOf('feature-flags.js'));
  assert('classroom.html 引入 feature-flags.js', /js\/public\/feature-flags\.js/.test(html));

  const teacherHtml = fs.readFileSync(path.join(ROOT, 'teacher.html'), 'utf8');
  assert('teacher.html 引入 my-classroom-core.js', /js\/public\/my-classroom-core\.js/.test(teacherHtml));
  assert('teacher.html 的 switch 有 my_classroom 分支', /case 'my_classroom'/.test(teacherHtml));

  const studentHtml = fs.readFileSync(path.join(ROOT, 'student.html'), 'utf8');
  assert('student.html 引入 feature-flags.js', /js\/public\/feature-flags\.js/.test(studentHtml));
  assert('student.html 引入 my-classroom-core.js', /js\/public\/my-classroom-core\.js/.test(studentHtml));
  assert('student.html 的 switch 有 my_classroom 分支', /case 'my_classroom'/.test(studentHtml));

  const adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
  assert('admin.html 的 switch 有 classroom_monitor 分支', /case "classroom_monitor"/.test(adminHtml));
}

(async function main() {
  try {
    await testTeacher();
    await testStudent();
    await testClassroomPageScripts();
  } catch (e) {
    fail++;
    console.log('  FAIL  用例执行异常 :: ' + (e && e.stack ? e.stack : e));
  }
  console.log('\n==== ' + (fail ? 'FAILED' : 'ALL PASS') + '  pass=' + pass + ' fail=' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})();
