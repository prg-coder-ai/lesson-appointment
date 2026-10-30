/**
 * 服务端「用户可见提示文案」术语化 —— 静态护栏测试（纯静态，不需要后端运行）
 *
 * 背景：`Result.success(data, msg)` 弹 toast、`throw new XxxException(msg)` 经
 * GlobalExceptionHandler 返回给前端——这两类文案是用户直接看到的，必须走术语占位符
 * （见 skills/server-side-term-template）。历史上有 42 处写死了教育行业词（课程/排期/学生…），
 * 已全部改为 `TermMsg.t("{course}创建成功")` 形式。
 *
 * 本测试守的是「以后还会不会对」：只要有人新加接口时图省事写
 * `Result.success(data, "课程创建成功")`，这里立刻红——不必等到某个律所租户收到提示才发现。
 *
 * 规则：
 *   R1 用户可见文案（Result.* / throw new *Exception）的字符串字面量不得含行业锚点词
 *   R2 这些文案里的 {key} 占位符必须能在平台词表 sys_term(0,0) 里查到（防拼错；拼错会原样
 *      输出 "{course}" 给用户）
 *   R3 QuotaType 的 label（会被拼进「xxx数量已达套餐上限」提示）不得含行业锚点词
 *   R0 阴性对照：扫描器对故意构造的违规样本必须能抓出来，否则 R1 的"全绿"没有意义
 *
 * R1 自动覆盖"假改造"：`TermMsg.t("课程创建成功")` 只是把文案包了一层、没换成占位符，
 * 里面的"课程"同样会被 R1 抓到。
 *
 * 运行：node tests/term-msg-guard-test.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24';
const JAVA_ROOT = ROOT + '/api/src/main/java';
const MYSQL = 'D:/program/mysql84/bin/mysql';
const DB = 'lesson_appointment';

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); }
}

/**
 * 行业锚点词：只允许出现在 {占位符} 里，不允许以字面量形式写进用户可见文案。
 * 与 tests/waitlist-promote-e2e-test.js 第 15 组保持一致。
 */
const ANCHORS = /(课程|上课|课次|课时|排期|学生|教师|老师|班级|学员|请假|讲义|授课)/;

/** 匹配"用户可见文案"的调用：Result 的静态工厂 + 任意异常构造 */
const VISIBLE_CALL = /Result\.(success|fail|ok|unauthorized)\s*\(|throw new [A-Za-z]+Exception\s*\(/;

/** 日志调用——不是用户可见文案，其参数里的行业词（如"课次生成={}"）属正常技术日志，须排除 */
const LOG_CALL = /log\.(info|warn|error|debug|trace)\s*\(/;

/** 动态数据占位符：由调用方传入的运行时值，不该也不能在词表里 */
const DYNAMIC_KEYS = new Set(['firstLesson', 'total', 'used', 'detail', 'quotaType']);

/* ==================== 源码读取与注释剥离 ==================== */

function walkJava(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = dir + '/' + e.name;
        if (e.isDirectory()) walkJava(p, out);
        else if (e.name.endsWith('.java')) out.push(p);
    }
    return out;
}

/**
 * 逐行返回去掉注释后的代码文本。
 * 注释里的"示例文案"（如本文件顶部那种）不该被护栏当成真实文案，否则会出现
 * "改完了但测试还红"的假阳性——这条经验来自 e2e 第 15 组（log 文案误报）。
 */
function stripComments(raw) {
    const out = [];
    let inBlock = false;
    raw.split(/\r?\n/).forEach((line, i) => {
        let t = line;
        if (inBlock) {
            const end = t.indexOf('*/');
            if (end < 0) return;
            t = t.slice(end + 2);
            inBlock = false;
        }
        const bs = t.indexOf('/*');
        if (bs >= 0) {
            const be = t.indexOf('*/', bs + 2);
            if (be < 0) { inBlock = true; t = t.slice(0, bs); }
            else t = t.slice(0, bs) + t.slice(be + 2);
        }
        // 行注释：遇到 URL 时不动刀（"http://" 里的 // 不是注释）
        if (!/https?:\/\//.test(t)) {
            const ls = t.indexOf('//');
            if (ls >= 0) t = t.slice(0, ls);
        }
        if (t.trim()) out.push({ line: i + 1, text: t });
    });
    return out;
}

function codeLines(file) {
    return stripComments(fs.readFileSync(file, 'utf8')).map((r) => ({ ...r, file }));
}

/** 提取一行里所有双引号字符串字面量的内容 */
function literalsOf(text) {
    return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

/** 提取一行里所有 {key} 占位符的 key */
function placeholdersOf(text) {
    return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
}

/* ==================== 收集扫描目标 ==================== */

const javaFiles = walkJava(JAVA_ROOT);
const targets = [];
for (const f of javaFiles) {
    for (const row of codeLines(f)) {
        if (!VISIBLE_CALL.test(row.text)) continue;
        if (LOG_CALL.test(row.text)) continue;
        targets.push(row);
    }
}

const rel = (p) => p.replace(JAVA_ROOT + '/', '').replace('com/reservation/', '');

console.log('扫描 ' + javaFiles.length + ' 个 java 文件，命中用户可见文案调用 ' + targets.length + ' 行\n');

/* ==================== R0 阴性对照：扫描器本身必须有效 ==================== */

console.log('--- R0. 阴性对照（先证明扫描器抓得住违规，再看它全绿）---');
{
    const badLine = '        return Result.success(data, "课程创建成功");';
    const goodLine = '        return Result.success(data, TermMsg.t("{course}创建成功"));';
    const logLine = '        log.info("课次已生成, bookingId={}", bookingId);';
    const commentLine = '        // 以前写的是 Result.success(data, "课程创建成功")';

    const hitsBad = VISIBLE_CALL.test(badLine) && !LOG_CALL.test(badLine)
        && literalsOf(badLine).some((s) => ANCHORS.test(s));
    const hitsGood = VISIBLE_CALL.test(goodLine) && literalsOf(goodLine).some((s) => ANCHORS.test(s));
    ck('R0.1 违规样本（Result.success 里写死"课程"）能被抓到', hitsBad);
    ck('R0.2 合规样本（TermMsg.t("{course}…")）不误报', !hitsGood);
    ck('R0.3 日志样本（log.info 含"课次"）被判为日志、不误报',
        LOG_CALL.test(logLine) && !(VISIBLE_CALL.test(logLine) && !LOG_CALL.test(logLine)));
    ck('R0.4 注释里的示例文案被剥离、不进扫描范围（否则"改完了测试还红"是假阳性）',
        (() => {
            const sample = [
                '// 旧代码：Result.success(data, "课程创建成功")',
                'return Result.success(data, TermMsg.t("{course}创建成功"));',
                '/* 块注释示例：throw new BusinessException("排期不存在") */'
            ].join('\n');
            const stripped = stripComments(sample);
            return stripped.every((r) => !/课程创建成功|排期不存在/.test(r.text))
                && stripped.some((r) => /TermMsg\.t/.test(r.text));
        })(), '合成样本：行注释 + 行内块注释');
}

/* ==================== R1 用户可见文案不得含行业锚点词 ==================== */

console.log('\n--- R1. 用户可见文案不得写死行业锚点词 ---');
const r1Violations = [];
for (const row of targets) {
    const bad = literalsOf(row.text).filter((s) => ANCHORS.test(s));
    if (bad.length) r1Violations.push(rel(row.file) + ':' + row.line + '  ' + JSON.stringify(bad.join(' | ')));
}
ck('R1.1 Result / 异常构造的字面量里无行业锚点词', r1Violations.length === 0,
    r1Violations.slice(0, 10).join('  ||  ') || ('已检查 ' + targets.length + ' 行'));

// 覆盖率护栏：如果目标行数骤降，说明 VISIBLE_CALL 被改坏了（护栏"全绿"变成假绿）
ck('R1.2 扫描覆盖面正常（命中行数 ≥ 30，防止正则失效导致假绿）',
    targets.length >= 30, '命中 ' + targets.length + ' 行');

// 至少确认 TermMsg 真的被这些文案用上了，而不是"删掉文案"了事
const termMsgUsed = targets.filter((r) => /TermMsg\.t\s*\(/.test(r.text));
ck('R1.3 命中行中确有多数已改为 TermMsg.t(...) 形式',
    termMsgUsed.length >= 30, 'TermMsg.t 出现 ' + termMsgUsed.length + ' 次');

/* ==================== R2 占位符 key 必须存在于词表 ==================== */

console.log('\n--- R2. 占位符 key 必须能在平台词表里查到 ---');
let platformKeys = null;
try {
    const out = execFileSync(MYSQL, [
        '-uroot', '-p123456', '--default-character-set=utf8mb4', '-N', '-e',
        `SELECT DISTINCT term_key FROM ${DB}.sys_term WHERE industry_id=0 AND tenant_id=0 AND status=1`
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    platformKeys = new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
} catch (e) {
    console.log('  （跳过：无法连接 MySQL 读取平台词表 - ' + String(e.message).slice(0, 80) + '）');
}

if (platformKeys) {
    ck('R2.0 前置：读到平台词表', platformKeys.size > 0, platformKeys.size + ' 个 key');
    const unknown = [];
    const seen = new Set();
    for (const row of targets) {
        for (const k of placeholdersOf(row.text)) {
            if (DYNAMIC_KEYS.has(k)) continue;
            seen.add(k);
            if (!platformKeys.has(k)) unknown.push(rel(row.file) + ':' + row.line + ' { ' + k + ' }');
        }
    }
    ck('R2.1 文案里的术语占位符全部能在平台词表查到（查不到会原样输出给用户）',
        unknown.length === 0, unknown.slice(0, 10).join('  ||  '));
    console.log('       本次用到的术语 key：' + [...seen].sort().join(', '));
}

/* ==================== R3 QuotaType label 不得含行业锚点词 ==================== */

console.log('\n--- R3. QuotaType 的额度名 label 不得写死行业词 ---');
{
    const src = fs.readFileSync(JAVA_ROOT + '/com/reservation/service/TenantPackageService.java', 'utf8');
    const m = /enum QuotaType\s*\{([\s\S]*?)\n    \}/.exec(src);
    ck('R3.0 前置：定位到 QuotaType 枚举', !!m);
    if (m) {
        const body = m[1];
        const literals = [...body.matchAll(/"([^"\n]*)"/g)].map((x) => x[1]);
        const bad = literals.filter((s) => ANCHORS.test(s));
        ck('R3.1 label 里无行业锚点词（应为 {course} / {schedule} / 注册{teacher} 之类的模板）',
            bad.length === 0, bad.join(' | ') || ('扫描 ' + literals.length + ' 条字面量'));
        ck('R3.2 label 确实用了占位符（证明不是为了绕开 R3.1 而改成英文/拼音）',
            literals.some((s) => /\{(course|schedule|teacher|student)\}/.test(s)),
            literals.join(' | '));
    }
    // getLabel() 必须走术语渲染，否则 label 改了也不生效
    const gl = /public String getLabel\(\)\s*\{([\s\S]*?)\}/.exec(src);
    ck('R3.3 getLabel() 内部走 TermMsg.t(...) 渲染（改 label 才真正生效）',
        !!gl && /TermMsg\.t\s*\(/.test(gl[1]), gl ? gl[1].trim() : '未找到');
    // 日志不得用 getLabel()（那是用户话术，随租户变化，排障时反而看不懂）
    const logUsesLabel = [...src.matchAll(/log\.\w+\([^;]*getLabel\(\)/g)].length
        + [...fs.readFileSync(JAVA_ROOT + '/com/reservation/service/TenantQuotaService.java', 'utf8')
            .matchAll(/log\.\w+\([^;]*getLabel\(\)/g)].length;
    ck('R3.4 日志里不用 getLabel()（应改用 type.name()）', logUsesLabel === 0,
        '发现 ' + logUsesLabel + ' 处');
}

/* ==================== 报告 ==================== */

console.log('\n========================================');
console.log('结果：PASS ' + pass + ' / FAIL ' + fail);
if (fail) {
    console.log('失败项：');
    failures.forEach((f) => console.log('  - ' + f));
    process.exitCode = 1;
} else {
    console.log('全部通过：用户可见提示文案已无硬编码行业词，且类型名与日志都守住了边界。');
}
