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

/* ==================== C4-a：运营台群发上课通知 ==================== */
async function testSendNotice() {
  console.log('C4 运营台「发上课通知」');
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
  win.ApiPaths = { ENDPOINTS: { MSG_SEND: '/api/v1/messages/send' } };
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
  win.request = (cfg) => {
    sent.push(cfg);
    if (cfg.url === '/api/v1/messages/send') return Promise.resolve({ messageId: 9527, recipientCount: 2 });
    return Promise.resolve({ activeClasses: [], serverTime: '2026-11-19T16:00:00' });
  };
  win.eval(read('js/classroom/ops.js'));

  // Ops.run() 会在 DOMContentLoaded 时跑一次监控加载，等它落地再开始计数
  await wait(80);
  sent.length = 0;
  win.document.getElementById('ntc-schedule').value = 'abc123def4567890abc123def4567890';
  win.ClassroomOps.base = '';
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
      /abc123def4567890/.test(d.content) && /进入方式/.test(d.content), d.content);
    check('payload 带 classroom_join 与带 scheduleId 的链接',
      !!d.payload && d.payload.type === 'classroom_join'
      && /scheduleId=abc123def4567890/.test(d.payload.url), JSON.stringify(d.payload));
    check('平台管理员代发时带上课堂所属租户', d.targetTenantId === 5, String(d.targetTenantId));
  }
  const box = win.document.getElementById('ntc-result').textContent;
  check('结果区展示发送人数与 messageId', /已发送/.test(box) && /9527/.test(box), box);

  // 空名单：不发空通知
  win.ClassroomAPI.getMembers = () => Promise.resolve([{ userId: 'tea-1', role: 'teacher' }]);
  sent.length = 0;
  win.ClassroomOps._sendNotice();
  await wait(80);
  const box2 = win.document.getElementById('ntc-result').textContent;
  check('空名单不发通知并提示先加学员',
    sent.filter((c) => c.url === '/api/v1/messages/send').length === 0 && /加学员/.test(box2), box2);
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
  await testSendNotice();
  testPayloadJump();
  console.log('\n共 ' + total + ' 项，失败 ' + failed + ' 项');
  process.exit(failed ? 1 : 0);
})();
