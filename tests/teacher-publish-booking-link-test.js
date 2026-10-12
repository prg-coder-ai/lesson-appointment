/**
 * 教师职业信息发布 —— 发布页内容护栏测试（离线：无浏览器、无后端、无 DB）
 *
 * 背景（2026-09-11 git 考古定位）：
 *   8c8c648 引入两个链接 → 0d62f56（2026-08-26「暂时隐藏链接」）用 <!-- --> 注释掉（功能失效起点）
 *   → 00ace80 前后端分离把 static 目录整个删除（文件消失）
 *   → 44fc6b0 迁回 frontend 时该分支被重写，死代码删掉、改指 teacherPublishedProfile.html（引用彻底消失）
 * 本次按「隐藏前」的语义恢复，并修正两个隐患：
 *   ① URL 走**前端 booking.html**，不能写后端短链 /booking —— 前后端分离后 api 已不伺服任何页面
 *      （api/src/main/resources 下无 html），Nginx 也没有 /booking 这条 location，会落进
 *      `try_files ... /index.html` 兜底 → 家长点开看到的是登录首页。
 *   ② 空参数不渲染按钮 —— 隐藏前是 `'/booking?scdid=' + 空值`，点开等于一条无效死链。
 *
 * 2026-09-11 二次修订（用户反馈三点）：
 *   ① 外部链接不要"自动加上当前浏览器地址" —— 裸域名（www.x.com）原样进 href 会被浏览器按
 *      相对地址解析成 `<当前站点>/www.x.com`。新增 normalizeExternalUrl() 补全协议，并用
 *      Node 的 new URL(base) 做**真实对照实验**证明修好了（见 [2]）。
 *   ② 「优选推荐」在预览/发布时丢失显示 —— 发布快照改用只读徽章 opt-reco，把"哪个时段被推荐"
 *      带给家长（而不是发一个点不动的空勾选框）。见 [3]/[4]。
 *   ③ 「直达预订指定排期」的深链生成不出来 —— 真根因在 edit.js：`data-extra-scheduleid`
 *      dataset 驼峰化后是 `extraScheduleid`，而收集时读的是 `extraScheduleId`（大写 I），
 *      恒为 undefined → scheduleId 永远存空 → 发布页拿不到排期ID → scdid 链接整条消失。
 *      见 [4] 的端到端断言 + [5] 的静态护栏。
 *
 * 运行：node tests/teacher-publish-booking-link-test.js
 */
const fs = require('fs');
const vm = require('vm');

const ROOT = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24';
const SRC_PATH = ROOT + '/frontend/js/teacherInfo-publish.js';
const COMMON_PATH = ROOT + '/frontend/js/teacherInfo-common.js';
const EDIT_PATH = ROOT + '/frontend/js/teacherInfo-edit.js';
const DIST_PATH = ROOT + '/frontend/dist/js/teacherInfo-publish.js';
const DIST_COMMON_PATH = ROOT + '/frontend/dist/js/teacherInfo-common.js';
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const SRC_COMMON = fs.readFileSync(COMMON_PATH, 'utf8');
const SRC_EDIT = fs.readFileSync(EDIT_PATH, 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail != null ? '   [' + detail + ']' : '')); }
}

/* ================= 最小 DOM 垫片（只实现被测代码真正触达的 API） ================= */
function makeEl(init) {
    return Object.assign({
        value: '', checked: false, innerHTML: '', textContent: '',
        dataset: {}, _attrs: {},
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = v; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {}, removeEventListener() {},
        appendChild() {}, remove() {},
    }, init || {});
}
function makeDoc(reg) {
    return {
        getElementById(id) { return reg[id] || makeEl(); },
        querySelectorAll(sel) { const r = reg['@' + sel]; return Array.isArray(r) ? r : []; },
        querySelector(sel) { const r = reg['@' + sel]; return (Array.isArray(r) && r.length) ? r[0] : null; },
        createElement() { return makeEl(); },
    };
}

/* ================= 载入真源码（vm + 最小垫片） ================= */
const escapeHtmlImpl = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

// 顶层只会执行 PUBLISH_FIELDS_META 的构造（用到 termText），其余是函数声明，无 DOM 依赖。
// 同时载入 teacherInfo-common.js（其顶层同样只有函数声明），这样 normalizeExternalUrl
// 用的是**真源码**而不是测试自己重写的副本。
function loadModule(loc, extra) {
    const sb = Object.assign({
        termText: (k) => k,
        location: loc,
        console: { log() {}, warn() {}, error() {} },
        document: makeDoc({}),
        DAY_OF_WEEK_MAP: DAY_MAP,
        escapeHtml: escapeHtmlImpl,
        escapeAttr: escapeHtmlImpl,
        currentTeacherId: 'T-9',
        originalData: null,
    }, extra || {});
    sb.window = sb;                       // 源码读 window.FRONTEND_ORIGIN，与 location 同域
    vm.createContext(sb);
    vm.runInContext(SRC_COMMON, sb, { filename: 'teacherInfo-common.js' });
    vm.runInContext(SRC, sb, { filename: 'teacherInfo-publish.js' });
    return sb;
}

console.log('\n[1] bookingDeepLink 生成逻辑');
{
    const m = loadModule({ pathname: '/teacherInfo.html', origin: 'https://demo.test' });
    ck('T1 导出了 bookingDeepLink 函数', typeof m.bookingDeepLink === 'function', typeof m.bookingDeepLink);

    const u1 = m.bookingDeepLink({ scdid: '12345' });
    ck('T1 根路径 → 前端 booking.html + scdid', u1 === 'https://demo.test/booking.html?scdid=12345', u1);
    ck('T1 走的是前端页面而非后端短链 /booking', u1.indexOf('/booking.html') !== -1 && u1.indexOf('/booking?') === -1, u1);

    const m2 = loadModule({ pathname: '/app/teacherInfo.html', origin: 'https://demo.test' });
    const u2 = m2.bookingDeepLink({ tid: 't9' });
    ck('T2 子路径部署 → 保留目录前缀', u2 === 'https://demo.test/app/booking.html?tid=t9', u2);

    const u3 = m.bookingDeepLink({});
    ck('T3 无参数 → 不带问号', u3 === 'https://demo.test/booking.html', u3);

    const u4 = m.bookingDeepLink({ scdid: 'a b&c' });
    ck('T4 参数做 URL 编码', u4 === 'https://demo.test/booking.html?scdid=a%20b%26c', u4);

    const u5 = m.bookingDeepLink({ scdid: '', tid: 't1' });
    ck('T4 空值参数被过滤', u5 === 'https://demo.test/booking.html?tid=t1', u5);

    const m5 = loadModule({ pathname: '/teacherInfo.html', origin: 'https://demo.test' });
    m5.FRONTEND_ORIGIN = 'https://cdn.demo.test';
    const u6 = m5.bookingDeepLink({ scdid: '1' });
    ck('T5 FRONTEND_ORIGIN 覆盖生效', u6 === 'https://cdn.demo.test/booking.html?scdid=1', u6);
}

/* ============ 二、外部链接规范化（修订点 ①） ============ */
console.log('\n[2] normalizeExternalUrl —— 外部链接不再被当成站内相对路径');
{
    const m = loadModule({ pathname: '/teacherInfo.html', origin: 'https://demo.test' });
    const n = m.normalizeExternalUrl;
    ck('N0 导出了 normalizeExternalUrl 函数', typeof n === 'function', typeof n);

    // 核心对照实验：用 Node 的 URL 解析器（与浏览器同规范）证明"修之前确实是错的"
    const PAGE = 'https://demo.test/teacherInfo.html';
    const rawBare = 'www.myblog.com/cv';
    ck('N1 阴性对照：裸域名原样进 href 会被解析到 当前站点 下',
        new URL(rawBare, PAGE).href === 'https://demo.test/www.myblog.com/cv',
        new URL(rawBare, PAGE).href);
    ck('N1 修复后：同一裸域名解析到它自己',
        new URL(n(rawBare), PAGE).href === 'https://www.myblog.com/cv',
        new URL(n(rawBare), PAGE).href);

    ck('N2 裸域名补 https://', n('www.myblog.com') === 'https://www.myblog.com', n('www.myblog.com'));
    ck('N2 裸域名带路径补 https://', n('example.com/a?b=1') === 'https://example.com/a?b=1', n('example.com/a?b=1'));
    ck('N2 首尾空白被裁剪', n('  www.a.com  ') === 'https://www.a.com', n('  www.a.com  '));

    ck('N3 http:// 原样保留（内网地址不被强改 https）', n('http://10.0.0.5/cv.pdf') === 'http://10.0.0.5/cv.pdf');
    ck('N3 https:// 原样保留', n('https://a.com/x') === 'https://a.com/x');
    ck('N3 mailto:/tel: 原样保留', n('mailto:a@b.com') === 'mailto:a@b.com' && n('tel:+8613800000000') === 'tel:+8613800000000');
    ck('N3 协议相对 //cdn 补 https:', n('//cdn.a.com/x.png') === 'https://cdn.a.com/x.png');

    ck('N4 站内相对路径原样保留（不能补成 https:///…）',
        n('/uploads/a.png') === '/uploads/a.png' && n('./a.png') === './a.png' && n('../a.png') === '../a.png');
    ck('N4 锚点/查询串原样保留', n('#top') === '#top' && n('?x=1') === '?x=1');

    ck('N5 危险协议被丢弃（不产出 javascript: 伪链接）',
        n('javascript:alert(1)') === '' && n('JaVaScRiPt:alert(1)') === '' && n(' data:text/html,x') === '');
    ck('N5 空值 → 空串', n('') === '' && n('   ') === '' && n(null) === '' && n(undefined) === '');
}

/* ============ 三、可预约时间的「优选推荐」展示（修订点 ②） ============ */
console.log('\n[3] formAvaliableTimesDiv —— 优选推荐标记');
{
    const m = loadModule({ pathname: '/teacherInfo.html', origin: 'https://demo.test' });
    const TIMES = [
        { repeatType: 'none', startDate: '2026-09-12', endDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 1, scheduleId: 'SCH-1' },
        { repeatType: 'week', repeatDays: '1,3', startDate: '2026-09-14', startTime: '14:00', endTime: '15:00', optioned: 0, scheduleId: 'SCH-2' },
    ];

    const viewHtml = m.formAvaliableTimesDiv(TIMES, { withOptionCheckbox: true });
    ck('B1 后台视图仍是可勾选的复选框', viewHtml.indexOf('class="cert-optioned"') !== -1);
    ck('B1 复选框带上排期ID（发布页据此生成深链）', viewHtml.indexOf('data-extra-scheduleid="SCH-1"') !== -1);

    const snapHtml = m.formAvaliableTimesDiv(TIMES, { withOptionBadge: true, accentColor: '#722ed1' });
    ck('B2 发布快照出现「优选推荐」', snapHtml.indexOf('优选推荐') !== -1);
    ck('B2 徽章用独立 class 便于定位', snapHtml.indexOf('opt-reco') !== -1);
    ck('B2 只有被优选的时段才有徽章', (snapHtml.match(/优选推荐/g) || []).length === 1);
    ck('B2 徽章沿用发布主色', snapHtml.indexOf('#722ed1') !== -1);
    ck('B3 发布快照里没有活的勾选框', snapHtml.indexOf('cert-optioned') === -1);

    const plain = m.formAvaliableTimesDiv(TIMES, {});
    ck('B4 不传任何选项时不出现徽章/复选框',
        plain.indexOf('优选推荐') === -1 && plain.indexOf('cert-optioned') === -1);

    const noId = m.formAvaliableTimesDiv(
        [{ repeatType: 'none', startDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 1, scheduleId: '' }],
        { withOptionCheckbox: true });
    ck('B5 勾了优选但无排期ID → 后台视图给出提示',
        noId.indexOf('无法生成直达预约链接') !== -1);

    const okeId = m.formAvaliableTimesDiv(
        [{ repeatType: 'none', startDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 1, scheduleId: 'SCH-9' }],
        { withOptionCheckbox: true });
    ck('B5 阴性对照：有排期ID时不出提示', okeId.indexOf('无法生成直达预约链接') === -1);

    ck('B6 时段文本仍然正常渲染', snapHtml.indexOf('2026-09-12') !== -1 && snapHtml.indexOf('每周') !== -1);
}

/* ============ 四、发布快照端到端：徽章 + 两个预约深链（修订点 ②③） ============ */
console.log('\n[4] generatePublishHtml —— 快照里的优选标记与预约深链');
function buildEnv(opts) {
    const o = opts || {};
    const row = (key, checked) => makeEl({
        _attrs: { 'data-field-key': key },
        querySelector(sel) { return sel === '.pub-field-chk' ? makeEl({ checked }) : null; },
    });
    const box = (checked, sid) => makeEl({ checked, dataset: { extraScheduleid: sid } });
    const boxes = o.boxes || [];
    const reg = {
        'pub-fontFamily': makeEl({ value: 'Arial' }),
        'pub-fontSizePx': makeEl({ value: '15' }),
        'pub-titleSizePx': makeEl({ value: '22' }),
        'pub-photoSizePx': makeEl({ value: '160' }),
        'pub-certSizePx': makeEl({ value: '120' }),
        'pub-accentColor': makeEl({ value: '#722ed1' }),
        'pub-bgColor': makeEl({ value: '#f5f5f5' }),
        'pub-cardBgColor': makeEl({ value: '#fafafa' }),
        'pub-title': makeEl({ value: '英语教师 · 张三' }),
        'pub-fields': makeEl(),
        'view-availableTimes': makeEl({
            querySelectorAll(sel) { return sel === 'input.cert-optioned' ? boxes : []; },
        }),
        '@#pub-fields [draggable="true"]': [row('availableTimes', true), row('bioUrl', true)],
    };
    const m = loadModule(
        { pathname: '/teacherInfo.html', origin: 'https://demo.test' },
        { document: makeDoc(reg) }
    );
    m.originalData = o.data || {};
    return m;
}

const TIMES_TWO = [
    { repeatType: 'none', startDate: '2026-09-12', endDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 1, scheduleId: 'SCH-1' },
    { repeatType: 'week', repeatDays: '1,3', startDate: '2026-09-14', startTime: '14:00', endTime: '15:00', optioned: 0, scheduleId: 'SCH-2' },
];
{
    const m = buildEnv({
        data: { name: '张三', subject: '英语', bioUrl: 'www.myblog.com/cv', availableTimes: TIMES_TWO },
        boxes: [makeEl({ checked: true, dataset: { extraScheduleid: 'SCH-1' } }),
                makeEl({ checked: false, dataset: { extraScheduleid: 'SCH-2' } })],
    });
    const html = m.generatePublishHtml('standalone');

    ck('E1 快照出现「优选推荐」徽章', html.indexOf('优选推荐') !== -1);
    ck('E1 快照不含后台勾选框', html.indexOf('cert-optioned') === -1);
    ck('E2 快照含「直达预定」深链且指向优选排期',
        html.indexOf('booking.html?scdid=SCH-1') !== -1);
    ck('E2 scdid 用的是被优选的排期（不是另一条 SCH-2）',
        html.indexOf('scdid=SCH-2') === -1);
    ck('E3 快照含「全部排期」深链（tid=当前教师）',
        html.indexOf('booking.html?tid=T-9') !== -1);
    ck('E3 两个链接文案都在', html.indexOf('直达预定') !== -1 && html.indexOf('全部排期') !== -1);
    ck('E4 外部链接 href 被补全协议（不加当前站点）',
        html.indexOf('href="https://www.myblog.com/cv"') !== -1);
    ck('E4 外部链接不再出现相对形式', html.indexOf('href="www.myblog.com/cv"') === -1);
    ck('E5 快照是完整 HTML 文档', html.indexOf('<!DOCTYPE html>') === 0 && html.indexOf('</html>') !== -1);
}
{
    // 交叉验证：data 里 optioned=0，但查看区 DOM 被管理员当场勾上 → 以 DOM 为准
    const m = buildEnv({
        data: {
            name: '张三',
            availableTimes: [
                { repeatType: 'none', startDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 0, scheduleId: 'SCH-1' },
                { repeatType: 'week', repeatDays: '1,3', startDate: '2026-09-14', startTime: '14:00', endTime: '15:00', optioned: 0, scheduleId: 'SCH-2' },
            ],
        },
        boxes: [makeEl({ checked: true, dataset: { extraScheduleid: 'SCH-1' } }),
                makeEl({ checked: false, dataset: { extraScheduleid: 'SCH-2' } })],
    });
    const html = m.generatePublishHtml('standalone');
    ck('E6 查看区当场改勾（未落库）也能生效：徽章跟着出现', html.indexOf('优选推荐') !== -1);
    ck('E6 查看区当场改勾（未落库）也能生效：深链指向它', html.indexOf('booking.html?scdid=SCH-1') !== -1);
}
{
    // 没有任何优选 → 不渲染死链（隐藏前的 bug 是拼出 ?scdid= 空值）
    const m = buildEnv({
        data: {
            name: '张三',
            availableTimes: [
                { repeatType: 'none', startDate: '2026-09-12', startTime: '09:00', endTime: '09:45', optioned: 0, scheduleId: 'SCH-1' },
            ],
        },
        boxes: [makeEl({ checked: false, dataset: { extraScheduleid: 'SCH-1' } })],
    });
    const html = m.generatePublishHtml('standalone');
    ck('E7 未勾优选 → 不渲染「直达预定」，避免空参数死链',
        html.indexOf('直达预定') === -1 && html.indexOf('scdid=') === -1);
    ck('E7 但仍保留「全部排期」', html.indexOf('booking.html?tid=T-9') !== -1);
    ck('E7 无优选时也不出现徽章', html.indexOf('优选推荐') === -1);
}

/* ============ 五、源码静态护栏（防回退） ============ */
console.log('\n[5] 源码静态护栏（防再次「暂时隐藏」/ 防字段名写错）');
function sliceAvailableTimesBranch(text) {
    const start = text.indexOf("if (f.key === 'availableTimes')");
    if (start === -1) return '';
    const next = text.indexOf("if (f.key === ", start + 10);
    return text.slice(start, next === -1 ? text.length : next);
}
const BRANCH = sliceAvailableTimesBranch(SRC);
ck('G0 能定位 availableTimes 分支', BRANCH.length > 100, BRANCH.length);

ck('G1 分支调用 bookingDeepLink 生成链接', BRANCH.indexOf('bookingDeepLink(') !== -1);
ck('G2 分支返回模板插入了 bookingLinks', BRANCH.indexOf('${bookingLinks}') !== -1);
ck('G3 分支没有被注释掉的链接（无 <!-- ）', BRANCH.indexOf('<!--') === -1);

// G3 的阴性对照：同一个判据必须在「违规样本」上判违规、在真源码上判合规，
// 否则说明判据是恒真的（例如切片段落没切到、或匹配词写错）。
const judgeNoComment = (text) => sliceAvailableTimesBranch(text).indexOf('<!--') === -1;  // true = 合规
const BAD_SAMPLE = "if (f.key === 'availableTimes') {\n  <!-- div><a href=\"x\">直达预定</a></div -->\n  if (f.key === 'bioText') {}";
ck('G3 阴性对照：同一判据在合成违规样本上判为违规', judgeNoComment(BAD_SAMPLE) === false);
ck('G3 阳性自证：同一判据在真实源码上判为合规', judgeNoComment(SRC) === true);

ck("G4 全文件无后端短链 '/booking?'",
    SRC.indexOf("'/booking?") === -1 && SRC.indexOf('"/booking?') === -1);
ck('G5 仍保留「直达预定 / 全部排期」按钮文案',
    BRANCH.indexOf('直达预定') !== -1 && BRANCH.indexOf('全部排期') !== -1);

// 修订点 ②③ 的静态护栏
ck('G6 发布快照分支显式开启只读徽章 withOptionBadge',
    BRANCH.indexOf('withOptionBadge: true') !== -1);
ck('G6 发布快照分支显式关闭后台勾选框',
    BRANCH.indexOf('withOptionCheckbox: false') !== -1);
ck('G7 徽章语义与文案在 formAvaliableTimesDiv 里落地',
    SRC.indexOf('opt-reco') !== -1 && SRC.indexOf('优选推荐') !== -1);
ck('G8 优选徽章与直达链接共用同一解析结果（不再各读一处 DOM）',
    SRC.indexOf('syncOptedFromViewDom(data)') !== -1 &&
    SRC.indexOf('resolveOptedScheduleId(data)') !== -1);
// 修订点 ① 的静态护栏：bioUrl 分支必须走规范化函数
// （切片限定在分支体长度内，避免"文件后面某处出现过"这种恒真判据）
const BIO_START = SRC.indexOf("if (f.key === 'bioUrl')");
const BIO_BRANCH = BIO_START === -1 ? '' : SRC.slice(BIO_START, BIO_START + 700);
const judgeBioNormalized = (t) => {
    const i = t.indexOf("if (f.key === 'bioUrl')");
    return i !== -1 && t.slice(i, i + 700).indexOf('normalizeExternalUrl(') !== -1;
};
ck('G9 外部链接分支走 normalizeExternalUrl',
    BIO_BRANCH.length > 50 && BIO_BRANCH.indexOf('normalizeExternalUrl(') !== -1);
const BIO_BAD = "if (f.key === 'bioUrl') {\n  if (!v) return '';\n  return `<a href=\"${escapeAttr(v)}\">${escapeHtml(v)}</a>`;\n}";
ck('G9 阴性对照：未做协议补全的 bioUrl 分支被判违规', judgeBioNormalized(BIO_BAD) === false);
ck('G9 阳性自证：真源码的同判据为合规', judgeBioNormalized(SRC) === true);

// 修订点 ③ 的真根因：dataset 驼峰大小写
// `data-extra-scheduleid` 经驼峰化是 `extraScheduleid`（小写 i）；写成 extraScheduleId 恒 undefined。
ck('G10 edit.js 读取 dataset.extraScheduleid（小写 i）',
    SRC_EDIT.indexOf('extraScheduleid') !== -1);
ck('G10 读取表达式把正确写法放在首位、错误写法仅作回退',
    /extraScheduleid\s*\|\|\s*\w+\.extraScheduleId/.test(SRC_EDIT));
ck('G10 阴性对照：只读 extraScheduleId 的样本判为不合规',
    /extraScheduleid\s*\|\|\s*\w+\.extraScheduleId/.test(
        "const scheduleId = (ds && ds.extraScheduleId) || '';") === false);
ck('G11 edit.js 保存外部链接时做协议补全',
    /bioUrl:\s*normalizeExternalUrl\(/.test(SRC_EDIT));
ck('G12 视图渲染外部链接时也做协议补全（common.js）',
    /const bioHref = normalizeExternalUrl\(/.test(SRC_COMMON));

/* ============ 六、构建产物接线（如已构建） ============ */
console.log('\n[6] dist 产物接线');
if (fs.existsSync(DIST_PATH)) {
    const DIST = fs.readFileSync(DIST_PATH, 'utf8');
    ck('D1 dist 保留了跨文件全局名 bookingDeepLink', DIST.indexOf('bookingDeepLink') !== -1);
    ck('D2 dist 含预约入口链接文案', DIST.indexOf('直达预定') !== -1 && DIST.indexOf('全部排期') !== -1);
    ck('D3 dist 无后端短链残留', DIST.indexOf("'/booking?") === -1);
    ck('D4 dist 保留了优选徽章', DIST.indexOf('优选推荐') !== -1 && DIST.indexOf('opt-reco') !== -1);
    ck('D5 dist 调用了跨文件的 normalizeExternalUrl（未被混淆掉）',
        DIST.indexOf('normalizeExternalUrl') !== -1);
    if (fs.existsSync(DIST_COMMON_PATH)) {
        const DIST_COMMON = fs.readFileSync(DIST_COMMON_PATH, 'utf8');
        ck('D6 dist/common 仍导出 normalizeExternalUrl',
            DIST_COMMON.indexOf('normalizeExternalUrl') !== -1);
    } else {
        console.log('  SKIP  dist/js/teacherInfo-common.js 不存在（未构建）');
    }
    const DIST_EDIT = ROOT + '/frontend/dist/js/teacherInfo-edit.js';
    if (fs.existsSync(DIST_EDIT)) {
        const DE = fs.readFileSync(DIST_EDIT, 'utf8');
        ck('D7 dist/edit 读取的是 extraScheduleid（小写 i）', DE.indexOf('extraScheduleid') !== -1);
        ck('D7 dist/edit 调用 normalizeExternalUrl', DE.indexOf('normalizeExternalUrl') !== -1);
    } else {
        console.log('  SKIP  dist/js/teacherInfo-edit.js 不存在（未构建）');
    }
} else {
    console.log('  SKIP  dist/js/teacherInfo-publish.js 不存在（未构建）');
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail > 0) { console.log('失败项：' + failures.join(' | ')); process.exit(1); }
