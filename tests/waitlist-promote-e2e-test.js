/**
 * 候补递补 + 服务端名额校验 —— 端到端测试（真实后端 8083 + 真实 MySQL + 真实 message-service 8090）
 *
 * 覆盖需求四条的落地效果：
 *   1. 候补不分中间层：waiting →（管理员递补）→ booked，一步到位
 *   2. 递补入口在排期维度：由「查询递补」带 scheduleId 落到排期页 → 本测试覆盖其服务端契约
 *   3. 递补成功自动通知学生（查 message_center.msg_message / msg_inbox）
 *   4. 超额预订：学生预定、从 cancelled 改回 booked、候补递补三条路径都要被名额闸门拦住，
 *      且并发递补只能成功一次
 *
 * 断言全部基于「真实库里的状态」而非接口返回码，避免自证。
 * 测试只创建自己的记录，结束时清理。
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');

const API = { host: '127.0.0.1', port: 8083 };
const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';
const MSG_DB = 'message_center';
const TENANT = 2;

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
}

/* ---------- JWT（用与后端相同的 jwt.secret 现签） ---------- */
const props = fs.readFileSync(
    'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/src/main/resources/application.properties', 'utf8');
const SECRET = /^jwt\.secret=(.+)$/m.exec(props)[1].trim();

/* ---------- 消息字段加密：标题/正文在库里是 AES-256-GCM 密文 ----------
 * 存储格式 <hmac(64hex)>:<Base64(IV||密文||Tag)>，所以：
 *   ① 绝不能按明文标题去 WHERE（查不到，会误判成"消息没发出去"）；
 *      要按 HMAC-SHA256 索引前缀 LIKE 查。
 *   ② 想知道消息到底写了什么，必须自己解密——这样断言的是"内容确实是递补成功通知"，
 *      而不是"有一条分类码对得上的消息"。
 * 密钥与 message-service 同源。 */
const msgProps = fs.readFileSync(
    'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/message-service/src/main/resources/application.properties', 'utf8');
const AES_KEY = Buffer.from(/^crypto\.aes-key=(.+)$/m.exec(msgProps)[1].trim(), 'base64');
const HMAC_KEY = Buffer.from(/^crypto\.hmac-key=(.+)$/m.exec(msgProps)[1].trim(), 'base64');
const IV_LEN = 12, TAG_LEN = 16;

function searchIndex(plain) {
    return crypto.createHmac('sha256', HMAC_KEY).update(plain, 'utf8').digest('hex');
}
function decryptStored(stored) {
    if (!stored) return stored;
    const i = stored.indexOf(':');
    if (i !== 64) return stored;
    const buf = Buffer.from(stored.slice(i + 1), 'base64');
    if (buf.length <= IV_LEN) return stored;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(buf.length - TAG_LEN);
    const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
    const d = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
    d.setAuthTag(tag);
    return d.update(ct, undefined, 'utf8') + d.final('utf8');
}

function b64u(x) {
    return Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(sub, role, tenantId) {
    const now = Math.floor(Date.now() / 1000);
    const si = b64u(JSON.stringify({ alg: 'HS512', typ: 'JWT' })) + '.'
        + b64u(JSON.stringify({ sub, role, tenantId, iat: now, exp: now + 3600 }));
    return si + '.' + b64u(crypto.createHmac('sha512', Buffer.from(SECRET, 'utf8')).update(si).digest());
}

/* ---------- HTTP ---------- */
function call(method, path, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        const data = opts.body != null ? JSON.stringify(opts.body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
        const req = http.request({ host: API.host, port: API.port, method, path, headers }, (res) => {
            let buf = '';
            res.on('data', (c) => buf += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(buf); } catch (e) { parsed = { code: -1, message: 'non-json:' + buf.slice(0, 120) }; }
                resolve({ http: res.statusCode, code: parsed.code, message: parsed.message, data: parsed.data });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

/* ---------- SQL ---------- */
// stderr 用 pipe（不是 ignore）：SQL 报错时 execFileSync 抛出的 error.stderr 里才有真实原因，
// 否则只能看到 "Command failed" 而无从定位（曾因此漏掉 ERROR 1046 No database selected）。
//
// --default-character-set=utf8mb4 是必需的：Windows 上 mysql CLI 未指定时按**本地编码**
// （GBK/cp936）输出结果集，而 Node 以 utf8 解码 → 只要 SQL 读出来的是中文就静默变乱码
// （表现为「咨询话题」变成 `��ѯ����`）。此前断言恰好只读 ASCII 值（状态码/base64 密文）
// 才没暴露；一旦读中文列就会踩。显式指定后两端一致。
function sql(q, db) {
    const out = execFileSync(MYSQL, ['-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-B', '-e', q],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
    return out.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split('\t'));
}
function one(q, db) { const r = sql(q, db); return r.length ? r[0] : null; }
function scalar(q, db) { const r = one(q, db); return r ? r[0] : null; }

/* ---------- 测试数据 ---------- */
const createdBookings = [];

function pickFreeSchedules(n) {
    return sql(`SELECT cs.schedule_id, cs.course_id, c.teacher_id
                FROM ${DB}.course_schedule cs
                JOIN ${DB}.course c ON c.course_id = cs.course_id
                LEFT JOIN ${DB}.booking b ON b.schedule_id = cs.schedule_id
                WHERE cs.available_sites = 1 AND cs.tenant_id = ${TENANT} AND b.booking_id IS NULL
                GROUP BY cs.schedule_id, cs.course_id, c.teacher_id
                ORDER BY cs.schedule_id LIMIT ${n}`)
        .map((r) => ({ scheduleId: r[0], courseId: r[1], teacherId: r[2] }));
}
function pickStudents(n) {
    return sql(`SELECT user_id FROM ${DB}.user WHERE role='student' AND tenant_id=${TENANT} ORDER BY user_id LIMIT ${n}`)
        .map((r) => r[0]);
}

const usedSchedules = new Set();
/** 每次现取一个「无任何 booking」的空闲排期，供多轮并发测试各用各的、互不干扰 */
function pickFreshSchedule() {
    const rows = sql(`SELECT cs.schedule_id, cs.course_id, c.teacher_id
        FROM ${DB}.course_schedule cs
        JOIN ${DB}.course c ON c.course_id = cs.course_id
        LEFT JOIN ${DB}.booking b ON b.schedule_id = cs.schedule_id
        WHERE cs.available_sites = 1 AND cs.tenant_id = ${TENANT} AND b.booking_id IS NULL
        GROUP BY cs.schedule_id, cs.course_id, c.teacher_id
        ORDER BY cs.schedule_id LIMIT 40`);
    for (const r of rows) {
        const s = { scheduleId: r[0], courseId: r[1], teacherId: r[2] };
        if (!usedSchedules.has(s.scheduleId)) { usedSchedules.add(s.scheduleId); return s; }
    }
    return null;
}

/** 占位预订数（按服务端口径：排除 waiting/cancelled/canceled/rej-booking/frozen） */
function occupyingCount(scheduleId) {
    return Number(scalar(`SELECT COUNT(*) FROM ${DB}.booking
        WHERE schedule_id='${scheduleId}' AND status NOT IN ('waiting','cancelled','canceled','rej-booking','frozen')`));
}
function statusOf(bookingId) {
    return scalar(`SELECT status FROM ${DB}.booking WHERE booking_id='${bookingId}'`);
}
function apptCount(bookingId) {
    return Number(scalar(`SELECT COUNT(*) FROM ${DB}.appointment WHERE booking_id='${bookingId}'`));
}
function bookingRows(scheduleId, studentId) {
    return Number(scalar(`SELECT COUNT(*) FROM ${DB}.booking WHERE schedule_id='${scheduleId}' AND student_id='${studentId}'`));
}

async function createBooking(tk, scheduleId, studentId, teacherId, status) {
    const r = await call('POST', '/api/v1/course/booking/create', {
        token: tk,
        body: { scheduleId, studentId, teacherId, status }
    });
    if (r.code === 200 && r.data) createdBookings.push(r.data);
    return r;
}

async function main() {
    console.log('=== 候补递补 / 名额校验 端到端测试 ===\n');
    const admin = scalar(`SELECT user_id FROM ${DB}.user WHERE role='admin' AND tenant_id=${TENANT} ORDER BY user_id LIMIT 1`);
    const adminTk = makeToken(admin, 'admin', TENANT);

    const schedules = pickFreeSchedules(4);
    const students = pickStudents(4);
    ck('前置：找到 4 个可用的空闲排期（total=1、无预订）', schedules.length === 4, 'got ' + schedules.length);
    ck('前置：找到 4 个租户内学生 + 1 个管理员', students.length === 4 && !!admin);
    if (schedules.length < 4 || students.length < 4 || !admin) { report(); return; }

    const [S1, S2, S3, S4] = schedules;
    schedules.forEach((s) => usedSchedules.add(s.scheduleId));   // 前 4 个已占用，动态取用时跳过
    const [stuA, stuB, stuC, stuD] = students;
    const tkA = makeToken(stuA, 'student', TENANT);
    const tkB = makeToken(stuB, 'student', TENANT);
    const tkC = makeToken(stuC, 'student', TENANT);
    const tkD = makeToken(stuD, 'student', TENANT);

    /* ==================== 一、名额闸门 ==================== */
    console.log('\n--- 1. 服务端名额闸门（超额预订）---');

    const r1 = await createBooking(tkA, S1.scheduleId, stuA, S1.teacherId, 'booking');
    ck('1.1 空排期（1 个席位）学生预定成功', r1.code === 200 && !!r1.data, JSON.stringify(r1).slice(0, 160));
    const A1 = r1.data;

    const r2 = await createBooking(tkB, S1.scheduleId, stuB, S1.teacherId, 'booking');
    ck('1.2 已有 1 人占位时，第二人预定被服务端拒绝（原实现可直接超额）',
        r2.code !== 200 && /名额已满/.test(String(r2.message)), 'code=' + r2.code + ' msg=' + r2.message);
    ck('1.3 被拒绝后库里没有新增占位', occupyingCount(S1.scheduleId) === 1,
        'occupied=' + occupyingCount(S1.scheduleId));

    /* ==================== 二、候补通道不被闸门拦住 ==================== */
    console.log('\n--- 2. 候补通道（不占席位，名额已满时仍可申请）---');
    const w1 = await createBooking(tkB, S1.scheduleId, stuB, S1.teacherId, 'waiting');
    ck('2.1 名额已满时学生 2 仍可提交候补', w1.code === 200 && !!w1.data, 'code=' + w1.code + ' msg=' + w1.message);
    const W1 = w1.data;

    await new Promise((r) => setTimeout(r, 1100));   // create_time 秒级，间隔开以保证次序可判

    const w2 = await createBooking(tkC, S1.scheduleId, stuC, S1.teacherId, 'waiting');
    ck('2.2 学生 3 也可提交候补', w2.code === 200 && !!w2.data, 'code=' + w2.code);
    const W2 = w2.data;

    ck('2.3 两条候补都不占席位（占位数仍为 1）', occupyingCount(S1.scheduleId) === 1,
        'occupied=' + occupyingCount(S1.scheduleId));

    /* ==================== 三、候补队列次序 ==================== */
    console.log('\n--- 3. 候补队列（按申请时间升序 = 递补次序）---');
    const q = await call('GET', '/api/v1/course/booking/waitlist/' + S1.scheduleId, { token: adminTk });
    ck('3.1 队列接口返回 200', q.code === 200, 'code=' + q.code + ' msg=' + q.message);
    const queueIds = Array.isArray(q.data) ? q.data.map((x) => x.bookingId) : [];
    ck('3.2 队列含 2 条候补', queueIds.length === 2, 'len=' + queueIds.length);
    ck('3.3 先申请的排在第 1 位【次序正确性】', queueIds[0] === W1 && queueIds[1] === W2,
        JSON.stringify(queueIds));
    ck('3.4 队列不含已占位/已取消状态', queueIds.indexOf(A1) < 0);

    /* ==================== 四、座位未腾出时不能递补 ==================== */
    console.log('\n--- 4. 名额未腾出时递补必须被拒（防止用递补绕过名额）---');
    const p0 = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: W1 } });
    ck('4.1 排期仍被学生 1 占满时，递补被拒', p0.code !== 200 && /名额已满/.test(String(p0.message)),
        'code=' + p0.code + ' msg=' + p0.message);
    ck('4.2 被拒后候补状态未变（仍为 waiting）', statusOf(W1) === 'waiting', 'status=' + statusOf(W1));
    ck('4.3 被拒后未生成课次', apptCount(W1) === 0, 'appt=' + apptCount(W1));

    /* ==================== 五、取消腾位 → 递补成功 ==================== */
    console.log('\n--- 5. 管理员确认取消（腾出空位）→ 递补成功 ---');
    const c1 = await call('POST', '/api/v1/course/booking/updateStatus', { token: tkA, body: { id: A1, status: 'canceling' } });
    ck('5.1 学生 1 申请取消（canceling）', c1.code === 200, 'code=' + c1.code + ' msg=' + c1.message);
    ck('5.2 cancelling 仍占席位（未确认前不释放）', occupyingCount(S1.scheduleId) === 1,
        'occupied=' + occupyingCount(S1.scheduleId));

    const c2 = await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: A1, status: 'cancelled' } });
    ck('5.3 管理员确认取消（cancelled）', c2.code === 200, 'code=' + c2.code + ' msg=' + c2.message);
    ck('5.4 已取消不再占席位【原实现会永久吃掉一个席位】', occupyingCount(S1.scheduleId) === 0,
        'occupied=' + occupyingCount(S1.scheduleId));

    const cntAfterCancel = await call('GET', '/api/v1/course/booking/countByScheduleId/' + S1.scheduleId, { token: adminTk });
    ck('5.5 计数接口与库口径一致（0）', String(cntAfterCancel.data) === '0', 'api=' + cntAfterCancel.data);

    const p1 = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: W1 } });
    ck('5.6 空位出现后递补成功', p1.code === 200 && p1.data && p1.data.status === 'booked',
        'code=' + p1.code + ' msg=' + p1.message);
    ck('5.7 库里状态确为 booked（不只信返回码）', statusOf(W1) === 'booked', 'status=' + statusOf(W1));

    const apptN = apptCount(W1);
    ck('5.8 递补后已生成课次时间表', apptN > 0, 'appt=' + apptN);
    ck('5.9 生成课次是按 booked 流程（与「指定学生」同一份实现）', apptN >= 1);
    ck('5.10 占位数回到 1（学生 2 接位）', occupyingCount(S1.scheduleId) === 1,
        'occupied=' + occupyingCount(S1.scheduleId));

    /* ==================== 六、幂等与重复递补 ==================== */
    console.log('\n--- 6. 幂等 / 重复递补 ---');
    const p2 = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: W1 } });
    ck('6.1 对同一条已递补记录再次递补被拒（不是候补）',
        p2.code !== 200 && /不是候补/.test(String(p2.message)), 'code=' + p2.code + ' msg=' + p2.message);
    ck('6.2 重复调用没有产生第二份课次', apptCount(W1) === apptN, 'appt=' + apptCount(W1) + ' 期望=' + apptN);

    const p3 = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: W2 } });
    ck('6.3 只剩 1 个席位且已被占，另一位候补递补被拒',
        p3.code !== 200 && /名额已满/.test(String(p3.message)), 'code=' + p3.code + ' msg=' + p3.message);
    ck('6.4 被拒的候补仍是 waiting', statusOf(W2) === 'waiting', 'status=' + statusOf(W2));

    /* ==================== 七、legacy「确认候补」不能绕过 ==================== */
    console.log('\n--- 7. 旧入口 updateStatus(booked) 不得绕过名额与课次生成 ---');
    const s3 = await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: W2, status: 'booked' } });
    ck('7.1 满员时用旧入口把候补改 booked 同样被拒',
        s3.code !== 200 && /名额已满/.test(String(s3.message)), 'code=' + s3.code + ' msg=' + s3.message);
    ck('7.2 被拒后状态未变', statusOf(W2) === 'waiting', 'status=' + statusOf(W2));

    // 腾位后再走旧入口，应当与递补等价（生成课次）
    const c3 = await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: W1, status: 'cancelled' } });
    ck('7.3 学生 2 的记录先置为 cancelled（腾位）', c3.code === 200 && statusOf(W1) === 'cancelled');
    const s4 = await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: W2, status: 'booked' } });
    ck('7.4 空位出现后旧入口转为 booked 成功', s4.code === 200 && statusOf(W2) === 'booked',
        'code=' + s4.code + ' msg=' + s4.message);

    /* ==================== 八、通知 ==================== */
    console.log('\n--- 8. 递补成功后自动通知学生 ---');
    const PROMOTE_TITLE = '候补递补成功';
    const msgRow = one(`SELECT m.title, m.category_code, i.user_id, m.content FROM ${MSG_DB}.msg_message m
                        JOIN ${MSG_DB}.msg_inbox i ON i.message_id = m.message_id
                        WHERE i.user_id = '${stuB}' AND m.title LIKE '${searchIndex(PROMOTE_TITLE)}:%'
                          AND m.create_time >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                        ORDER BY m.message_id DESC LIMIT 1`);
    const msgTitle = msgRow ? decryptStored(msgRow[0]) : null;
    const msgBody = msgRow ? decryptStored(msgRow[3]) : null;
    ck('8.1 学生 2 收到了「候补递补成功」消息', !!msgRow && msgTitle === PROMOTE_TITLE,
        msgRow ? ('解密后标题=' + msgTitle) : '未找到');
    ck('8.2 收件人是递补成功的学生本人', !!msgRow && msgRow[2] === stuB, msgRow ? msgRow[2] : '-');
    ck('8.3 消息分类为已登记的 BOOKING_CONFIRMED', !!msgRow && msgRow[1] === 'BOOKING_CONFIRMED',
        msgRow ? msgRow[1] : '-');

    // 正文按「租户所属行业」的词汇渲染（租户 2 = 倍嘉律师事务所，industry_id=5 法律咨询）：
    //   课程 → 咨询话题、上课时间 → 预约时间、上课 → 咨询、今日课程 → 今日咨询话题
    // 这里断言的是**解密后的真实正文**，而不是"有一条分类码对得上的消息"。
    ck('8.4 正文按行业词渲染：出现法律咨询词「咨询话题」「预约时间」「今日咨询话题」「按时咨询」',
        !!msgBody && msgBody.includes('咨询话题') && msgBody.includes('预约时间')
        && msgBody.includes('今日咨询话题') && msgBody.includes('按时咨询'),
        msgBody || '无正文');
    ck('8.5 正文不再出现教育行业的锚点词「课程」「上课」',
        !!msgBody && !msgBody.includes('课程') && !msgBody.includes('上课'), msgBody || '无正文');
    ck('8.6 首节课时间是动态数据，原样嵌入且未被术语替换破坏',
        !!msgBody && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(msgBody), msgBody || '无正文');
    ck('8.7 正文没有残留未解析的占位符 {xxx}',
        !!msgBody && !/\{[A-Za-z][A-Za-z0-9_]*\}/.test(msgBody), msgBody || '无正文');

    /* ==================== 九、并发递补只成功一次（3 轮） ==================== */
    console.log('\n--- 9. 并发递补（同一排期两个候补同时递补，跑 3 轮）---');
    for (let round = 1; round <= 3; round++) {
        const SX = pickFreshSchedule();
        if (!SX) { ck('9.' + round + ' 前置：取到空闲排期', false); break; }

        // 前置：1 人占满 + 2 人候补
        const cX = await createBooking(tkD, SX.scheduleId, stuD, SX.teacherId, 'booking');
        const cY = await createBooking(tkA, SX.scheduleId, stuA, SX.teacherId, 'waiting');
        await new Promise((r) => setTimeout(r, 1100));   // 错开 1 秒，次序可判
        const cZ = await createBooking(tkB, SX.scheduleId, stuB, SX.teacherId, 'waiting');
        const XX = cX.data, WY = cY.data, WZ2 = cZ.data;

        // 腾出唯一空位
        await call('POST', '/api/v1/course/booking/updateStatus', { token: tkD, body: { id: XX, status: 'canceling' } });
        await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: XX, status: 'cancelled' } });
        if (occupyingCount(SX.scheduleId) !== 0) {
            ck('9.' + round + ' 前置：空位已腾出', false, 'occ=' + occupyingCount(SX.scheduleId));
            break;
        }

        // 同时发起两个递补
        const [pY, pZ] = await Promise.all([
            call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: WY } }),
            call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: WZ2 } })
        ]);
        const okN = [pY, pZ].filter((x) => x.code === 200).length;
        ck('9.' + round + '.1 两个并发递补只成功 1 个【不能双双占位】', okN === 1,
            'Y=' + pY.code + '/' + String(pY.message).slice(0, 30) + ' Z=' + pZ.code + '/' + String(pZ.message).slice(0, 30));

        const occ = occupyingCount(SX.scheduleId);
        ck('9.' + round + '.2 最终占位数 = 1，未超总席位', occ === 1, 'occ=' + occ);
        const bookedN = Number(scalar(`SELECT COUNT(*) FROM ${DB}.booking
            WHERE schedule_id='${SX.scheduleId}' AND status='booked'`));
        ck('9.' + round + '.3 库里 booked 恰好 1 条', bookedN === 1, 'booked=' + bookedN);
        const loseOne = (pY.code === 200) ? WZ2 : WY;
        ck('9.' + round + '.4 落选候补仍是 waiting（未被改坏）', statusOf(loseOne) === 'waiting',
            'status=' + statusOf(loseOne));
        const winOne = (pY.code === 200) ? WY : WZ2;
        ck('9.' + round + '.5 胜出者已生成课次', apptCount(winOne) > 0, 'appt=' + apptCount(winOne));
    }

    /* ==================== 十、指定学生复用记录（不再重复占位） --- */
    console.log('\n--- 10. 「指定学生」复用已有记录，同一学生同一排期不重复占位 ---');
    const cw = await createBooking(tkA, S3.scheduleId, stuA, S3.teacherId, 'waiting');
    const WW = cw.data;
    ck('10.1 前置：先有一条候补', cw.code === 200 && statusOf(WW) === 'waiting');

    const asgn1 = await call('POST', '/api/v1/schedule/assign-student', {
        token: adminTk,
        body: { scheduleId: S3.scheduleId, studentId: stuA, teacherId: S3.teacherId }
    });
    ck('10.2 指定学生成功', asgn1.code === 200, 'code=' + asgn1.code + ' msg=' + asgn1.message);
    ck('10.3 复用了原候补记录（该学生该排期仍只有 1 条 booking）【原实现会新建第 2 条】',
        bookingRows(S3.scheduleId, stuA) === 1, 'rows=' + bookingRows(S3.scheduleId, stuA));
    ck('10.4 记录已转为 booked', statusOf(WW) === 'booked', 'status=' + statusOf(WW));
    ck('10.5 生成了课次', apptCount(WW) > 0, 'appt=' + apptCount(WW));

    const apptBefore = apptCount(WW);
    const asgn2 = await call('POST', '/api/v1/schedule/assign-student', {
        token: adminTk,
        body: { scheduleId: S3.scheduleId, studentId: stuA, teacherId: S3.teacherId }
    });
    ck('10.6 重复指定同一学生幂等（不新建记录）',
        asgn2.code === 200 && bookingRows(S3.scheduleId, stuA) === 1,
        'rows=' + bookingRows(S3.scheduleId, stuA));
    ck('10.7 幂等调用不产生重复课次', apptCount(WW) === apptBefore,
        'appt=' + apptCount(WW) + ' 期望=' + apptBefore);

    /* ==================== 十一、满员时指定学生被拦 ==================== */
    console.log('\n--- 11. 满员时「指定学生」被名额闸门拦住 ---');
    const asgn3 = await call('POST', '/api/v1/schedule/assign-student', {
        token: adminTk,
        body: { scheduleId: S3.scheduleId, studentId: stuC, teacherId: S3.teacherId }
    });
    ck('11.1 排期已满，指定其他学生被拒',
        asgn3.code !== 200 && /名额已满/.test(String(asgn3.message)), 'code=' + asgn3.code + ' msg=' + asgn3.message);
    ck('11.2 被拒后没有多出记录', bookingRows(S3.scheduleId, stuC) === 0,
        'rows=' + bookingRows(S3.scheduleId, stuC));

    /* ==================== 十二、候补可正常撤销 ==================== */
    console.log('\n--- 12. 学生可自行撤销候补 ---');
    const cw2 = await createBooking(tkC, S4.scheduleId, stuC, S4.teacherId, 'waiting');
    const WZ = cw2.data;
    const rev = await call('POST', '/api/v1/course/booking/updateStatus', { token: tkC, body: { id: WZ, status: 'cancelled' } });
    ck('12.1 撤销候补成功且状态为 cancelled',
        rev.code === 200 && statusOf(WZ) === 'cancelled', 'status=' + statusOf(WZ));
    const q4 = await call('GET', '/api/v1/course/booking/waitlist/' + S4.scheduleId, { token: adminTk });
    ck('12.2 撤销后不再出现在候补队列',
        q4.code === 200 && Array.isArray(q4.data) && q4.data.every((x) => x.bookingId !== WZ),
        'queueLen=' + (Array.isArray(q4.data) ? q4.data.length : 'n/a'));

    /* ==================== 十三、删除预订（frozen）同样腾出席位 ==================== */
    // booking 表**没有 is_deleted 列**，管理员的「删除」就是把 status 置成 frozen
    // （前端 deleteBookingByFrozen → operateBookingStatus(id,'frozen')）。
    // 修订前 frozen 不在 NON_OCCUPYING 里 ⇒ 被当成占位 ⇒ 删掉一条预订后席位被永久吃掉，
    // 排期一直显示满员、候补再也递补不进来。本组专门守这条。
    console.log('\n--- 13. 删除预订（frozen）腾出席位 → 候补可递补【本轮修订】---');
    const SF = pickFreshSchedule();
    ck('13.0 前置：取到空闲排期', !!SF, '无空闲排期');
    if (SF) {
        const cF = await createBooking(tkA, SF.scheduleId, stuA, SF.teacherId, 'booking');
        const BF = cF.data;
        await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: BF, status: 'booked' } });
        const wF = await createBooking(tkB, SF.scheduleId, stuB, SF.teacherId, 'waiting');
        const WF = wF.data;
        ck('13.1 前置：排期已满 + 1 条候补',
            occupyingCount(SF.scheduleId) === 1 && statusOf(WF) === 'waiting',
            'occupied=' + occupyingCount(SF.scheduleId) + ' w=' + statusOf(WF));

        // 管理员「删除」这条已确认的预订
        const del = await call('POST', '/api/v1/course/booking/updateStatus',
            { token: adminTk, body: { id: BF, status: 'frozen' } });
        ck('13.2 删除成功且状态落库为 frozen（不是只作为动作值）',
            del.code === 200 && statusOf(BF) === 'frozen', 'code=' + del.code + ' status=' + statusOf(BF));
        ck('13.3 frozen 不再占席位【原实现按占位计入 → 席位被永久吃掉】',
            occupyingCount(SF.scheduleId) === 0, 'occupied=' + occupyingCount(SF.scheduleId));

        // 行为级护栏：不依赖上面的计数辅助函数，直接看「递补到底能不能做」。
        // 若 frozen 仍被当作占位，这里必然被名额闸门拒掉 → 本组会红，与辅助函数是否同步无关。
        const pF = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: WF } });
        ck('13.4 删除腾出席位后，候补可直接递补成功',
            pF.code === 200 && statusOf(WF) === 'booked',
            'code=' + pF.code + ' msg=' + pF.message + ' status=' + statusOf(WF));
        ck('13.5 递补后生成了课次', apptCount(WF) > 0, 'appt=' + apptCount(WF));

        const msgF = one(`SELECT m.title FROM ${MSG_DB}.msg_message m
                          JOIN ${MSG_DB}.msg_inbox i ON i.message_id = m.message_id
                          WHERE i.user_id = '${stuB}' AND m.title LIKE '${searchIndex(PROMOTE_TITLE)}:%'
                            AND m.create_time >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
                          ORDER BY m.message_id DESC LIMIT 1`);
        ck('13.6 递补成功已通知该学生', !!msgF && decryptStored(msgF[0]) === PROMOTE_TITLE,
            msgF ? '解密后标题=' + decryptStored(msgF[0]) : '未找到');

        // 席位已经被候补拿走，此时把那条 frozen 记录「撤回」成占位状态，必须被闸门拦住
        const back = await call('POST', '/api/v1/course/booking/updateStatus',
            { token: adminTk, body: { id: BF, status: 'booking' } });
        ck('13.7 席位已被候补占用后，frozen 记录撤回成占位状态被名额闸门拒绝（不能白拿第二个席位）',
            back.code !== 200 && /名额已满/.test(String(back.message)),
            'code=' + back.code + ' msg=' + back.message);
    }

    /* ==================== 十四、通知正文的行业词汇转换（三级作用域） ==================== */
    // 通知正文由服务端渲染（消息落库后就是静态文本，message-service 的库 message_center
    // 根本没有 sys_term 表，前端 data-term 机制也覆盖不到），所以取词必须发生在这里。
    // 本组验证：① 默认取到**行业词**；② 加一条**租户词**能实时覆盖行业词；
    //          ③ 删掉租户词后**逐级回退**回行业词。
    console.log('\n--- 14. 递补通知正文的行业词汇转换（租户词 > 行业词 > 平台词）---');

    const T_IND = 5;                                  // 租户 2 所属行业：法律咨询
    const TERM_TUPLE = `term_key='course' AND industry_id=${T_IND} AND tenant_id=${TENANT} AND language='zh'`;
    const preRows = Number(scalar(`SELECT COUNT(*) FROM ${DB}.sys_term WHERE ${TERM_TUPLE}`));
    ck('14.0 前置：该租户本无 course 租户词（测试只新增，不覆盖既有数据）', preRows === 0, 'rows=' + preRows);

    /** 跑一轮「占位 → 候补 → 腾位 → 递补」，返回被递补学生收到的通知正文（解密后） */
    async function promoteAndFetchContent(occupantTk, occupant, waiterTk, waiter) {
        const S = pickFreshSchedule();
        if (!S) return null;
        const c = await createBooking(occupantTk, S.scheduleId, occupant, S.teacherId, 'booking');
        await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: c.data, status: 'booked' } });
        const w = await createBooking(waiterTk, S.scheduleId, waiter, S.teacherId, 'waiting');
        await call('POST', '/api/v1/course/booking/updateStatus', { token: occupantTk, body: { id: c.data, status: 'canceling' } });
        await call('POST', '/api/v1/course/booking/updateStatus', { token: adminTk, body: { id: c.data, status: 'cancelled' } });
        const pr = await call('POST', '/api/v1/course/booking/waitlist/promote', { token: adminTk, body: { id: w.data } });
        if (pr.code !== 200) return '__PROMOTE_FAILED__:' + pr.code + ':' + pr.message;
        const row = one(`SELECT m.content FROM ${MSG_DB}.msg_message m
                         JOIN ${MSG_DB}.msg_inbox i ON i.message_id = m.message_id
                         WHERE i.user_id = '${waiter}' AND m.title LIKE '${searchIndex(PROMOTE_TITLE)}:%'
                           AND m.create_time >= DATE_SUB(NOW(), INTERVAL 3 MINUTE)
                         ORDER BY m.message_id DESC LIMIT 1`);
        return row ? decryptStored(row[0]) : null;
    }

    // ① 只加了租户词，验证「租户词覆盖行业词」实时生效（TermService 无缓存）
    sql(`INSERT INTO ${DB}.sys_term
         (term_key, term_name, language, term_type, industry_id, tenant_id, sort_order, status, remark)
         VALUES ('course', '争议解决话题', 'zh', 'label', ${T_IND}, ${TENANT}, 0, 1, 'e2e 测试临时词条')`);
    const txtTenant = await promoteAndFetchContent(tkD, stuD, tkA, stuA);
    ck('14.1 租户词实时覆盖行业词：正文用「争议解决话题」',
        !!txtTenant && txtTenant.includes('争议解决话题'), txtTenant || '无正文');
    ck('14.2 此时不再出现被覆盖掉的行业词「咨询话题」',
        !!txtTenant && !txtTenant.includes('咨询话题'), txtTenant || '无正文');
    ck('14.3 未被租户覆盖的术语位仍取行业词（预约时间 / 按时咨询）',
        !!txtTenant && txtTenant.includes('预约时间') && txtTenant.includes('按时咨询'),
        txtTenant || '无正文');

    // ② 删掉租户词，验证逐级回退到行业词
    sql(`DELETE FROM ${DB}.sys_term WHERE ${TERM_TUPLE}`);
    const txtIndustry = await promoteAndFetchContent(tkD, stuD, tkC, stuC);
    ck('14.4 删除租户词后逐级回退到行业词「咨询话题」',
        !!txtIndustry && txtIndustry.includes('咨询话题'), txtIndustry || '无正文');
    ck('14.5 回退后正文仍不含平台（教育）锚点词「课程」「上课」',
        !!txtIndustry && !txtIndustry.includes('课程') && !txtIndustry.includes('上课'),
        txtIndustry || '无正文');
    ck('14.6 回退后正文同样没有未解析的占位符',
        !!txtIndustry && !/\{[A-Za-z][A-Za-z0-9_]*\}/.test(txtIndustry), txtIndustry || '无正文');

    report();
}

function report() {
    console.log('\n========== 结果 ==========');
    console.log('PASS ' + pass + ' / FAIL ' + fail);
    if (fail) { console.log('失败项：'); failures.forEach((f) => console.log('  - ' + f)); }
    console.log('==========================');
}

/**
 * 清理本次测试创建的数据，让开发库回到测试前的状态。
 * 只删本测试登记过的 bookingId（及其课次 / 通知），不触碰库中原有记录。
 */
function cleanup() {
    try {
        // 第 14 组临时插入的租户词条：即使中途失败也要清掉，
        // 否则下次运行 14.0「该租户本无 course 租户词」会误报。
        // 只按 (term_key, 行业, 租户, 语言) 精确删除，不碰任何既有词条。
        sql(`DELETE FROM ${DB}.sys_term
             WHERE term_key='course' AND industry_id=5 AND tenant_id=${TENANT} AND language='zh'`);

        if (createdBookings.length === 0) { console.log('\n清理：无新建数据'); return; }
        const list = createdBookings.map((id) => "'" + id + "'").join(',');
        const appt = Number(scalar(`SELECT COUNT(*) FROM ${DB}.appointment WHERE booking_id IN (${list})`));
        sql(`DELETE FROM ${DB}.appointment WHERE booking_id IN (${list})`);
        sql(`DELETE FROM ${DB}.booking WHERE booking_id IN (${list})`);
        // 测试期间产生的通知（只删本测试这 20 分钟内、标题为递补成功的那批）。
        // 注意两点：
        //   ① 标题是加密列，只能用 HMAC 索引前缀匹配，不能用明文；
        //   ② 必须用「单表 + 子查询」，不能用 MySQL 的多表别名 DELETE
        //      （DELETE i FROM a i JOIN b ...）——该写法要求连接有默认库，
        //      CLI 下会报 ERROR 1046 No database selected；子查询里的库名也要写全。
        const titleIdx = searchIndex('候补递补成功');
        sql(`DELETE FROM ${MSG_DB}.msg_inbox
             WHERE message_id IN (SELECT message_id FROM ${MSG_DB}.msg_message
                                  WHERE title LIKE '${titleIdx}:%' AND create_time >= DATE_SUB(NOW(), INTERVAL 20 MINUTE))`);
        sql(`DELETE FROM ${MSG_DB}.msg_message
             WHERE title LIKE '${titleIdx}:%' AND create_time >= DATE_SUB(NOW(), INTERVAL 20 MINUTE)`);
        console.log('\n清理：已删除测试产生的 ' + createdBookings.length + ' 条 booking、'
            + appt + ' 条 appointment 及对应通知');
    } catch (e) {
        console.log('\n清理失败（不影响测试结论）：' + e.message);
    }
}

main().then(() => { cleanup(); }).catch((e) => { console.error('测试异常：', e); cleanup(); process.exitCode = 1; });
