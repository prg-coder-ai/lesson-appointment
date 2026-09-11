/**
 * 候补递补 —— 前端接线测试（无浏览器）
 *
 * 方案：Node `vm` + DOM 垫片 + 真实后端(8083) + 真实 MySQL。
 * 跑的是 frontend/ 下的**真源码**，调的是**真接口**，断言的是**真库状态**。
 *
 * 覆盖用户拍板的 4 点要求中与前端相关的部分：
 *   要求 1 不要 waitlist_pending 这一层     → A2/A3（waiting 行不再有「确认候补」）
 *   要求 2 递补入口改到排期维度（带 scheduleId 跳转）→ A/B/F
 *   要求 3 递补成功后自动通知学生            → E2（真实递补后查消息落库）
 *   要求 4 超额预订闸门                     → C5（无空位时按钮 disabled，前端不引导误操作）
 *
 * 二次修订（2026-09-11）：「查询递补」入口的显示条件由「枚举状态」改为「是否占席位」，
 * 使得**任何**腾出席位的操作之后（确认取消、删除预订、拒绝预订…）该行都给出递补入口。
 * 对应断言 A9~A14，其中 A12 是前后端名单一致性护栏。
 *
 * 运行：node tests/waitlist-frontend-wiring-test.js   （需后端 8083 + MySQL）
 */
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FE = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend';
const PORT = 8083;
const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';
const MSG_DB = 'message_center';
const TENANT = 2;

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail != null ? '   [' + detail + ']' : '')); }
}

/* ============ 一、SQL 直连（读库校验，不只信接口返回码） ============ */
// --default-character-set=utf8mb4 必需：Windows 上 mysql CLI 默认按本地编码（GBK）输出，
// Node 以 utf8 解码会让读出来的中文静默变乱码。详见 waitlist-promote-e2e-test.js 同名注释。
function sql(q) {
    const out = execFileSync(MYSQL, ['-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-B', '-e', q],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 });
    return out.split(/\r?\n/).filter((l) => l.length > 0).map((l) => l.split('\t'));
}
function scalar(q) { const r = sql(q); return r.length ? r[0][0] : null; }

/* ============ 二、JWT（读 jwt.secret 现签，与后端同源密钥） ============ */
const props = fs.readFileSync(
    'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/src/main/resources/application.properties', 'utf8');
const SECRET = /^jwt\.secret=(.+)$/m.exec(props)[1].trim();

function b64u(x) {
    return Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeToken(sub, role, tenantId) {
    const now = Math.floor(Date.now() / 1000);
    const si = b64u(JSON.stringify({ alg: 'HS512', typ: 'JWT' })) + '.'
        + b64u(JSON.stringify({ sub, role, tenantId, iat: now, exp: now + 3600 }));
    return si + '.' + b64u(crypto.createHmac('sha512', Buffer.from(SECRET, 'utf8')).update(si).digest());
}

/* ============ 三、DOM 垫片 ============
 * 语义必须仿真，否则会产出"假 FAIL 指错方向"（技能 #42）：
 *   - value 恒为字符串；select.value 由 selectedIndex 派生，设不存在的值 → ''
 *   - innerHTML 重建时清空 options 并把 selectedIndex 复位到第一项
 *   - appendChild(option) 要真的并入 select.options（loadSchedule 是这么填下拉的）
 *   - getElementById 对未知 id 返回 null（产品代码靠 null 走懒创建/早退分支）
 */
function parseOptions(html) {
    const opts = [];
    const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1];
        const val = /value="([^"]*)"/i.exec(attrs);
        const dtid = /data-teacher-id="([^"]*)"/i.exec(attrs);
        opts.push({
            value: val ? val[1] : m[2].replace(/<[^>]*>/g, '').trim(),
            text: m[2].replace(/<[^>]*>/g, '').trim(),
            _attrs: { 'data-teacher-id': dtid ? dtid[1] : null },
            getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
            setAttribute(k, v) { this._attrs[k] = String(v); }
        });
    }
    return opts;
}

function makeEl(id, tagName) {
    const tag = (tagName || 'DIV').toUpperCase();
    const el = {
        id: id || '', tagName: tag, nodeName: tag,
        _html: '', _text: '', _val: '', _opts: [], _kids: [], _attrs: {}, _listeners: {}, _clicks: 0,
        selectedIndex: -1,
        style: {}, dataset: {}, hidden: false,
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild(c) {
            this._kids.push(c);
            if (tag === 'SELECT' && c && String(c.tagName).toUpperCase() === 'OPTION') this._opts.push(c);
            return c;
        },
        removeChild(c) { this._kids = this._kids.filter((x) => x !== c); return c; },
        addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
        removeEventListener() {},
        click() { this._clicks++; (this._listeners.click || []).forEach((fn) => fn({ target: this })); },
        focus() {}, blur() {}, remove() {}, scrollIntoView() {}, insertBefore() {},
        contains() { return false; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        get options() { return this._opts; },
        get value() {
            if (tag === 'SELECT') { const o = this._opts[this.selectedIndex]; return o ? String(o.value) : ''; }
            return this._val;
        },
        set value(v) {
            if (tag === 'SELECT') { this.selectedIndex = this._opts.findIndex((o) => String(o.value) === String(v)); return; }
            this._val = v == null ? '' : String(v);
        },
        get innerHTML() { return this._html; },
        set innerHTML(v) {
            this._html = v == null ? '' : String(v);
            this._text = this._html.replace(/<[^>]*>/g, '');
            if (tag === 'SELECT') { this._opts = parseOptions(this._html); this.selectedIndex = this._opts.length ? 0 : -1; }
        },
        get textContent() { return this._text; },
        set textContent(v) { this._text = v == null ? '' : String(v); this._html = this._text; },
        get innerText() { return this._text; },
        set innerText(v) { this.textContent = v; }
    };
    return el;
}

function makeDocument(ids) {
    const reg = new Map();
    (ids || []).forEach((id) => reg.set(id, makeEl(id, /Select$/.test(id) ? 'SELECT' : 'INPUT')));
    const doc = {
        _reg: reg,
        _menus: {},
        getElementById(id) { return reg.has(id) ? reg.get(id) : null; },   // 未知 → null
        createElement(t) { return makeEl('', t); },
        querySelector(sel) {
            const m = /\.menu-item\[key="([^"]+)"\]/.exec(sel || '');
            if (m) return doc._menus[m[1]] || null;
            return null;
        },
        querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        write() {}, writeln() {},
        createTreeWalker() { return { currentNode: null, nextNode() { return null; } }; },
        body: { tagName: 'BODY', nodeValue: '', textContent: '', dataset: {}, querySelectorAll: () => [] },
        documentElement: { tagName: 'HTML', querySelectorAll: () => [] },
        head: { tagName: 'HEAD', appendChild() {}, querySelectorAll: () => [] },
        createTextNode(t) { return { nodeValue: t, textContent: t }; }
    };
    return doc;
}

/* ============ 四、请求通道（真实后端） ============ */
// 复刻 utility_request.js 的 normalizeUrl 规则，让沙箱里的相对路径与浏览器一致
function normalizeUrl(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('/api/v1') === 0) return url;
    if (url.indexOf('/api/') === 0) return '/api/v1' + url.slice(4);
    if (url.charAt(0) === '/') return '/api/v1' + url;
    return '/api/v1/' + url;
}

const hooks = { beforeRequest: null };   // 竞态用例用它注入延迟

function httpJson(method, url, body, token) {
    return new Promise((resolve, reject) => {
        const data = body != null ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const u = new URL('http://127.0.0.1:' + PORT + url);
        const req = http.request({
            host: u.hostname, port: u.port, method, path: u.pathname + u.search, headers
        }, (res) => {
            let buf = '';
            res.on('data', (c) => buf += c);
            res.on('end', () => {
                let j;
                try { j = JSON.parse(buf); } catch (e) { return reject(new Error('非 JSON 响应: ' + buf.slice(0, 120))); }
                if (j.code === 200) return resolve(j.data);
                reject(new Error(j.message || ('code=' + j.code)));
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function makeSandbox(opts) {
    const doc = makeDocument(opts.ids);
    const sb = {};
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    sb.document = doc;
    sb.navigator = { userAgent: 'node-vm-itest' };
    sb.location = { href: 'http://127.0.0.1/admin.html', pathname: '/admin.html', search: '', origin: 'http://127.0.0.1' };
    sb.history = { replaceState() {}, pushState() {} };
    const store = new Map();
    sb.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k), clear: () => store.clear()
    };
    sb.sessionStorage = sb.localStorage;
    sb.console = console;
    sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
    sb.setInterval = setInterval; sb.clearInterval = clearInterval;
    // vm 的新 context 只有 JS 内置对象，没有 Node 的 Web 标准类；api.js 顶层就会用到这些
    sb.URLSearchParams = URLSearchParams; sb.URL = URL;
    sb.TextEncoder = TextEncoder; sb.TextDecoder = TextDecoder;
    sb.Blob = class {}; sb.FormData = class { append() {} };
    sb.Headers = class { constructor() {} append() {} }; sb.AbortController = AbortController;
    sb.Intl = Intl; sb.Date = Date; sb.Math = Math; sb.JSON = JSON;
    sb.alert = (m) => { sb.__alerts.push(m == null ? '' : String(m)); };
    sb.confirm = (m) => { sb.__confirms.push(m == null ? '' : String(m)); return sb.__confirmAnswer; };
    sb.__alerts = []; sb.__confirms = []; sb.__confirmAnswer = true;
    sb.__requestLog = [];
    sb.__token = opts.token;

    // 注意：api.js 负责声明 API_BASE_URL / getUserNameById 等公共函数，必须按真实页面顺序
    // 第一个加载。**不能在沙箱上预置 API_BASE_URL**——那是 api.js 的顶层 const，
    // 预置会报 "Identifier 'API_BASE_URL' has already been declared" 且整文件不执行（技能 #11）。
    sb.window.showApiError = (m) => sb.__alerts.push(String(m));
    sb.showApiError = sb.window.showApiError;

    sb.fetch = async (url, o) => {
        const method = ((o && o.method) || 'GET').toUpperCase();
        let body; try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) { body = null; }
        return httpJson(method, normalizeUrl(String(url)), body, sb.__token);
    };

    // request 垫片：产品代码用 request({url,method,data})；也支持 request.get/post 形式。
    // 注意——垫片内部必须走 sb.fetch（沙箱属性）而不是宿主 fetch，否则外部注入延迟无效（技能 #30）
    function request(cfg) {
        const url = normalizeUrl(String(cfg.url || ''));
        const method = String(cfg.method || 'GET').toUpperCase();
        sb.__requestLog.push(method + ' ' + url);
        return (async () => {
            if (hooks.beforeRequest) await hooks.beforeRequest(method, url, sb);
            return httpJson(method, url, cfg.data, sb.__token);
        })();
    }
    request.get = (url, o) => request(Object.assign({ url, method: 'GET' }, o || {}));
    request.post = (url, data, o) => request(Object.assign({ url, method: 'POST', data }, o || {}));
    request.put = (url, data, o) => request(Object.assign({ url, method: 'PUT', data }, o || {}));
    request.delete = (url, o) => request(Object.assign({ url, method: 'DELETE' }, o || {}));
    sb.request = request;

    sb.MutationObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };
    sb.BroadcastChannel = function () { this.postMessage = () => {}; this.close = () => {}; this.addEventListener = () => {}; };
    sb.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
    sb.XMLHttpRequest = function () { throw new Error('XHR 不可用（本测试只走 request 垫片）'); };

    vm.createContext(sb);
    return sb;
}

/** 按 HTML 里的真实顺序加载脚本到同一上下文 */
function loadScripts(sb, relPaths) {
    for (const rel of relPaths) {
        const code = fs.readFileSync(FE + '/' + rel, 'utf8');
        vm.runInContext(code, sb, { filename: rel });
    }
}

/** 在沙箱全局词法环境里读写顶层 let/const（它们不会挂到 sandbox 上，技能 #1） */
function evalIn(sb, expr) { return vm.runInContext(expr, sb); }

/* ============ 五、测试数据 ============ */
const createdBookings = [];
const usedSchedules = new Set();

function pickFreshSchedule() {
    const rows = sql(`SELECT cs.schedule_id, cs.course_id, c.teacher_id
        FROM ${DB}.course_schedule cs
        JOIN ${DB}.course c ON c.course_id = cs.course_id
        LEFT JOIN ${DB}.booking b ON b.schedule_id = cs.schedule_id
        WHERE cs.available_sites = 1 AND cs.tenant_id = ${TENANT} AND b.booking_id IS NULL
        GROUP BY cs.schedule_id, cs.course_id, c.teacher_id
        ORDER BY cs.schedule_id LIMIT 60`);
    for (const r of rows) {
        const s = { scheduleId: r[0], courseId: r[1], teacherId: r[2] };
        if (!usedSchedules.has(s.scheduleId)) { usedSchedules.add(s.scheduleId); return s; }
    }
    return null;
}
const statusOf = (id) => scalar(`SELECT status FROM ${DB}.booking WHERE booking_id='${id}'`);
const apptCount = (id) => Number(scalar(`SELECT COUNT(*) FROM ${DB}.appointment WHERE booking_id='${id}'`));

async function apiCreate(token, scheduleId, studentId, teacherId, status) {
    try {
        const d = await httpJson('POST', '/api/v1/course/booking/create',
            { scheduleId, studentId, teacherId, status }, token);
        if (d) createdBookings.push(d);
        return d;
    } catch (e) { return null; }
}
async function apiUpdateStatus(token, id, status) {
    try { return await httpJson('POST', '/api/v1/course/booking/updateStatus', { id, status }, token); }
    catch (e) { return null; }
}

/* ============ 六、主流程 ============ */
async function main() {
    console.log('=== 候补递补：前端接线测试（无浏览器 / vm + DOM 垫片 / 真实后端 ' + PORT + '）===\n');

    const admin = scalar(`SELECT user_id FROM ${DB}.user WHERE role='admin' AND tenant_id=${TENANT} ORDER BY user_id LIMIT 1`);
    const students = sql(`SELECT user_id FROM ${DB}.user WHERE role='student' AND tenant_id=${TENANT} ORDER BY user_id LIMIT 4`).map((r) => r[0]);
    const adminTk = makeToken(admin, 'admin', TENANT);
    const tkB = makeToken(students[1], 'student', TENANT);
    const tkC = makeToken(students[2], 'student', TENANT);
    ck('前置：取到 1 名管理员 + 4 名学生', !!admin && students.length === 4, 'admin=' + admin + ' students=' + students.length);
    if (!admin || students.length < 4) return;

    const SA = pickFreshSchedule();     // 主场景：1 席位，A 占位后取消 → 空位
    const SB = pickFreshSchedule();     // C5 场景：1 席位，A 占满 → 无空位
    ck('前置：取到 2 个空闲排期（各 1 席位）', !!SA && !!SB, 'A=' + (SA && SA.scheduleId) + ' B=' + (SB && SB.scheduleId));
    if (!SA || !SB) return;

    // —— 主场景数据：A 占位 → 学生取消 → 管理员确认取消（腾出空位），B、C 依次候补
    const bkA = await apiCreate(adminTk, SA.scheduleId, students[0], SA.teacherId, 'booking');
    await apiUpdateStatus(adminTk, bkA && bkA.bookingId ? bkA.bookingId : bkA, 'booked');
    const bkAId = bkA && bkA.bookingId ? bkA.bookingId : bkA;
    await apiUpdateStatus(adminTk, bkAId, 'cancelled');
    const wB = await apiCreate(tkB, SA.scheduleId, students[1], SA.teacherId, 'waiting');
    await new Promise((r) => setTimeout(r, 1100));      // create_time 秒级，拉开次序
    const wC = await apiCreate(tkC, SA.scheduleId, students[2], SA.teacherId, 'waiting');
    const wBId = wB && wB.bookingId ? wB.bookingId : wB;
    const wCId = wC && wC.bookingId ? wC.bookingId : wC;
    ck('前置：主场景就位（1 条已取消 + 2 条候补）',
        statusOf(bkAId) === 'cancelled' && statusOf(wBId) === 'waiting' && statusOf(wCId) === 'waiting',
        'A=' + statusOf(bkAId) + ' B=' + statusOf(wBId) + ' C=' + statusOf(wCId));

    // —— C5 场景数据：A 占满唯一席位，另有 1 条候补
    const bkA2 = await apiCreate(adminTk, SB.scheduleId, students[0], SB.teacherId, 'booking');
    await apiUpdateStatus(adminTk, bkA2 && bkA2.bookingId ? bkA2.bookingId : bkA2, 'booked');
    const wB2 = await apiCreate(tkB, SB.scheduleId, students[1], SB.teacherId, 'waiting');
    const wB2Id = wB2 && wB2.bookingId ? wB2.bookingId : wB2;

    /* ============================================================
     * A. 预订管理页：行内按钮（真实 formBookingTr 渲染）
     * ============================================================ */
    console.log('\n--- A. 预订管理页行内按钮（formBookingTr 真实渲染）---');
    const sbBooking = makeSandbox({
        token: adminTk,
        ids: ['dynamic-content-center', 'scheduleSelect', 'courseSelect', 'now_availableSites']
    });
    loadScripts(sbBooking, ['js/public/api.js', 'js/public/courseAndBooking.js', 'js/admin-booking.js']);

    const trWaiting = evalIn(sbBooking, `formBookingTr({bookingId:'${wBId}',scheduleId:'${SA.scheduleId}',studentId:'${students[1]}',teacherId:'${SA.teacherId}',status:'waiting'})`);
    const trCancelled = evalIn(sbBooking, `formBookingTr({bookingId:'${bkAId}',scheduleId:'${SA.scheduleId}',studentId:'${students[0]}',teacherId:'${SA.teacherId}',status:'cancelled'})`);
    const trCancelling = evalIn(sbBooking, `formBookingTr({bookingId:'x1',scheduleId:'${SA.scheduleId}',studentId:'s',teacherId:'t',status:'cancelling'})`);
    const trBooked = evalIn(sbBooking, `formBookingTr({bookingId:'x2',scheduleId:'${SA.scheduleId}',studentId:'s',teacherId:'t',status:'booked'})`);

    ck('A1 waiting 行有「查询递补」按钮', /查询递补/.test(trWaiting), '无');
    ck('A2 waiting 行有「拒绝候补」', /拒绝候补/.test(trWaiting), '无');
    ck('A3 waiting 行不再有「确认候补」（要求 1：砍掉 waitlist_pending 那一层）',
        !/确认候补/.test(trWaiting) && !/confirm_waitlist/.test(trWaiting), '仍存在');
    ck('A4 cancelled 行有「查询递补」（管理员确认取消后从这里进递补）', /查询递补/.test(trCancelled), '无');
    ck('A5 cancelled 行原有的「撤回 / 取消」仍在', /撤回/.test(trCancelled) && /取消/.test(trCancelled), '无');
    ck('A6 cancelling 行**没有**「查询递补」（还没确认取消，空位未腾出，不该引导递补）',
        !/查询递补/.test(trCancelling), '出现了');
    ck('A7 booked 行没有「查询递补」', !/查询递补/.test(trBooked), '出现了');
    ck('A8 「查询递补」带的是该行的 scheduleId 而不是 bookingId（递补是排期维度）',
        trCancelled.indexOf(`gotoScheduleForWaitlist('${SA.scheduleId}')`) >= 0
        && trCancelled.indexOf(`gotoScheduleForWaitlist('${bkAId}')`) < 0,
        '锚点不符');

    /* ---- 修订（二次拍板）：入口条件改为「不再占席位」，不再枚举状态名 ---- */
    // 渲染各状态，统一断言「是否出现查询递补」。
    // 判据：这条记录不再占用席位 ⇒ 所属排期可能已因它空出位子 ⇒ 就该给递补入口。
    const renderTr = (status) => evalIn(sbBooking,
        `formBookingTr({bookingId:'rev-${status}',scheduleId:'${SA.scheduleId}',studentId:'s',teacherId:'t',status:'${status}'})`);
    const hasEntry = (status) => /查询递补/.test(renderTr(status));

    // 应当出现：不占席位者（rej-booking / frozen 正是本次修订补上的两个）
    ['waiting', 'cancelled', 'canceled', 'rej-booking', 'frozen'].forEach((st) => {
        ck(`A9 [${st}] 行有「查询递补」（不占席位 ⇒ 腾出位子，要给递补入口）`, hasEntry(st), '无');
    });
    // 不应出现：仍占席位者（取消申请未确认前原预订依然有效）
    ['booking', 'booked', 'cancelling', 'canceling', 'rej-cancelling'].forEach((st) => {
        ck(`A10 [${st}] 行**没有**「查询递补」（仍占席位，不该引导递补）`, !hasEntry(st), '出现了');
    });
    const waitCnt = (renderTr('waiting').match(/查询递补/g) || []).length;
    ck('A11 同一行不会出现两个「查询递补」（waiting 内联与统一追加需去重）',
        waitCnt === 1, '个数=' + waitCnt);

    // A12 前后端名单不得漂移：JS 的 bookingOccupiesSeat 必须与 Java 的 NON_OCCUPYING 逐项一致。
    // 这条是本次修订的护栏——两处名单今后任何一边改了另一边没跟上，测试直接红。
    const javaSrc = fs.readFileSync(
        'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/src/main/java/com/reservation/common/BookingStatus.java', 'utf8');
    const constMap = {};
    let cm; const reConst = /public static final String (\w+)\s*=\s*"([^"]+)"/g;
    while ((cm = reConst.exec(javaSrc)) !== null) { constMap[cm[1]] = cm[2]; }
    const listMatch = /NON_OCCUPYING\s*=\s*List\.of\(([\s\S]*?)\)/.exec(javaSrc);
    const javaNonOcc = listMatch
        ? listMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
            .map((n) => constMap[n]).filter(Boolean).sort()
        : [];
    const ALL_STATUSES = ['booking', 'booked', 'canceling', 'cancelling', 'cancelled', 'canceled',
        'waiting', 'rej-booking', 'rej-cancelling', 'frozen'];
    const jsNonOcc = ALL_STATUSES.filter((s) => !evalIn(sbBooking, `bookingOccupiesSeat('${s}')`)).sort();
    ck('A12 前端 bookingOccupiesSeat 与后端 BookingStatus.NON_OCCUPYING 名单完全一致（防前后端漂移）',
        javaNonOcc.length > 0 && JSON.stringify(javaNonOcc) === JSON.stringify(jsNonOcc),
        'java=[' + javaNonOcc.join(',') + '] js=[' + jsNonOcc.join(',') + ']');
    ck('A13 后端名单已含 frozen（修复：删除预订 = status 置 frozen，而 booking 表没有 is_deleted 列，'
        + '原先按占位计入 ⇒ 席位被永久吃掉）',
        javaNonOcc.indexOf('frozen') >= 0, 'java=[' + javaNonOcc.join(',') + ']');
    ck('A14 null/空状态视为占位（DB 列 NOT NULL DEFAULT \'booked\'，不能当成"腾出位子"）',
        evalIn(sbBooking, 'bookingOccupiesSeat(null)') === true
        && evalIn(sbBooking, "bookingOccupiesSeat('')") === true,
        'null/空被判成不占位');

    /* ============================================================
     * B. 「查询递补」跳转：设置深链 + 切菜单
     * ============================================================ */
    console.log('\n--- B. 「查询递补」→ 排期页（深链 + 菜单切换）---');

    // B1 无 scheduleId：提示且不跳转
    sbBooking.__alerts.length = 0;
    delete sbBooking.window.pendingDeepLink;
    evalIn(sbBooking, `gotoScheduleForWaitlist('')`);
    ck('B1 缺 scheduleId 时给出提示且不写深链、不切菜单',
        sbBooking.__alerts.length === 1 && /无法查询递补/.test(sbBooking.__alerts[0]) && !sbBooking.window.pendingDeepLink,
        'alerts=' + JSON.stringify(sbBooking.__alerts) + ' dl=' + JSON.stringify(sbBooking.window.pendingDeepLink));

    // B2/B3 有菜单项：写深链 + 点击菜单
    const menuEl = makeEl('menu-schedule');
    menuEl.setAttribute('key', 'schedule');
    sbBooking.document._menus['schedule'] = menuEl;
    let fallbackCalls = 0;
    sbBooking.window.loadAdminPageContent = () => { fallbackCalls++; };
    sbBooking.__alerts.length = 0;
    delete sbBooking.window.pendingDeepLink;
    evalIn(sbBooking, `gotoScheduleForWaitlist('${SA.scheduleId}')`);
    const dl = sbBooking.window.pendingDeepLink;
    ck('B2 写入了深链且 scdid = 该排期', !!dl && String(dl.scdid) === String(SA.scheduleId),
        'dl=' + JSON.stringify(dl));
    ck('B3 深链 sid 为 null（递补是先看队列再选人，不预选学生）', !!dl && dl.sid === null,
        'sid=' + (dl ? JSON.stringify(dl.sid) : 'n/a'));
    ck('B4 优先点击「课程排期」菜单项，而不是走整页重渲染', menuEl._clicks === 1 && fallbackCalls === 0,
        'clicks=' + menuEl._clicks + ' fallback=' + fallbackCalls);

    // B5 菜单缺失：回退 loadAdminPageContent
    sbBooking.document._menus = {};
    delete sbBooking.window.pendingDeepLink;
    evalIn(sbBooking, `gotoScheduleForWaitlist('${SA.scheduleId}')`);
    ck("B5 找不到菜单项时回退 loadAdminPageContent('schedule')",
        fallbackCalls === 1 && String(sbBooking.window.pendingDeepLink.scdid) === String(SA.scheduleId),
        'fallback=' + fallbackCalls);

    // B6 两条路都不可用：提示手动切换
    delete sbBooking.window.loadAdminPageContent;
    sbBooking.__alerts.length = 0;
    evalIn(sbBooking, `gotoScheduleForWaitlist('${SA.scheduleId}')`);
    ck('B6 菜单与装载函数都不可用时提示手动切换（不留白屏）',
        sbBooking.__alerts.length === 1 && /手动切换/.test(sbBooking.__alerts[0]),
        'alerts=' + JSON.stringify(sbBooking.__alerts));

    /* ============================================================
     * C. 排期页候补面板（真实接口 GET /waitlist/{scheduleId}）
     * ============================================================ */
    console.log('\n--- C. 课程排期页候补队列面板（真实接口）---');
    // 排期页需要的一整套表单节点（renderSchedule 会无条件写这些节点；
    // 真实页面里它们来自 admin.html 的静态骨架）
    const SCHED_IDS = ['waitlistSection', 'waitlistBody', 'waitlistSummary', 'now_availableSites',
        'courseSelect', 'scheduleSelect', 'scheduleId', 'classForm', 'courseId', 'teacherName',
        'scheduleName', 'availableSites', 'timeZone', 'startDate', 'startTime', 'repeatType',
        'interval', 'status', 'endDate', 'repeatUnit', 'weekDaysBox', 'monthDaysBox', 'intervalBox',
        'monthDays', 'assignStudentSelect', 'testTimeZone', 'testTimeZoneForm', 'toggleUserTimeZone',
        'userTimeZoneRow', 'conflictMessage', 'resultBody', 'calendar', 'dynamic-content-center'];
    const sbSched = makeSandbox({ token: adminTk, ids: SCHED_IDS });
    loadScripts(sbSched, ['js/public/api.js', 'js/public/courseAndBooking.js', 'js/admin-schedule.js']);

    const bodyEl = () => sbSched.document.getElementById('waitlistBody');
    const sectEl = () => sbSched.document.getElementById('waitlistSection');
    const sumEl = () => sbSched.document.getElementById('waitlistSummary');

    // C1 队列为空 → 面板隐藏且内容清空（不能只 display:none，否则下次闪出残留）
    bodyEl().innerHTML = '<div>上一次的残留</div>';
    sectEl().style.display = '';
    await evalIn(sbSched, `renderWaitlistPanel('${SB.scheduleId}__not_exist__')`);
    ck('C1 队列为空时面板隐藏且内容被清空（不留残影）',
        sectEl().style.display === 'none' && bodyEl().innerHTML === '' && sumEl().textContent === '',
        'display=' + JSON.stringify(sectEl().style.display) + ' body=' + JSON.stringify(bodyEl().innerHTML.slice(0, 40)));

    // C2/C3/C4 有队列 → 行数、次序、申请时间与按钮
    sbSched.document.getElementById('now_availableSites').value = '0';   // 已取消，空位已腾出 → 可递补
    await evalIn(sbSched, `renderWaitlistPanel('${SA.scheduleId}')`);
    const rowsHtml = bodyEl().innerHTML;
    const rowCount = (rowsHtml.match(/第 \d+ 位/g) || []).length;
    ck('C2 候补队列渲染出 2 行（与库里候补数一致）', rowCount === 2, 'rows=' + rowCount);
    ck('C3 次序按申请时间升序：先申请的排在「第 1 位」【递补次序正确性】',
        rowsHtml.indexOf('第 1 位') >= 0 && rowsHtml.indexOf('第 1 位') < rowsHtml.indexOf('第 2 位')
        && rowsHtml.indexOf(wBId) < rowsHtml.indexOf(wCId),
        '次序错乱');
    ck('C4 每行都有申请时间与「递补」按钮（可行动）',
        (rowsHtml.match(/申请于 /g) || []).length === 2 && (rowsHtml.match(/递补<\/button>|递补<\/button>/g) || []).length >= 2
        && rowsHtml.indexOf('clickPromoteWaitlist') >= 0,
        '缺少文案或按钮');
    ck('C5 面板已显示（有候补时不隐藏）', sectEl().style.display === '', 'display=' + JSON.stringify(sectEl().style.display));
    ck('C6 摘要含候补人数与剩余席位', /共 2 人候补/.test(sumEl().textContent) && /剩余席位/.test(sumEl().textContent),
        sumEl().textContent);

    // C7 无空位（排期被占满）→ 按钮 disabled，摘要说明原因（要求 4 的前端面）
    sbSched.document.getElementById('now_availableSites').value = '0';
    await evalIn(sbSched, `renderWaitlistPanel('${SB.scheduleId}')`);
    const noSeatHtml = bodyEl().innerHTML;
    ck('C7 剩余席位为 0 时「递补」按钮 disabled 且摘要提示需先腾空位',
        /disabled/.test(noSeatHtml) && /暂无空位/.test(sumEl().textContent),
        'summary=' + sumEl().textContent);

    /* ============================================================
     * D. 竞态：慢响应不得覆盖新排期（序号守卫）
     * ============================================================ */
    console.log('\n--- D. 快速切换排期：迟到的旧响应不得覆盖新排期 ---');
    let slowFired = 0;
    hooks.beforeRequest = async (method, url, sb) => {
        if (/\/waitlist\//.test(url) && url.indexOf(SA.scheduleId) >= 0) {
            slowFired++;
            await new Promise((r) => setTimeout(r, 120));   // 只把排期 A 的请求拖慢
        }
    };
    // 先请求 A（慢），紧接着请求 B（快）——A 的响应后到，必须被丢弃
    const pSlow = evalIn(sbSched, `renderWaitlistPanel('${SA.scheduleId}')`);
    const pFast = evalIn(sbSched, `renderWaitlistPanel('${SB.scheduleId}')`);
    await Promise.all([pSlow, pFast]);
    await new Promise((r) => setTimeout(r, 200));
    hooks.beforeRequest = null;

    ck('D1 用例有效性：慢响应延迟确实被注入（否则本用例无判别力）', slowFired > 0, 'slowFired=' + slowFired);
    const after = bodyEl().innerHTML;
    ck('D2 最终显示的是后选的排期 B（1 行），旧排期 A 的 2 行结果没有覆盖回来',
        (after.match(/第 \d+ 位/g) || []).length === 1 && after.indexOf(wB2Id) >= 0,
        'rows=' + ((after.match(/第 \d+ 位/g) || []).length) + ' 含B候补=' + (after.indexOf(wB2Id) >= 0));

    // D3 阴性对照：把序号守卫注释掉，同样的时序应显示成旧结果（证明 D2 真的在守这个机制）
    const schedSrc = fs.readFileSync(FE + '/js/admin-schedule.js', 'utf8');
    const guardRe = /if \(seq !== waitlistRenderSeq\) return;[^\n]*\n/;
    const brokenSrc = schedSrc.replace(guardRe, '// 守卫被移除（阴性对照）\n');
    ck('D3 阴性对照改动确实命中源码', brokenSrc !== schedSrc, '未替换到守卫');
    if (brokenSrc !== schedSrc) {
        const sbBroken = makeSandbox({ token: adminTk, ids: SCHED_IDS });
        loadScripts(sbBroken, ['js/public/api.js', 'js/public/courseAndBooking.js']);
        vm.runInContext(brokenSrc, sbBroken, { filename: 'admin-schedule.js(no-guard)' });
        sbBroken.document.getElementById('now_availableSites').value = '0';
        hooks.beforeRequest = async (m, url) => {
            if (/\/waitlist\//.test(url) && url.indexOf(SA.scheduleId) >= 0) await new Promise((r) => setTimeout(r, 120));
        };
        const q1 = evalIn(sbBroken, `renderWaitlistPanel('${SA.scheduleId}')`);
        const q2 = evalIn(sbBroken, `renderWaitlistPanel('${SB.scheduleId}')`);
        await Promise.all([q1, q2]);
        await new Promise((r) => setTimeout(r, 200));
        hooks.beforeRequest = null;
        const brokenRows = (sbBroken.document.getElementById('waitlistBody').innerHTML.match(/第 \d+ 位/g) || []).length;
        ck('D3-b 去掉守卫后旧排期 A 的 2 行确实覆盖了排期 B（对照生效，D2 有判别力）',
            brokenRows === 2, 'rows=' + brokenRows + '（期望 2=旧结果覆盖成功）');
    }

    /* ============================================================
     * E. 递补按钮：点击 → 真实递补 → 通知学生
     * ============================================================ */
    console.log('\n--- E. 点「递补」：真实调用 /waitlist/promote ---');

    // E 组模拟"管理员已经在排期页选中了某课程某排期"的真实起点：
    // 课程/排期下拉已选中、scheduleList 已由 loadSchedule 填好。
    // 不摆好这个起点，clickPromoteWaitlist 里的 loadSchedule + displySchedule 链会因
    // "未选课程"早退，测出来的就不是产品行为而是测试环境缺失（技能 #45）。
    const schedRow = {
        scheduleId: SA.scheduleId, courseId: SA.courseId, availableSites: 1,
        name: '前端接线测试排期', timeZone: 'Asia/Shanghai',
        startDate: '2026-09-15', startTime: '09:00', repeatType: 'none', interval: 1, status: 'active'
    };
    const csSel = sbSched.document.getElementById('courseSelect');
    csSel.innerHTML = '<option value="">请选择课程</option>'
        + `<option value="${SA.courseId}" data-teacher-id="${SA.teacherId}">测试课程</option>`;
    csSel.value = SA.courseId;
    const ssSel = sbSched.document.getElementById('scheduleSelect');
    ssSel.innerHTML = '<option value="">请选择排期</option>'
        + `<option value="${SA.scheduleId}">排期</option>`;
    ssSel.value = SA.scheduleId;
    evalIn(sbSched, `scheduleList = ${JSON.stringify([schedRow])}`);
    ck('前置：排期页已选中课程与排期（模拟真实起点）',
        String(csSel.value) === String(SA.courseId) && String(ssSel.value) === String(SA.scheduleId),
        'course=' + csSel.value + ' schedule=' + ssSel.value);

    // E1 confirm 取消 → 不发请求、库里状态不变
    sbSched.__requestLog.length = 0;
    sbSched.__confirmAnswer = false;
    evalIn(sbSched, `clickPromoteWaitlist('${wBId}', 1)`);
    await new Promise((r) => setTimeout(r, 120));
    ck('E1 确认框点「取消」时不发递补请求、库中状态不变',
        !sbSched.__requestLog.some((x) => /promote/.test(x)) && statusOf(wBId) === 'waiting',
        'log=' + JSON.stringify(sbSched.__requestLog.filter((x) => /promote/.test(x))) + ' status=' + statusOf(wBId));

    // E2 confirm 确认 → 真实递补成功（库状态 + 课次 + 学生收消息）
    const msgBefore = Number(scalar(`SELECT COUNT(*) FROM ${MSG_DB}.msg_message WHERE category_code='BOOKING_CONFIRMED'`));
    sbSched.__confirmAnswer = true;
    sbSched.__alerts.length = 0;
    await evalIn(sbSched, `clickPromoteWaitlist('${wBId}', 1)`);
    await new Promise((r) => setTimeout(r, 400));
    ck('E2.1 递补后库中状态转为 booked', statusOf(wBId) === 'booked', 'status=' + statusOf(wBId));
    ck('E2.2 递补后生成了课次时间表', apptCount(wBId) > 0, 'appt=' + apptCount(wBId));
    ck('E2.3 确认文案说明了「生成课次 + 自动通知该学生」',
        sbSched.__confirms.length > 0 && /通知该学生/.test(sbSched.__confirms[0]),
        JSON.stringify(sbSched.__confirms.slice(-1)));
    ck('E2.4 成功后给出明确反馈', sbSched.__alerts.some((m) => /递补成功/.test(m)), JSON.stringify(sbSched.__alerts));
    const msgAfter = Number(scalar(`SELECT COUNT(*) FROM ${MSG_DB}.msg_message WHERE category_code='BOOKING_CONFIRMED'`));
    ck('E2.5 要求 3：递补成功后系统确实给学生发了消息（消息表 +1）', msgAfter === msgBefore + 1,
        'before=' + msgBefore + ' after=' + msgAfter);
    ck('E2.6 递补后队列只剩 1 人（第 1 位换人）',
        (bodyEl().innerHTML.match(/第 \d+ 位/g) || []).length === 1,
        'rows=' + ((bodyEl().innerHTML.match(/第 \d+ 位/g) || []).length));

    // E3 失败路径：对已递补（booked）的记录再点一次 → 返回 null、不抛异常、仍刷新面板
    sbSched.__alerts.length = 0;
    await evalIn(sbSched, `clickPromoteWaitlist('${wBId}', 1)`);
    await new Promise((r) => setTimeout(r, 250));
    ck('E3 对已被处理的记录重复点「递补」不报错、不弹成功、状态不被改坏',
        statusOf(wBId) === 'booked' && !sbSched.__alerts.some((m) => /递补成功/.test(m)),
        'status=' + statusOf(wBId) + ' alerts=' + JSON.stringify(sbSched.__alerts));

    /* ============================================================
     * F. 深链消费：pendingDeepLink → 锁定课程与排期 → 候补面板就位
     * ============================================================ */
    console.log('\n--- F. 深链：{scdid,sid:null} 落地到排期页并锁定该排期 ---');
    const sbDeep = makeSandbox({ token: adminTk, ids: SCHED_IDS });
    loadScripts(sbDeep, ['js/public/api.js', 'js/public/courseAndBooking.js', 'js/admin-schedule.js']);

    // 课程下拉里放入该排期所属课程（真实值），模拟"课程列表已加载"
    const courseSelect = sbDeep.document.getElementById('courseSelect');
    courseSelect.innerHTML = '<option value="">请选择课程</option>'
        + `<option value="${SA.courseId}" data-teacher-id="${SA.teacherId}">课程</option>`;
    sbDeep.document.getElementById('now_availableSites').value = '5';

    const dlObj = sbBooking.window.pendingDeepLink;   // ← 就是 B2 里「查询递补」写入的那个对象
    await evalIn(sbDeep, `handleAdminDeepLink(${JSON.stringify(dlObj)})`);

    ck('F1 深链把 courseSelect 选中到该排期所属课程',
        String(courseSelect.value) === String(SA.courseId), 'value=' + courseSelect.value);
    const scheduleSelect = sbDeep.document.getElementById('scheduleSelect');
    ck('F2 真实 loadSchedule 拉回该课程的排期列表并填入下拉（非空即证明链路通）',
        scheduleSelect.options.length > 1, 'options=' + scheduleSelect.options.length);
    ck('F3 深链把 scheduleSelect 锁定到 scdid 指定的排期（要求 2 的"带入排期 id"）',
        String(scheduleSelect.value) === String(SA.scheduleId),
        'value=' + scheduleSelect.value + ' 期望=' + SA.scheduleId);
    ck('F4 未传 sid 时不预选学生、也不弹「指定学生不在学生列表中」',
        !sbDeep.__alerts.some((m) => /指定学生/.test(m)), JSON.stringify(sbDeep.__alerts));
    const deepBody = sbDeep.document.getElementById('waitlistBody').innerHTML;
    ck('F5 深链末端候补面板已在同一排期上渲染（await 到位，不会"带过来了但面板不定"）',
        /第 1 位/.test(deepBody),
        'bodyLen=' + deepBody.length + ' alerts=' + JSON.stringify(sbDeep.__alerts));
    ck('F6 剩余席位由真实 renderSchedule 从后端算出并写入 now_availableSites（面板据此判断能否递补）',
        sbDeep.document.getElementById('now_availableSites').value !== '5',
        'value=' + sbDeep.document.getElementById('now_availableSites').value);

    /* ============================================================
     * G. 阴性对照：把「刷新后把排期选回来」删掉，面板应当丢失
     *    证明 E2.6 不是恒真断言，而是真的在守这个修复点（技能 #40）
     * ============================================================ */
    console.log('\n--- G. 阴性对照：删掉刷新后的排期重选 → 候补面板应丢失 ---');
    const SC = pickFreshSchedule();
    ck('G1 前置：取到 1 个空闲排期', !!SC, 'got=' + (SC && SC.scheduleId));
    if (SC) {
        const gA = await apiCreate(adminTk, SC.scheduleId, students[0], SC.teacherId, 'booking');
        const gAId = gA && gA.bookingId ? gA.bookingId : gA;
        await apiUpdateStatus(adminTk, gAId, 'booked');
        // 与主场景一致：A 取消后腾出唯一席位，这才有递补的余地
        // （不腾空位的话递补会被名额闸门拒掉，阴性对照就测不到"刷新链"了）
        await apiUpdateStatus(adminTk, gAId, 'cancelled');
        const gW = await apiCreate(tkB, SC.scheduleId, students[1], SC.teacherId, 'waiting');
        const gWId = gW && gW.bookingId ? gW.bookingId : gW;
        ck('G2 前置：空位已腾出且有 1 条候补', statusOf(gAId) === 'cancelled' && statusOf(gWId) === 'waiting',
            'A=' + statusOf(gAId) + ' W=' + statusOf(gWId));

        const srcG = fs.readFileSync(FE + '/js/admin-schedule.js', 'utf8');
        const brokenG = srcG.replace(/^[ \t]*reselectScheduleOption\(keepScheduleId\);[^\n]*$/m,
            '// 重选被移除（阴性对照）');
        ck('G3 阴性对照改动确实命中源码', brokenG !== srcG, '未替换到 reselectScheduleOption 调用');

        if (brokenG !== srcG) {
            const sbG = makeSandbox({ token: adminTk, ids: SCHED_IDS });
            loadScripts(sbG, ['js/public/api.js', 'js/public/courseAndBooking.js']);
            vm.runInContext(brokenG, sbG, { filename: 'admin-schedule.js(no-reselect)' });
            const gcs = sbG.document.getElementById('courseSelect');
            gcs.innerHTML = '<option value="">请选择课程</option>'
                + `<option value="${SC.courseId}" data-teacher-id="${SC.teacherId}">测试课程</option>`;
            gcs.value = SC.courseId;
            const gss = sbG.document.getElementById('scheduleSelect');
            gss.innerHTML = '<option value="">请选择排期</option>'
                + `<option value="${SC.scheduleId}">排期</option>`;
            gss.value = SC.scheduleId;
            evalIn(sbG, `scheduleList = ${JSON.stringify([{
                scheduleId: SC.scheduleId, courseId: SC.courseId, availableSites: 1,
                name: '阴性对照排期', timeZone: 'Asia/Shanghai', startDate: '2026-09-15',
                startTime: '09:00', repeatType: 'none', interval: 1, status: 'active'
            }])}`);

            sbG.__confirmAnswer = true;
            await evalIn(sbG, `clickPromoteWaitlist('${gWId}', 1)`);
            await new Promise((r) => setTimeout(r, 300));
            const gRows = (sbG.document.getElementById('waitlistBody').innerHTML.match(/第 \d+ 位/g) || []).length;
            ck('G4 去掉重选后：排期下拉被复位、候补面板消失（E2.6 确实有判别力）',
                gRows === 0 && /请选择排期/.test(JSON.stringify(sbG.__alerts)),
                'rows=' + gRows + ' alerts=' + JSON.stringify(sbG.__alerts));
            ck('G5 该版本次补本身仍是成功的（说明丢的只是界面上下文，不是数据）',
                statusOf(gWId) === 'booked', 'status=' + statusOf(gWId));
        }
    }

    /* ============================================================
     * H. 阴性对照：把入口条件退回「枚举状态」→ rej-booking / frozen 应失去入口
     *    用来证明 A9 对这两个状态的断言确实有判别力（不是恒真）。
     *    做法与 G 相同：改内存里的源码副本，不改磁盘文件。
     * ============================================================ */
    console.log('\n--- H. 阴性对照：退回旧实现（只认 cancelled/canceled）---');
    const srcB = fs.readFileSync(FE + '/js/admin-booking.js', 'utf8');
    const NEEDLE = "cardInfo.status !== 'waiting' && !bookingOccupiesSeat(cardInfo.status)";
    const brokenB = srcB.replace(NEEDLE,
        "(cardInfo.status === 'cancelled' || cardInfo.status === 'canceled')   /* 阴性对照：退回枚举 */");
    ck('H1 阴性对照改动确实命中源码', brokenB !== srcB, '未替换到统一判定表达式');
    if (brokenB !== srcB) {
        const sbH = makeSandbox({ token: adminTk, ids: ['dynamic-content-center'] });
        loadScripts(sbH, ['js/public/api.js', 'js/public/courseAndBooking.js']);
        vm.runInContext(brokenB, sbH, { filename: 'admin-booking.js(enumerated)' });
        const renderH = (st) => evalIn(sbH,
            `formBookingTr({bookingId:'h-${st}',scheduleId:'${SA.scheduleId}',studentId:'s',teacherId:'t',status:'${st}'})`);
        ck('H2 退回枚举后 cancelled 仍保留入口（说明替换没有把整个按钮删掉，对照有效）',
            /查询递补/.test(renderH('cancelled')), '无');
        ck('H3 退回枚举后 rej-booking 失去入口 → A9 对它的断言有判别力',
            !/查询递补/.test(renderH('rej-booking')), '仍有入口，断言可能恒真');
        ck('H4 退回枚举后 frozen 失去入口 → A9 对它的断言有判别力',
            !/查询递补/.test(renderH('frozen')), '仍有入口，断言可能恒真');
    }
}

/* ============ 清理 ============ */
function cleanup() {
    try {
        if (createdBookings.length) {
            const list = createdBookings.filter(Boolean).map((id) => "'" + id + "'").join(',');
            sql(`DELETE FROM ${DB}.appointment WHERE booking_id IN (${list})`);
            sql(`DELETE FROM ${DB}.booking WHERE booking_id IN (${list})`);
            console.log('\n清理：已删除测试产生的 ' + createdBookings.length + ' 条 booking 及课次');
        }
        // 测试期间由递补产生的通知（标题为加密列，只能用 HMAC 索引；且必须单表 + 子查询，
        // 多表别名 DELETE 在 CLI 下会报 ERROR 1046 No database selected）
        const msgProps = fs.readFileSync(
            'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api/message-service/src/main/resources/application.properties', 'utf8');
        const hmacKey = Buffer.from(/^crypto\.hmac-key=(.+)$/m.exec(msgProps)[1].trim(), 'base64');
        const idx = crypto.createHmac('sha256', hmacKey).update('候补递补成功', 'utf8').digest('hex');
        sql(`DELETE FROM ${MSG_DB}.msg_inbox WHERE message_id IN (SELECT message_id FROM ${MSG_DB}.msg_message
             WHERE title LIKE '${idx}:%' AND create_time >= DATE_SUB(NOW(), INTERVAL 30 MINUTE))`);
        sql(`DELETE FROM ${MSG_DB}.msg_message WHERE title LIKE '${idx}:%' AND create_time >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)`);
    } catch (e) {
        console.log('\n清理失败（不影响测试结论）：' + (e.stderr || e.message));
    }
}

function report() {
    console.log('\n========== 结果 ==========');
    console.log('PASS ' + pass + ' / FAIL ' + fail);
    if (fail) { console.log('失败项：'); failures.forEach((f) => console.log('  - ' + f)); }
    console.log('==========================');
}

main()
    .then(() => { cleanup(); report(); process.exit(fail ? 1 : 0); })
    .catch((e) => { console.error('\n测试异常：', e); cleanup(); report(); process.exit(1); });
