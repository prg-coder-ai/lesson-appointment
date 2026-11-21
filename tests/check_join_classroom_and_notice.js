/**
 * 「加入课堂」与「上课通知」验证（C3 / C4，2026-11-19）
 *
 * 覆盖：
 *   ① C3 学生端页面渲染（输入框 + 查找按钮）
 *   ② C3 从完整链接 / 裸课堂号 / 多课次复合键里正确解析 scheduleId
 *   ③ C3 非法输入（含路径穿越字符）不发请求，直接给格式提示
 *   ④ C3 40402（不在名单）给出「找管理员加人」的可执行指引
 *   ⑤ C3 CLOSED 课堂不渲染「进入课堂」按钮
 *   ⑥ C4 群发只发名单里 role=student 且未 kicked 的人；标题/正文/payload/targetTenantId 正确
 *   ⑦ C4 空名单不发通知并提示先加学员
 *   ⑧ C4 payload.url 白名单：放行 http(s) 与同源 .html，拒绝 javascript:/data:/..
 *   ⑨ C4 消息详情能把 payload.url 渲染成「进入课堂」按钮
 *
 * 用法：node tests/check_join_classroom_and_notice.js
 *
 * 说明：本文件不连任何真实服务，ClassroomAPI / window.request 全部打桩——它验证的是
 * 「前端在给定返回下会做什么」，不是端到端联调。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');

let failed = 0;
let total = 0;
function check(name, cond, extra) {
  total++;
  if (cond) {
    console.log('  OK   ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name + (extra ? ' → ' + extra : ''));
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==================== C3：学生端「加入课堂」 ==================== */
async function testJoinClassroom() {
  console.log('C3 学生端「加入课堂」');
  const dom = new JSDOM('<div id="dynamic-content-center"></div>', {
    url: 'https://demo.test/student.html',
    runScripts: 'outside-only'
  });
  const win = dom.window;
  win.localStorage.setItem('currentUser', JSON.stringify({ userId: 'stu-1', role: 'student', tenantCode: 'tenantA' }));
  win.pageUrl = (name, params) => {
    const qs = params
      ? '?' + Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&')
      : '';
    return './' + name + qs;
  };
  win.getClassroomApiBaseUrl = () => '';

  const calls = [];
  let nextResult = null;
  win.ClassroomAPI = {
    getClassroomStatus: (base, sid) => {
      calls.push({ base, sid });
      if (nextResult && nextResult.error) return Promise.reject(nextResult.error);
      return Promise.resolve(nextResult);
    }
  };
  win.eval(read('js/student-joinClassroom.js'));

  const doc = win.document;
  win.renderStudentJoinClassroomPage(doc.getElementById('dynamic-content-center'));
  check('页面渲染出输入框与「查找课堂」按钮',
    !!doc.getElementById('stu-join-input') && !!doc.getElementById('stu-join-check'));

  const input = doc.getElementById('stu-join-input');
  const btn = doc.getElementById('stu-join-check');
  const resultText = () => doc.getElementById('stu-join-result').textContent;

  // ① 完整链接
  nextResult = {
    courseName: '临时课堂', status: 'LIVE',
    startTime: '2026-11-19T16:00:00', endTime: '2026-11-19T17:00:00'
  };
  input.value = 'https://demo.test/classroom.html?scheduleId=abc123def4567890abc123def4567890&tCode=tenantA&role=student';
  btn.click();
  await wait(30);
  check('从完整链接解析出 scheduleId',
    calls.length === 1 && calls[0].sid === 'abc123def4567890abc123def4567890', JSON.stringify(calls));
  check('校验通过后展示课程名与「进入课堂」',
    /临时课堂/.test(resultText()) && !!doc.getElementById('stu-join-enter'), resultText());

  // ② 裸多课次复合键
  calls.length = 0;
  input.value = 'abc123~2';
  btn.click();
  await wait(30);
  check('裸多课次复合键被接受', calls.length === 1 && calls[0].sid === 'abc123~2', JSON.stringify(calls));

  // ③ 非法输入
  calls.length = 0;
  input.value = '../../etc/passwd';
  btn.click();
  await wait(30);
  check('非法输入不发请求且提示格式不对',
    calls.length === 0 && /格式不对/.test(resultText()), resultText());

  // ④ 不在名单
  nextResult = { error: { code: 40402, message: '你不在本课堂名单内' } };
  input.value = 'abc123def4567890abc123def7890abc1';
  btn.click();
  await wait(30);
  check('40402 给出「找管理员加人」的指引',
    /不在本课堂名单内/.test(resultText()) && /加学员|加入课堂/.test(resultText()), resultText());

  // ⑤ 已结束课堂
  nextResult = { courseName: '结束课', status: 'CLOSED', startTime: '2026-11-19T10:00:00' };
  input.value = 'abc123def4567890abc123def7890abc1';
  btn.click();
  await wait(30);
  check('CLOSED 课堂不渲染「进入课堂」按钮',
    /已结束/.test(resultText()) && !doc.getElementById('stu-join-enter'), resultText());
}

/* ==================== C4-a：运营台选择器 + 群发上课通知 ==================== */
async function testOpsPickersAndNotice() {
  console.log('C4 运营台选择器与「发上课通知」');
  const dom = new JSDOM(read('classroom-ops.html'), {
    url: 'https://demo.test/classroom-ops.html',
    runScripts: 'outside-only'
  });
  const win = dom.window;
  win.localStorage.setItem('token', 'fake');
  win.localStorage.setItem('currentUser', JSON.stringify({ userId: 'adm-1', role: 'platform_admin' }));
  win.pageUrl = (name, params) => {
    const qs = params
      ? '?' + Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&')
      : '';
    return './' + name + qs;
  };
  win.getClassroomApiBaseUrl = () => '';
  win.ApiPaths = {
    ENDPOINTS: {
      MSG_SEND: '/api/v1/messages/send',
      USER_PAGE: '/api/v1/user/page',
      CLASSROOM_ADMIN_CLASSROOMS: '/api/v1/admin/classrooms/monitor',
      CLASSROOM_ADMIN_CREATE: '/api/v1/admin/classrooms',
      CLASSROOM_ADMIN_ADD_MEMBERS: (sid) => '/api/v1/admin/classrooms/' + sid + '/members',
      CLASSROOM_ADMIN_END: (sid) => '/api/v1/admin/classrooms/' + sid + '/end',
      CLASSROOM_ADMIN_RESEND_CONSUMPTION: (sid) => '/api/v1/admin/classrooms/' + sid + '/resend-consumption',
      CLASSROOM_ADMIN_CONTRACT_RESYNC: '/api/v1/admin/contract/resync',
      CLASSROOM_ADMIN_MONITOR_ALERTS: '/api/v1/admin/monitor/alerts'
    }
  };
  win.classroomUrl = (b, p) => (b || '') + p;
  win.ClassroomAPI = {
    getClassroomStatus: () => Promise.resolve({
      courseName: '应急小班', status: 'SCHEDULED',
      startTime: '2026-11-19T20:00:00', endTime: '2026-11-19T21:00:00', tenantId: 5
    }),
    getMembers: () => Promise.resolve([
      { userId: 'tea-1', role: 'teacher', displayName: '王老师' },
      { userId: 'stu-1', role: 'student', displayName: '张三' },
      { userId: 'stu-2', role: 'student', displayName: '李四' },
      { userId: 'stu-3', role: 'student', displayName: '被移出', kicked: true }
    ])
  };

  const sent = [];
  let endReject = null;
  win.confirm = () => true;   // 「强制下课」有二次确认，测试里直接放行
  win.request = (cfg) => {
    sent.push(cfg);
    const u = cfg.url || '';
    if (u === '/api/v1/messages/send') return Promise.resolve({ messageId: 9527, recipientCount: 2 });
    if (u === '/api/v1/admin/monitor/alerts') {
      return Promise.resolve({
        openDiffCount: 0,
        diffs: [],
        staleLiveCount: 1,
        staleLive: [{
          scheduleId: 'live-1', courseName: '挂了一晚上的课',
          teacherName: '王老师', endTime: '2026-11-19T18:00:00', status: 'LIVE'
        }]
      });
    }
    if (/\/api\/v1\/admin\/classrooms\/[^/]+\/end$/.test(u)) {
      return endReject ? Promise.reject(endReject) : Promise.resolve(true);
    }
    if (u === '/api/v1/user/page') {
      const role = cfg.params && cfg.params.role;
      if (role === 'teacher') {
        return Promise.resolve({
          rows: [{ userId: 'tea-1', name: '王老师', account: 'wang@demo.test', status: 'active' }],
          total: 1
        });
      }
      return Promise.resolve({
        rows: [
          { userId: 'stu-1', name: '张三', account: '13800000001', status: 'active' },
          { userId: 'stu-2', name: '李四', account: '13800000002', status: 'active' },
          { userId: 'stu-3', name: '王五', account: '13800000003', status: 'frozen' }
        ],
        total: 3
      });
    }
    if (u.indexOf('/api/v1/admin/classrooms/monitor') === 0) {
      const st = /status=([A-Z]+)/.exec(u)[1];
      // 故意把 SCHEDULED 放前面返回：排序必须由前端把 LIVE 顶上来
      if (st === 'SCHEDULED') {
        return Promise.resolve([{ scheduleId: 'sch-1', courseName: '待开课的课', status: 'SCHEDULED', startTime: '2026-11-19T21:00:00' }]);
      }
      if (st === 'LIVE') {
        return Promise.resolve([{ scheduleId: 'live-1', courseName: '进行中的课', status: 'LIVE', startTime: '2026-11-19T20:00:00' }]);
      }
      if (st === 'CLOSED') {
        return Promise.resolve([{ scheduleId: 'closed-1', courseName: '已结束的课', status: 'CLOSED', startTime: '2026-11-19T10:00:00' }]);
      }
      return Promise.resolve([]);
    }
    if (/\/api\/v1\/admin\/classrooms\/[^/]+\/resend-consumption$/.test(u)) {
      return Promise.resolve({ scheduleId: 'closed-1', consumptionVersion: 3, resent: true });
    }
    if (u === '/api/v1/admin/contract/resync') {
      return Promise.resolve([
        { scheduleId: 'live-1', exists: true, status: 'LIVE', version: 2, consumptionVersion: 0, actualEnd: null },
        { scheduleId: 'other-1', exists: false, denied: true }
      ]);
    }
    if (u === '/api/v1/admin/classrooms') {
      return Promise.resolve({ scheduleId: 'new-1', status: 'SCHEDULED', startTime: '2026-11-19T20:00:00' });
    }
    return Promise.resolve({ activeClasses: [], serverTime: '2026-11-19T16:00:00' });
  };

  win.eval(read('js/classroom/picker.js'));
  win.eval(read('js/classroom/ops.js'));
  await wait(80);  // 等 Ops.run() 与 DOMContentLoaded 那轮监控加载落地
  win.ClassroomOps.base = '';

  /* --- ① 教师候选：从 /user/page?role=teacher 加载并可搜索 --- */
  const tIn = win.document.querySelector('#tmp-teacher-pick .pk-input');
  check('教师是选择器而不是手填输入框', !!tIn);
  tIn.dispatchEvent(new win.Event('focus'));
  await wait(60);
  const tItems = win.document.querySelectorAll('#tmp-teacher-pick .pk-item');
  check('教师候选来自 /user/page?role=teacher',
    tItems.length === 1 && /王老师/.test(tItems[0].textContent), tItems.length + ' items');
  check('候选副标题带账号与状态', /wang@demo\.test/.test(tItems[0].textContent) && /正常/.test(tItems[0].textContent),
    tItems[0] ? tItems[0].textContent : '');
  tItems[0].dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  check('点击候选后 getValue 拿到 userId',
    win.ClassroomOps.pickers.tmpTeacher.getValue() === 'tea-1',
    win.ClassroomOps.pickers.tmpTeacher.getValue());

  /* --- ② 学生多选 --- */
  const sIn = win.document.querySelector('#tmp-students-pick .pk-input');
  sIn.dispatchEvent(new win.Event('focus'));
  await wait(60);
  let sItems = win.document.querySelectorAll('#tmp-students-pick .pk-item');
  check('学生候选来自 /user/page?role=student', sItems.length === 3, sItems.length + ' items');
  sItems[0].dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  sItems = win.document.querySelectorAll('#tmp-students-pick .pk-item');
  sItems[1].dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  check('多选得到两个 userId',
    JSON.stringify(win.ClassroomOps.pickers.tmpStudents.getValues()) === JSON.stringify(['stu-1', 'stu-2']),
    JSON.stringify(win.ClassroomOps.pickers.tmpStudents.getValues()));
  check('已选学生显示为 chip（可点 × 移除）',
    win.document.querySelectorAll('#tmp-students-pick .pk-chip').length === 2);

  /* --- ③ 本地过滤：搜姓名命中、搜不存在的词为空 --- */
  const byName = await win.ClassroomOps._userOptions('student', '李四');
  check('按姓名过滤候选', byName.length === 1 && byName[0].value === 'stu-2', JSON.stringify(byName));
  const byNone = await win.ClassroomOps._userOptions('student', '查无此人');
  check('无匹配时返回空列表', byNone.length === 0);

  /* --- ④ 临时建课：请求体带 userId + 真名 --- */
  win.document.getElementById('tmp-name').value = '应急小班';
  sent.length = 0;
  win.ClassroomOps._createTemp();
  await wait(80);
  const createCall = sent.find((c) => c.url === '/api/v1/admin/classrooms');
  check('建课请求已发出', !!createCall, JSON.stringify(sent.map((c) => c.url)));
  if (createCall) {
    const b = createCall.data;
    check('teacherId 取自选择器', b.teacherId === 'tea-1', b.teacherId);
    check('teacherName 用真名而不是 id', b.teacherName === '王老师', b.teacherName);
    check('students 带 userId + 真名',
      b.students.length === 2 && b.students[0].userId === 'stu-1' && b.students[0].name === '张三',
      JSON.stringify(b.students));
  }

  /* --- ⑤ 课堂候选：四态合并、LIVE 排前、不含 CLOSED --- */
  win.ClassroomOps._classroomCache = null;
  const cls = await win.ClassroomOps._classroomOptions('');
  check('课堂候选合并多个状态', cls.length === 2, JSON.stringify(cls));
  check('进行中的课堂排在最前', cls[0] && cls[0].value === 'live-1', JSON.stringify(cls.map((c) => c.value)));
  check('候选副标题带状态与短 id', /进行中|LIVE/.test(cls[0].sub) && cls[0].sub.length > 0, cls[0].sub);
  const filtered = await win.ClassroomOps._classroomOptions('待开课');
  check('课堂候选可按课程名过滤', filtered.length === 1 && filtered[0].value === 'sch-1', JSON.stringify(filtered));

  /* --- ⑥ 发上课通知：所选课堂进入请求体 --- */
  const cIn = win.document.querySelector('#ntc-schedule-pick .pk-input');
  cIn.dispatchEvent(new win.Event('focus'));
  await wait(60);
  const cItems = win.document.querySelectorAll('#ntc-schedule-pick .pk-item');
  check('课堂选择器有候选', cItems.length === 2, cItems.length + ' items');
  cItems[0].dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  check('选中课堂后 getValue 是 scheduleId',
    win.ClassroomOps.pickers.noticeClassroom.getValue() === 'live-1',
    win.ClassroomOps.pickers.noticeClassroom.getValue());

  sent.length = 0;
  win.ClassroomOps._sendNotice();
  await wait(80);

  const call = sent.find((c) => c.url === '/api/v1/messages/send');
  check('确实调用了消息发送端点', !!call, JSON.stringify(sent.map((c) => c.url)));
  if (call) {
    const d = call.data;
    check('只发给 role=student 且未 kicked 的人',
      JSON.stringify(d.recipientUserIds) === JSON.stringify(['stu-1', 'stu-2']), JSON.stringify(d.recipientUserIds));
    check('标题自动生成带课程名', /上课通知：应急小班/.test(d.title), d.title);
    check('正文含课堂号与进入方式',
      /live-1/.test(d.content) && /进入方式/.test(d.content), d.content);
    check('payload 带 classroom_join 与带 scheduleId 的链接',
      !!d.payload && d.payload.type === 'classroom_join'
      && /scheduleId=live-1/.test(d.payload.url), JSON.stringify(d.payload));
    check('平台管理员代发时带上课堂所属租户', d.targetTenantId === 5, String(d.targetTenantId));
  }
  const box = win.document.getElementById('ntc-result').textContent;
  check('结果区展示发送人数与 messageId', /已发送/.test(box) && /9527/.test(box), box);

  /* --- ⑦ 空名单：不发空通知 --- */
  win.ClassroomAPI.getMembers = () => Promise.resolve([{ userId: 'tea-1', role: 'teacher' }]);
  sent.length = 0;
  win.ClassroomOps._sendNotice();
  await wait(80);
  const box2 = win.document.getElementById('ntc-result').textContent;
  check('空名单不发通知并提示先加学员',
    sent.filter((c) => c.url === '/api/v1/messages/send').length === 0 && /加学员/.test(box2), box2);

  /* --- ⑧ 告警区：超期未下课的课堂可一键「强制下课」 --- */
  win.ClassroomOps.loadMonitor();
  await wait(80);
  const alertArea = win.document.getElementById('monitor-alerts');
  const endBtn = alertArea.querySelector('[data-alert-end]');
  check('告警区为超期课堂渲染「强制下课」按钮', !!endBtn, alertArea.textContent);
  check('告警项标出超期时长（不只给计划结束时间）',
    /已超期/.test(alertArea.textContent), alertArea.textContent);

  if (endBtn) {
    sent.length = 0;
    endBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await wait(80);
    const endCall = sent.find((c) => /\/api\/v1\/admin\/classrooms\/live-1\/end$/.test(c.url || ''));
    check('点击后调用管理员结束端点（走正常结束收尾，不是作废）',
      !!endCall, JSON.stringify(sent.map((c) => c.url)));

    // 40901（别人刚结束过）不该被当成失败：提示并刷新，不弹"结束失败"
    endReject = { code: 40901, message: '当前状态不可下课：CLOSED' };
    sent.length = 0;
    const btn2 = win.document.getElementById('monitor-alerts').querySelector('[data-alert-end]');
    if (btn2) {
      btn2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await wait(80);
      const toastText = win.document.getElementById('ops-toast').textContent;
      check('40901 提示「已被结束」而不是「结束失败」',
        /已不在进行中|已被结束/.test(toastText) && !/失败/.test(toastText), toastText);
    }
    endReject = null;
  }

  /* --- ⑨ 补发课时回流：候选含已结束课堂、请求打到 resend-consumption --- */
  win.ClassroomOps._classroomClosedCache = null;
  const withClosed = await win.ClassroomOps._classroomOptions('', true);
  check('补发候选包含已结束（CLOSED）的课堂',
    withClosed.some((c) => c.value === 'closed-1'), JSON.stringify(withClosed.map((c) => c.value)));
  check('进行中的仍排最前、已结束的垫底',
    withClosed[0].value === 'live-1' && withClosed[withClosed.length - 1].value === 'closed-1',
    JSON.stringify(withClosed.map((c) => c.value)));
  check('补发候选与发通知候选是两份缓存（发通知不含 CLOSED）',
    (win.ClassroomOps._classroomCache || []).every((c) => c.status !== 'CLOSED'),
    JSON.stringify((win.ClassroomOps._classroomCache || []).map((c) => c.status)));

  const rIn = win.document.querySelector('#rcs-schedule-pick .pk-input');
  check('补发面板是选择器而不是手填课堂号', !!rIn);
  rIn.dispatchEvent(new win.Event('focus'));
  await wait(60);
  const rItems = Array.prototype.slice.call(win.document.querySelectorAll('#rcs-schedule-pick .pk-item'));
  const closedItem = rItems.filter((el) => /已结束的课/.test(el.textContent))[0];
  check('补发候选里能选中已结束的课堂', !!closedItem, rItems.map((el) => el.textContent).join(' | '));
  if (closedItem) {
    closedItem.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
    check('选中后 getValue 是该课堂的 scheduleId',
      win.ClassroomOps.pickers.resendClassroom.getValue() === 'closed-1',
      win.ClassroomOps.pickers.resendClassroom.getValue());

    sent.length = 0;
    win.ClassroomOps._resendConsumption();
    await wait(80);
    const rc = sent.find((c) => /\/api\/v1\/admin\/classrooms\/closed-1\/resend-consumption$/.test(c.url || ''));
    check('补发调用的是 resend-consumption 端点（不是重放、不是结束）',
      !!rc, JSON.stringify(sent.map((c) => c.url)));
    const rbox = win.document.getElementById('ct-resend-result').textContent;
    check('结果区显示补发成功与新版本号',
      /已补发/.test(rbox) && /3/.test(rbox), rbox);
  }

  /* --- ⑩ 批量对表：别的租户的课显示「非本租户」，且不泄露状态 --- */
  win.document.getElementById('ct-ids').value = 'live-1\nother-1';
  sent.length = 0;
  win.ClassroomOps._resync();
  await wait(80);
  const rt = win.document.getElementById('ct-resync-table').textContent;
  check('对表把本租户的课标成「存在」', /存在/.test(rt), rt);
  check('对表把别家租户的课标成「非本租户」而不是「缺失」',
    /非本租户/.test(rt), rt);
  check('对表结果里不出现别家课堂的状态', !/other-1[^]*?LIVE/.test(rt), rt);
}

/* ==================== C4-b：payload.url 白名单与按钮 ==================== */
function testPayloadJump() {
  console.log('C4 消息详情里的「进入课堂」按钮');
  const src = read('js/messages-inbox.js');
  // 抽两个纯函数到沙箱（它们不依赖 axios / DOM，避免为测一处逻辑把整个收件箱跑起来）
  const pick = (name) => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('未找到函数 ' + name);
    let depth = 0;
    let started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') { depth++; started = true; }
      else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
    }
    throw new Error('截取 ' + name + ' 失败');
  };
  const sandbox = {
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(pick('safeJumpUrl') + '\n' + pick('payloadJumpHtml'), sandbox);
  const safe = sandbox.safeJumpUrl;
  const jump = sandbox.payloadJumpHtml;

  check('放行 http(s) 绝对地址', !!safe('https://demo.test/classroom.html?scheduleId=x'));
  check('放行同源 .html 相对页', safe('./classroom.html?scheduleId=x') === './classroom.html?scheduleId=x');
  check('拒绝 javascript: 伪协议', safe('javascript:alert(1)') === '');
  check('拒绝 data: 伪协议', safe('data:text/html,<script>x</script>') === '');
  check('拒绝含 .. 的穿越路径', safe('./../secret.html') === '');
  check('拒绝非 .html 目标（如后端接口）', safe('/api/v1/admin/classrooms/x/end') === '');
  check('classroom_join 渲染「进入课堂」按钮',
    /进入课堂/.test(jump({ type: 'classroom_join', url: 'https://demo.test/classroom.html?scheduleId=x' })));
  check('payload 无 url 时不渲染按钮', jump({ type: 'classroom_join' }) === '');
  check('payload 是字符串（服务端解析失败兜底）时不渲染', jump('{"url":"https://x/y.html"}') === '');
}

(async () => {
  await testJoinClassroom();
  await testOpsPickersAndNotice();
  testPayloadJump();
  console.log('\n共 ' + total + ' 项，失败 ' + failed + ' 项');
  process.exit(failed ? 1 : 0);
})();
