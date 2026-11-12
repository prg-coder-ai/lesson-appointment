/**
 * 课次实例端点冒烟（2026-11-13）
 *
 * 验证后端新增的两个端点：
 *   GET  /api/v1/schedule/class-instances/{scheduleId}       课次实例（我的课堂）
 *   POST /api/v1/schedule/class-instances/{scheduleId}/sync   补推课堂事件
 *
 * 用真实库数据（lesson_appointment.course_schedule）与本地签发的 JWT：
 *   - 无 token → 401（过滤器层，不是 200）
 *   - 错误租户的 token → 404「排期不存在」（租户隔离生效，不能跨租户读排期）
 *   - 正确租户 → 200 + 课次数组；断言 classroomKey 规则（第 1 课次裸 id，第 2 起 sid~N）
 *   - sync → 200（课堂服务未启动时推送失败被内部吞掉，端点不应 5xx）
 *
 * 用法（先启动服务）：
 *   bash build_smoke.sh run 8083
 *   node tests/smoke_class_instances.js [baseUrl] [scheduleId] [tenantId] [realStudentUserId]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const BASE = process.argv[2] || 'http://127.0.0.1:8083';
const SID = process.argv[3] || '6935b36af9dc4a57863f52a68679c5b6';
const TENANT = Number(process.argv[4] || 3);
// 第 5 段用的真实学生账号：checkAnyLogin 对 student/teacher 会回查 user 表并要求 status=active，
// 用伪造 id 必然 403 —— 那不是缺陷，是账号状态校验。这里允许从外部传一个真实 active 学生 id。
const STUDENT_ID = process.argv[5] || '';

let pass = 0;
let fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  :: ' + extra : '')); }
}

/** 从 application.properties 取 jwt.secret 的默认值（${JWT_SECRET:xxx} 的 xxx） */
function readJwtSecret() {
  const p = path.join(__dirname, '..', 'api', 'src', 'main', 'resources', 'application.properties');
  const text = fs.readFileSync(p, 'utf8');
  const line = text.split(/\r?\n/).find(l => /^\s*jwt\.secret\s*=/.test(l));
  if (!line) throw new Error('application.properties 里找不到 jwt.secret');
  const m = line.match(/\$\{JWT_SECRET:([^}]+)\}/);
  const secret = m ? m[1] : line.split('=').slice(1).join('=').trim();
  if (!secret) throw new Error('jwt.secret 默认值为空');
  return secret;
}

function b64u(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(secret, userId, role, tenantId) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS512', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({
    sub: userId, role: role, tenantId: tenantId, type: 'access', iat: now, exp: now + 3600
  }));
  const si = header + '.' + payload;
  const sig = b64u(crypto.createHmac('sha512', Buffer.from(secret, 'utf8')).update(si).digest());
  return si + '.' + sig;
}

function req(method, urlPath, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    const r = http.request(opts, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* 非 JSON（如纯文本 401） */ }
        resolve({ status: res.statusCode, body: body, json: json });
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, () => { r.destroy(new Error('timeout')); });
    r.end();
  });
}

(async function main() {
  const secret = readJwtSecret();
  const pathGet = '/api/v1/schedule/class-instances/' + encodeURIComponent(SID);
  const pathSync = pathGet + '/sync';

  console.log('base=' + BASE + '  scheduleId=' + SID + '  tenant=' + TENANT);

  console.log('\n[1] 未带 token');
  const r1 = await req('GET', pathGet, null);
  assert('HTTP 401（过滤器层拦截）', r1.status === 401, 'status=' + r1.status + ' body=' + r1.body.slice(0, 120));

  console.log('\n[2] 错误租户 token（tenant=1 读 tenant=' + TENANT + ' 的排期）');
  const wrongToken = makeToken(secret, 'smoke-user', 'admin', 1);
  const r2 = await req('GET', pathGet, wrongToken);
  const code2 = r2.json && r2.json.code;
  assert('租户隔离生效：租户 1 读不到该排期（404）',
    r2.status === 404 || code2 === 404 || code2 === 403,
    'status=' + r2.status + ' code=' + code2 + ' body=' + r2.body.slice(0, 160));

  console.log('\n[3] 正确租户 token（tenant=' + TENANT + '）');
  const token = makeToken(secret, 'smoke-user', 'admin', TENANT);
  const r3 = await req('GET', pathGet, token);
  assert('HTTP 200', r3.status === 200, 'status=' + r3.status + ' body=' + r3.body.slice(0, 200));
  assert('业务码 200', r3.json && r3.json.code === 200, JSON.stringify(r3.json && r3.json.code));

  const list = (r3.json && r3.json.data) || [];
  assert('返回课次数组且非空', Array.isArray(list) && list.length > 0, 'length=' + (Array.isArray(list) ? list.length : 'not-array'));

  if (list.length) {
    const first = list[0];
    console.log('  首个课次：' + JSON.stringify(first));
    assert('字段齐全（classIndex/classroomKey/startTime/endTime/classCount/state）',
      first.classIndex != null && !!first.classroomKey && !!first.startTime && !!first.endTime
      && first.classCount != null && !!first.state,
      JSON.stringify(Object.keys(first)));
    assert('第 1 课次 classroomKey = 裸 scheduleId', first.classroomKey === SID, first.classroomKey);
    assert('classIndex 从 1 开始递增',
      list.every((it, i) => it.classIndex === i + 1),
      list.map(it => it.classIndex).join(','));
    assert('classCount 等于数组长度', first.classCount === list.length,
      first.classCount + ' vs ' + list.length);
    assert('startTime 为 yyyy-MM-dd HH:mm:ss', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(first.startTime), first.startTime);
    assert('state 取值合法', ['upcoming', 'ongoing', 'finished'].indexOf(first.state) >= 0, first.state);
    if (list.length > 1) {
      assert('第 2 课次 classroomKey = sid~2', list[1].classroomKey === SID + '~2', list[1].classroomKey);
    } else {
      console.log('  SKIP  该排期只展开出 1 个课次，跳过 sid~2 断言');
    }
    // 时间递增（服务端按时间升序展开）
    let ascending = true;
    for (let i = 1; i < list.length; i++) {
      if (list[i].startTime < list[i - 1].startTime) ascending = false;
    }
    assert('课次按时间升序', ascending);
  }

  console.log('\n[4] 同步课堂（POST，课堂服务可能未启动）');
  const r4 = await req('POST', pathSync, token);
  assert('HTTP 200（推送失败被内部吞掉，不抛 5xx）', r4.status === 200,
    'status=' + r4.status + ' body=' + r4.body.slice(0, 200));
  assert('业务码 200 且返回 classCount', r4.json && r4.json.code === 200 && r4.json.data && r4.json.data.classCount != null,
    r4.body.slice(0, 200));

  console.log('\n[5] 学生角色也可读（ALL_ROLES）');
  const stuToken = makeToken(secret, STUDENT_ID || 'smoke-student', 'student', TENANT);
  const r5 = await req('GET', pathGet, stuToken);
  if (!STUDENT_ID) {
    // 未传真实账号时应被 checkAnyLogin 挡（账号不存在 → 非 active）
    assert('未提供真实学生账号时返回 403（账号状态校验）',
      r5.json && r5.json.code === 403,
      'status=' + r5.status + ' code=' + (r5.json && r5.json.code));
  } else {
    assert('学生读课次 200', r5.status === 200 && r5.json && r5.json.code === 200,
      'status=' + r5.status + ' code=' + (r5.json && r5.json.code));
  }

  console.log('\n[6] 学生不可同步课堂（TEACHER_OR_ADMIN）');
  const r6 = await req('POST', pathSync, stuToken);
  const blocked = r6.status === 403 || (r6.json && (r6.json.code === 403 || r6.json.code === 401));
  assert('学生 POST sync 被拒（403）', blocked,
    'status=' + r6.status + ' code=' + (r6.json && r6.json.code));

  console.log('\n==== ' + (fail ? 'FAILED' : 'ALL PASS') + '  pass=' + pass + ' fail=' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('冒烟异常：', e && e.message ? e.message : e);
  process.exit(2);
});
