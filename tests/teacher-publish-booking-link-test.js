/**
 * 教师职业信息发布 —— 「直达预定 / 全部排期」预约深链 护栏测试（离线：无浏览器、无后端、无 DB）
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
 * 运行：node tests/teacher-publish-booking-link-test.js
 */
const fs = require('fs');
const vm = require('vm');

const SRC_PATH = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/teacherInfo-publish.js';
const DIST_PATH = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/dist/js/teacherInfo-publish.js';
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail != null ? '   [' + detail + ']' : '')); }
}

/* ============ 一、载入真源码（vm + 最小垫片） ============ */
// 顶层只会执行 PUBLISH_FIELDS_META 的构造（用到 termText），其余是函数声明，无 DOM 依赖。
function loadModule(loc) {
    const sb = {
        termText: (k) => k,
        location: loc,
        console: { log() {}, warn() {}, error() {} },
    };
    sb.window = sb;                       // 源码读 window.FRONTEND_ORIGIN，与 location 同域
    vm.createContext(sb);
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

/* ============ 二、源码静态护栏 ============ */
console.log('\n[2] 源码静态护栏（防再次「暂时隐藏」）');
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

/* ============ 三、构建产物接线（如已构建） ============ */
console.log('\n[3] dist 产物接线');
if (fs.existsSync(DIST_PATH)) {
    const DIST = fs.readFileSync(DIST_PATH, 'utf8');
    ck('D1 dist 保留了跨文件全局名 bookingDeepLink', DIST.indexOf('bookingDeepLink') !== -1);
    ck('D2 dist 含预约入口链接文案', DIST.indexOf('直达预定') !== -1 && DIST.indexOf('全部排期') !== -1);
    ck('D3 dist 无后端短链残留', DIST.indexOf("'/booking?") === -1);
} else {
    console.log('  SKIP  dist/js/teacherInfo-publish.js 不存在（未构建）');
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
if (fail > 0) { console.log('失败项：' + failures.join(' | ')); process.exit(1); }
