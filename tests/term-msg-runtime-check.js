/**
 * 服务端提示文案术语化 —— 运行时验证（真实后端 8083 + 真实 MySQL）
 *
 * 静态护栏（tests/term-msg-guard-test.js）只能证明"源码里没有写死行业词"，
 * 不能证明"运行时真的渲染对了"。本脚本补上后半段，重点守一个**静默失效**风险：
 * TermMsg 是用「@Component + static holder」暴露的静态门面，若它没被 Spring 实例化，
 * t() 会走 null 分支、**原样返回模板**——不报错、不抛异常，只是所有提示又变回教育话术。
 * 这种退化在静态扫描里完全看不见，只有真调接口才能发现。
 *
 * 做法：不同行业的租户各造一个 **student** token，去调一个只有教师/管理员能用的接口，
 * 让它必然抛 NoPermissionException，然后断言返回的 message 是按该租户行业渲染的。
 * 选这个接口是因为它无副作用、且不带 @Audit（不污染审计表）。
 *
 * 顺带验证 Result 类文案（{course}状态修改成功）：用 admin token 调一个必然成功、
 * 但作用在不存在的主键上（更新 0 行）的接口，既拿到 message 又不改任何数据。
 *
 * 运行前提：后端已在 8083 跑**当前代码**（旧 jar 会全红，那不是回归而是没重启）。
 * 运行：node tests/term-msg-runtime-check.js
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24';
const API = { host: '127.0.0.1', port: 8083 };
const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
}

const props = fs.readFileSync(ROOT + '/api/src/main/resources/application.properties', 'utf8');
const SECRET = /^jwt\.secret=(.+)$/m.exec(props)[1].trim();

const b64u = (b) => Buffer.from(b).toString('base64url');
/** 与后端同源密钥现签；tenantId 为 null 时不写该字段（模拟平台上下文） */
function makeToken(sub, role, tenantId) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub, role, iat: now, exp: now + 3600 };
    if (tenantId != null) payload.tenantId = tenantId;
    const si = b64u(JSON.stringify({ alg: 'HS512', typ: 'JWT' })) + '.' + b64u(JSON.stringify(payload));
    return si + '.' + b64u(crypto.createHmac('sha512', Buffer.from(SECRET, 'utf8')).update(si).digest());
}

function sql(q) {
    const out = execFileSync(MYSQL, [
        '-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-e', q
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
const scalar = (q) => { const r = sql(q); return r.length ? r[0] : null; };

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
                let p;
                try { p = JSON.parse(buf); } catch (e) { p = { code: -1, message: 'non-json:' + buf.slice(0, 120) }; }
                resolve({ http: res.statusCode, code: p.code, message: p.message, data: p.data });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

/** 某租户在某行业下生效的术语词：行业词优先，无则回退平台词（与 TermService 同一套规则，中文） */
function termWord(termKey, industryId) {
    const ind = scalar(`SELECT term_name FROM ${DB}.sys_term
        WHERE term_key='${termKey}' AND industry_id=${industryId} AND tenant_id=0 AND language='zh' AND status=1`);
    if (ind) return { word: ind, scope: '行业词' };
    const plat = scalar(`SELECT term_name FROM ${DB}.sys_term
        WHERE term_key='${termKey}' AND industry_id=0 AND tenant_id=0 AND language='zh' AND status=1`);
    return { word: plat, scope: '平台词' };
}

const CASES = [
    { tid: 1, name: '教育' },
    { tid: 2, name: '法律咨询' },
    { tid: 3, name: '心理咨询' }
];

(async function main() {
    // 先确认后端在跑，并确认它跑的是新代码（新代码一定有 /term/map 之外的差异，
    // 这里用最简单的方式：能连上就继续，连不上直接给出明确指引）
    try {
        await call('GET', '/api/v1/course/list', { token: makeToken('probe', 'admin', 1) });
    } catch (e) {
        console.log('无法连接后端 ' + API.host + ':' + API.port + ' —— ' + e.message);
        console.log('请先起当前代码的后端（旧 jar 会让本验证全红，那不是回归）。');
        process.exitCode = 2;
        return;
    }

    for (const c of CASES) {
        const industryId = scalar(`SELECT industry_id FROM ${DB}.sys_tenant WHERE id=${c.tid}`);
        const stu = scalar(`SELECT user_id FROM ${DB}.user WHERE role='student' AND tenant_id=${c.tid} LIMIT 1`);
        const adm = scalar(`SELECT user_id FROM ${DB}.user WHERE role='admin' AND tenant_id=${c.tid} LIMIT 1`);
        const teacher = termWord('teacher', industryId);
        const course = termWord('course', industryId);
        const sched = termWord('schedule', industryId);

        console.log(`\n--- 租户 ${c.tid} ${c.name}（行业 ${industryId}）：teacher=${teacher.word}(${teacher.scope})  course=${course.word}(${course.scope})  schedule=${sched.word}(${sched.scope}) ---`);
        if (!stu || !adm) {
            ck(`前置：租户 ${c.tid} 有 student 与 admin 账号`, false, 'student=' + stu + ' admin=' + adm);
            continue;
        }

        // ① 异常类文案（BusinessException）：创建预订时传空 scheduleId。
        //    BookingService.create 第一件事就是席位闸门 assertSeatsAvailable，
        //    会在任何写库动作之前抛 `{schedule}ID不能为空`——所以这个用例无副作用。
        //    换成「student 调教师接口」那种路径是行不通的：PermissionCheck 里
        //    checkTeacher/checkStudent 都是 0 调用的死代码，实际走的是不含行业词的通用提示。
        const r = await call('POST', '/api/v1/course/booking/create', {
            token: makeToken(stu, 'student', c.tid),
            body: { scheduleId: '', status: 'booked' }
        });
        const expectMsg = sched.word + 'ID不能为空';
        ck(`① 异常提示已按行业渲染为「${expectMsg}」`,
            r.code === 400 && r.message === expectMsg,
            'code=' + r.code + ' http=' + r.http + ' message=' + r.message);
        ck('① 提示里无残留占位符 {', !!r.message && r.message.indexOf('{') < 0, r.message || '');

        // ② Result 类文案：admin 调「状态修改」，主键不存在 → 更新 0 行，不改任何数据
        const r2 = await call('POST', '/api/v1/course/updateStatusByLastId/nonexistent-for-term-check?status=active', {
            token: makeToken(adm, 'admin', c.tid)
        });
        const expectStatus = course.word + '状态修改成功';
        ck(`② 操作提示已按行业渲染为「${expectStatus}」`,
            r2.code === 200 && r2.message === expectStatus,
            'code=' + r2.code + ' message=' + r2.message);
        ck('② 提示里无残留占位符 {', !!r2.message && r2.message.indexOf('{') < 0, r2.message || '');

        // ③ 回归护栏：非本行业的同义术语不得混进这条提示。
        //    比较的是 ① 用到的 schedule 词；不同行业的 schedule 词可能相同（教育/法律都叫"排期"），
        //    所以只断言"没混进别家的词"，不要求彼此不同。
        const others = CASES.filter((x) => x.tid !== c.tid)
            .map((x) => termWord('schedule', scalar(`SELECT industry_id FROM ${DB}.sys_tenant WHERE id=${x.tid}`)).word);
        const leaked = others.filter((w) => w && w !== sched.word && r.message && r.message.includes(w));
        ck('③ 未混入其它行业的同义术语', leaked.length === 0, leaked.join('|'));
    }

    console.log('\n========================================');
    console.log('结果：PASS ' + pass + ' / FAIL ' + fail);
    if (fail) {
        console.log('失败项：');
        failures.forEach((f) => console.log('  - ' + f));
        console.log('\n提示：若 ① / ② 返回的文案仍是教育话术（"排期ID不能为空"/"课程状态修改成功"），');
        console.log('      而租户是法律/心理，说明 TermMsg 的静态 holder 没被注入——');
        console.log('      检查 TermMsg 是否为 @Component、且没有私有构造器挡住 Spring 实例化。');
        process.exitCode = 1;
    } else {
        console.log('全部通过：TermMsg 门面生效，提示文案按各租户行业正确渲染。');
    }
})();
