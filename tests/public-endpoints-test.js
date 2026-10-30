/**
 * 「免登录公开接口」回归测试 —— 真实后端 8083 + 真实 MySQL
 *
 * 守的是什么：
 *   公开页（teacherPublishedProfile.html，教师职业信息的分享链接）与公开预约入口
 *   （booking 页选排期）都要**不带 token** 就能用——链接是发给家长/客户的，
 *   对方没有账号、更没有租户身份。
 *
 * 曾经的真实缺陷（2026-09-11 修）：
 *   这些接口在 SecurityConfig / JwtAuthenticationFilter / WebMvcConfig 三处白名单里
 *   放行了，但**没放行 MyBatis-Plus 的租户插件**：匿名请求 TenantContext 为 null，
 *   插件把 null 兜底成 -1（见 MyBatisPlusConfig.getTenantId），给 SQL 追加
 *   `tenant_id = -1` → 恒不命中。表现是「页面能打开，但永远说暂无已发布的个人介绍 /
 *   可选排期为空白」。这类 bug 静态扫描看不见（白名单里明明有），只有真发请求才暴露。
 *
 * 测试设计要点：
 *   ① 阳性 + 阴性成对断言。只测「能取到」不够——若把租户过滤全关掉，
 *      草稿/归档版本也会被公开，那更糟。故每条阳性都配一条「不该拿到的拿不到」。
 *   ② 用**另一个租户**的 token 去取，验证「与访问者登录态、租户无关」。
 *   ③ 末组是静态护栏，防止有人把代码改回「走租户条件的查询」——
 *      改成那样后本测试的 A/B 组会红，但那是**运行时**才红；
 *      静态护栏能让人在写代码的当下就发现（并且会指出该调哪个方法）。
 *
 * 运行前提：后端已在 8083 跑**当前代码**（旧 jar 会红，那不是回归而是没重启）。
 * 运行：node tests/public-endpoints-test.js
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24';
const API = { host: '127.0.0.1', port: 8083 };
const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';

/** 与后端 BookingStatus.NON_OCCUPYING 一致：这些状态「不占席位」，可从可约数里排除 */
const NON_OCCUPYING = ['waiting', 'cancelled', 'canceled', 'rej-booking', 'frozen'];

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
}

function sql(q) {
    const out = execFileSync(MYSQL, [
        '-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-e', q
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
const scalar = (q) => { const r = sql(q); return r.length ? r[0] : null; };

const props = fs.readFileSync(ROOT + '/api/src/main/resources/application.properties', 'utf8');
const SECRET = /^jwt\.secret=(.+)$/m.exec(props)[1].trim();
const b64u = (b) => Buffer.from(b).toString('base64url');
/** 与后端同源密钥现签，仅用于「带另一个租户的 token」这一组对照 */
function makeToken(sub, role, tenantId) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub, role, iat: now, exp: now + 3600 };
    if (tenantId != null) payload.tenantId = tenantId;
    const si = b64u(JSON.stringify({ alg: 'HS512', typ: 'JWT' })) + '.' + b64u(JSON.stringify(payload));
    return si + '.' + b64u(crypto.createHmac('sha512', Buffer.from(SECRET, 'utf8')).update(si).digest());
}

/** opts.token 省略即**完全不带 Authorization 头**——这正是公开链接的真实形态 */
function call(method, path, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const headers = { 'Accept': 'application/json' };
        if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
        const req = http.request({ host: API.host, port: API.port, method, path, headers }, (res) => {
            let buf = '';
            res.on('data', (c) => buf += c);
            res.on('end', () => {
                let p;
                try { p = JSON.parse(buf); } catch (e) { p = { code: -1, message: 'non-json:' + buf.slice(0, 120) }; }
                resolve({ http: res.statusCode, code: p.code, message: p.message, data: p.data, ms: Date.now() - started, bytes: buf.length });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

(async function main() {
    console.log('=== 免登录公开接口回归 ===');

    /* ==================== 一、公开数据取样 ==================== */
    console.log('\n--- 1. 取样（库中真实数据）---');

    // 有已发布版本的教师：取 published_at 最新那条（与后端 ORDER BY 一致）
    const pubTeacher = scalar(
        `SELECT teacher_id FROM ${DB}.teacher_published_profile WHERE status='published'
         ORDER BY published_at DESC LIMIT 1`);
    const pubId = pubTeacher ? scalar(
        `SELECT published_profile_id FROM ${DB}.teacher_published_profile
         WHERE status='published' AND teacher_id='${pubTeacher}'
         ORDER BY published_at DESC LIMIT 1`) : null;
    const pubCount = Number(scalar(
        `SELECT COUNT(*) FROM ${DB}.teacher_published_profile
         WHERE status='published' AND teacher_id='${pubTeacher}'`));

    ck('1.1 取到「有已发布版本」的教师（本组其余断言的样本）',
        !!pubTeacher && !!pubId, 'teacher=' + pubTeacher + ' id=' + pubId);

    // 非 published 版本：用于证明「公开接口不会把草稿/归档泄露出去」
    const draftId = scalar(`SELECT published_profile_id FROM ${DB}.teacher_published_profile WHERE status='draft' LIMIT 1`);
    const archId = scalar(`SELECT published_profile_id FROM ${DB}.teacher_published_profile WHERE status='archived' LIMIT 1`);
    ck('1.2 取到 draft 与 archived 样本（阴性对照；缺失则该组无人看守）',
        !!draftId && !!archId, 'draft=' + draftId + ' archived=' + archId);

    // 有空位的教师：公开预约入口的阳性样本
    const freeCond = `cs.available_sites > (SELECT COUNT(*) FROM ${DB}.booking b
        WHERE b.schedule_id=cs.schedule_id AND b.status NOT IN (${NON_OCCUPYING.map((s) => `'${s}'`).join(',')}))`;
    const freeTeacher = scalar(
        `SELECT c.teacher_id FROM ${DB}.course_schedule cs
         JOIN ${DB}.course c ON cs.course_id=c.course_id
         WHERE cs.status='active' AND c.status='active' AND ${freeCond}
         GROUP BY c.teacher_id ORDER BY COUNT(*) DESC LIMIT 1`);
    const freeExpected = freeTeacher ? Number(scalar(
        `SELECT COUNT(*) FROM ${DB}.course_schedule cs
         JOIN ${DB}.course c ON cs.course_id=c.course_id
         WHERE cs.status='active' AND c.status='active' AND c.teacher_id='${freeTeacher}' AND ${freeCond}`)) : 0;
    ck('1.3 取到「有空位」的教师（公开预约入口的阳性样本）',
        !!freeTeacher && freeExpected > 0, 'teacher=' + freeTeacher + ' 期望条数=' + freeExpected);

    // 全部约满的教师：证明该接口做了「余位」过滤，而不是无脑全返
    const fullTeacher = scalar(
        `SELECT c.teacher_id FROM ${DB}.course_schedule cs
         JOIN ${DB}.course c ON cs.course_id=c.course_id
         WHERE cs.status='active' AND c.status='active'
         GROUP BY c.teacher_id HAVING SUM(${freeCond}) = 0 LIMIT 1`);
    ck('1.4 取到「排期全满」的教师（证明余位过滤仍在生效）', !!fullTeacher, 'teacher=' + fullTeacher);

    // 另一个租户的 token：用于证明「公开性与访问者身份无关」
    const otherTenantUser = scalar(`SELECT user_id FROM ${DB}.user WHERE role='student' ORDER BY tenant_id DESC LIMIT 1`);
    ck('1.5 取到「其它租户」的用户（跨租户访问对照）', !!otherTenantUser, 'user=' + otherTenantUser);

    /* ==================== 二、教师职业信息（公开分享链接） ==================== */
    console.log('\n--- 2. 教师职业信息公开链路（老师的分享链接）---');

    const latest = await call('GET', '/api/v1/teacher/published/latest-public?teacherId=' + encodeURIComponent(pubTeacher));
    ck('2.1 【核心】不带 token 取「最新已发布」返回 200（原缺陷：恒 404）',
        latest.code === 200 && !!latest.data, 'code=' + latest.code + ' http=' + latest.http + ' msg=' + latest.message);
    ck('2.2 返回的正是库中该教师发布得最新的那一版', latest.data && latest.data.publishedProfileId === pubId,
        'got=' + (latest.data && latest.data.publishedProfileId) + ' 期望=' + pubId);
    ck('2.3 返回内容状态为 published（不含草稿/归档）', latest.data && latest.data.status === 'published',
        latest.data && latest.data.status);
    ck('2.4 返回体含 staticHtml（公开页要渲染的正文）',
        !!(latest.data && latest.data.staticHtml), 'staticHtml=' + (latest.data && typeof latest.data.staticHtml));
    ck('2.5 教师有 ' + pubCount + ' 版已发布，接口给的是最新版而非任意一版（多版本时才有区分度）',
        pubCount <= 1 || latest.data.publishedProfileId === pubId, 'published 总数=' + pubCount);

    const byId = await call('GET', '/api/v1/teacher/published/public-get?id=' + encodeURIComponent(pubId));
    ck('2.6 【核心】不带 token 按版本 id 取返回 200（原缺陷：恒「该版本不存在」）',
        byId.code === 200 && !!byId.data, 'code=' + byId.code + ' msg=' + byId.message);
    ck('2.7 按 id 与按 teacherId 取到的是同一版', byId.data && byId.data.publishedProfileId === pubId,
        byId.data && byId.data.publishedProfileId);

    // 阴性：草稿与归档绝不能因为「跳过租户过滤」而顺手泄露
    const draftR = await call('GET', '/api/v1/teacher/published/public-get?id=' + encodeURIComponent(draftId));
    ck('2.8 【阴性】draft 版本匿名取不到（404 且文案点明未发布）',
        draftR.code === 404 && !!draftR.data === false, 'code=' + draftR.code + ' msg=' + draftR.message);
    ck('2.9 【阴性】draft 返回的正文为空，未泄露 staticHtml',
        !(draftR.data && draftR.data.staticHtml), JSON.stringify(draftR.data || null).slice(0, 80));

    const archR = await call('GET', '/api/v1/teacher/published/public-get?id=' + encodeURIComponent(archId));
    ck('2.10 【阴性】archived 版本匿名取不到', archR.code === 404, 'code=' + archR.code + ' msg=' + archR.message);

    const noSuchId = await call('GET', '/api/v1/teacher/published/public-get?id=no-such-profile-id');
    ck('2.11 【阴性】不存在的版本 id → 404', noSuchId.code === 404, 'code=' + noSuchId.code);

    const noSuchTeacher = await call('GET', '/api/v1/teacher/published/latest-public?teacherId=no-such-teacher');
    ck('2.12 【阴性】不存在的 teacherId → 404（而不是 200 + null，避免公开页把它当成功）',
        noSuchTeacher.code === 404, 'code=' + noSuchTeacher.code + ' msg=' + noSuchTeacher.message);

    // latest-public 缺参数时给出可读提示（前端会显示为「缺少参数」）
    const noParam = await call('GET', '/api/v1/teacher/published/latest-public');
    ck('2.13 公开链接缺参数时给出可读提示（前端会显示为「缺少参数」）',
        noParam.code === 400, 'code=' + noParam.code + ' msg=' + noParam.message);

    // 跨租户：用别的租户的学生 token 去取，仍应成功——公开链接与访问者身份无关
    const crossTk = makeToken(otherTenantUser, 'student', 999);
    const latestCross = await call('GET', '/api/v1/teacher/published/latest-public?teacherId=' + encodeURIComponent(pubTeacher), { token: crossTk });
    ck('2.14 带「其它租户」的 token 也能取到（公开性不受登录态/租户限制）',
        latestCross.code === 200 && !!latestCross.data, 'code=' + latestCross.code + ' msg=' + latestCross.message);
    ck('2.15 带 token 与不带 token 结果一致（该接口不做身份区分）',
        latestCross.code === latest.code && (latestCross.data || {}).publishedProfileId === (latest.data || {}).publishedProfileId,
        'with=' + latestCross.code + '/' + (latestCross.data || {}).publishedProfileId
        + ' without=' + latest.code + '/' + (latest.data || {}).publishedProfileId);

    console.log('  参考：latest-public 响应 ' + latest.bytes + ' 字节，耗时 ' + latest.ms + ' ms'
        + '（staticHtml 体量见下表）');
    const heavy = sql(`SELECT published_profile_id, LENGTH(static_html) FROM ${DB}.teacher_published_profile
                       WHERE status='published' ORDER BY LENGTH(static_html) DESC LIMIT 3`);
    heavy.forEach((row) => {
        const [id, len] = row.split('\t');
        console.log('        ' + id + '  ' + Math.round(Number(len) / 1024) + ' KB');
    });

    /* ==================== 三、公开预约入口（选排期） ==================== */
    console.log('\n--- 3. 公开预约入口的排期接口 ---');

    const schFree = await call('GET', '/api/v1/schedule/getAvailableSchedule?teacherId=' + encodeURIComponent(freeTeacher));
    ck('3.1 【核心】不带 token 取可预约排期返回 200（原缺陷：恒空数组）',
        schFree.code === 200 && Array.isArray(schFree.data), 'code=' + schFree.code + ' msg=' + schFree.message);
    const got = Array.isArray(schFree.data) ? schFree.data.length : -1;
    ck('3.2 返回条数与库中「有余位」的排期数一致（不是无脑全返，也不是被租户过滤掉）',
        got === freeExpected, 'got=' + got + ' 期望=' + freeExpected);
    ck('3.3 返回的每条都是 active 且余位 > 0',
        Array.isArray(schFree.data) && schFree.data.every((s) => s.status === 'active' && s.availableSites > 0),
        JSON.stringify((schFree.data || []).slice(0, 2)));
    ck('3.4 已约满的排期不在结果里（余位过滤未被绕过）',
        !Array.isArray(schFree.data) || !schFree.data.some((s) => !s.availableSites),
        '含 availableSites<=0 的项');

    const schFull = await call('GET', '/api/v1/schedule/getAvailableSchedule?teacherId=' + encodeURIComponent(fullTeacher));
    ck('3.5 【阴性】排期全满的教师返回空数组（且仍是 200，前端据此显示「暂无可预约」）',
        schFull.code === 200 && Array.isArray(schFull.data) && schFull.data.length === 0,
        'code=' + schFull.code + ' len=' + (schFull.data || []).length);

    const schNone = await call('GET', '/api/v1/schedule/getAvailableSchedule?teacherId=no-such-teacher');
    ck('3.6 【阴性】不存在的 teacherId → 空数组（不报 500）',
        schNone.code === 200 && Array.isArray(schNone.data) && schNone.data.length === 0,
        'code=' + schNone.code + ' msg=' + schNone.message);

    const schCross = await call('GET', '/api/v1/schedule/getAvailableSchedule?teacherId=' + encodeURIComponent(freeTeacher), { token: crossTk });
    ck('3.7 带「其它租户」的 token 也返回同样条数（公开性不受租户限制）',
        Array.isArray(schCross.data) && schCross.data.length === got, 'with=' + (schCross.data || []).length + ' without=' + got);

    /* ==================== 四、静态护栏：公开路径必须三处齐放行 ==================== */
    console.log('\n--- 4. 静态护栏：公开路径三处白名单齐备 ---');

    const WHITELIST_FILES = {
        'SecurityConfig': ROOT + '/api/src/main/java/com/reservation/config/SecurityConfig.java',
        'JwtAuthenticationFilter': ROOT + '/api/src/main/java/com/reservation/config/JwtAuthenticationFilter.java',
        'WebMvcConfig': ROOT + '/api/src/main/java/com/reservation/config/WebMvcConfig.java'
    };
    /** 这三条是「页面 JS 会直接 fetch、且没有 token」的接口，缺一处 → 页面功能整体失效 */
    const PUBLIC_APIS = [
        '/api/v1/teacher/published/latest-public',
        '/api/v1/teacher/published/public-get',
        '/api/v1/schedule/getAvailableSchedule'
    ];
    const sources = {};
    Object.entries(WHITELIST_FILES).forEach(([k, p]) => { sources[k] = fs.readFileSync(p, 'utf8'); });

    PUBLIC_APIS.forEach((api) => {
        const missing = Object.keys(sources).filter((k) => sources[k].indexOf('"' + api + '"') < 0);
        ck('4.x ' + api + ' 在 SecurityConfig / JwtFilter / WebMvcConfig 三处均已放行',
            missing.length === 0, '缺失于: ' + (missing.join(', ') || '无'));
    });

    // 阴性对照：判据确实会报缺失（否则上面三条永远是绿的，等于没检查）
    const fakeMissing = Object.keys(sources).filter((k) => sources[k].indexOf('"/api/v1/definitely-not-there"') < 0);
    ck('4.4 【对照】判据对不存在的路径会报「三处全缺」（证明上面三条不是假绿）',
        fakeMissing.length === 3, '报缺失处数=' + fakeMissing.length);

    /* ==================== 五、静态护栏：公开查询不得走租户受限版本 ==================== */
    console.log('\n--- 5. 静态护栏：公开查询必须用 *IgnoreTenant 版本 ---');

    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const svcPath = ROOT + '/api/src/main/java/com/reservation/service/CourseScheduleService.java';
    const svcSrc = strip(fs.readFileSync(svcPath, 'utf8'));
    const availBody = /public List<CourseSchedule> getAvailableSchedule\([\s\S]*?\n    \}/.exec(svcSrc);
    ck('5.1 取到 getAvailableSchedule 方法体', !!availBody);
    if (availBody) {
        const body = availBody[0];
        ck('5.2 排期查询用的是 selectActiveSchedulesByTeacherIdIgnoreTenant',
            /selectActiveSchedulesByTeacherIdIgnoreTenant\s*\(/.test(body), body.slice(0, 200));
        ck('5.3 余位计数用的是 countBookingByScheduleIdIgnoreTenant（否则计数恒 0 → 已满也被放出）',
            /countBookingByScheduleIdIgnoreTenant\s*\(/.test(body), body.slice(0, 300));
        ck('5.4 方法体内不含租户受限版本的非注解调用（不含 IgnoreTenant 后缀的 selectActiveSchedulesByTeacherId）',
            !/selectActiveSchedulesByTeacherId\s*\(/.test(body), body.slice(0, 200));
    }

    const pubSvcPath = ROOT + '/api/src/main/java/com/reservation/service/TeacherPublishedProfileService.java';
    const pubSvc = strip(fs.readFileSync(pubSvcPath, 'utf8'));
    const latestBody = /public Result<TeacherPublishedProfile> getLatestPublished\([\s\S]*?\n    \}/.exec(pubSvc);
    const byIdBody = /public Result<TeacherPublishedProfile> getPublishedById\([\s\S]*?\n    \}/.exec(pubSvc);
    ck('5.5 getLatestPublished 走 selectLatestPublishedIgnoreTenant',
        !!latestBody && /selectLatestPublishedIgnoreTenant\s*\(/.test(latestBody[0]),
        latestBody ? latestBody[0].slice(0, 200) : '未取到方法体');
    ck('5.6 getPublishedById 走 selectByIdIgnoreTenant',
        !!byIdBody && /selectByIdIgnoreTenant\s*\(/.test(byIdBody[0]),
        byIdBody ? byIdBody[0].slice(0, 200) : '未取到方法体');
    ck('5.7 getPublishedById 仍显式校验 status=published（跳过租户过滤后，这条是草稿不外泄的唯一防线）',
        !!byIdBody && /"published"/.test(byIdBody[0]) && /fail\s*\(\s*404/.test(byIdBody[0]),
        byIdBody ? byIdBody[0].slice(-220) : '');

    const pubMapper = fs.readFileSync(ROOT + '/api/src/main/java/com/reservation/mapper/TeacherPublishedProfileMapper.java', 'utf8');
    ck('5.8 TeacherPublishedProfileMapper 两个公开查询都带 @InterceptorIgnore(tenantLine = "true")',
        (pubMapper.match(/@InterceptorIgnore\(tenantLine\s*=\s*"true"\)/g) || []).length >= 2,
        '出现次数=' + (pubMapper.match(/@InterceptorIgnore\(tenantLine\s*=\s*"true"\)/g) || []).length);

    const schMapper = fs.readFileSync(ROOT + '/api/src/main/java/com/reservation/mapper/CourseScheduleMapper.java', 'utf8');
    ck('5.9 CourseScheduleMapper 的公开查询带 @InterceptorIgnore(tenantLine = "true")',
        /@InterceptorIgnore\(tenantLine\s*=\s*"true"\)[\s\S]{0,400}?selectActiveSchedulesByTeacherIdIgnoreTenant/.test(schMapper),
        '未找到注解与方法的相邻关系');

    // 阴性对照：把一段「错误实现」喂给 5.4 的判据，确认它抓得到
    const badSample = 'public List<CourseSchedule> getAvailableSchedule(String t) { return scheduleMapper.selectActiveSchedulesByTeacherId(t); }';
    ck('5.10 【对照】判据 5.4 能识别出「改回租户受限版本」的写法（证明它不是假绿）',
        /selectActiveSchedulesByTeacherId\s*\(/.test(badSample), '合成样本未被识别');

    /* ==================== 汇总 ==================== */
    console.log('\n============================================');
    console.log('  公开接口回归：' + pass + ' PASS / ' + fail + ' FAIL');
    if (fail) {
        console.log('  失败项：');
        failures.forEach((f) => console.log('    - ' + f));
    }
    console.log('============================================');
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('测试异常中断：', e);
    process.exit(2);
});
