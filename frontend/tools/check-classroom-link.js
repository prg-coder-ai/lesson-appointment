#!/usr/bin/env node
'use strict';
/*
 * 课堂深链守卫（C1 / C12-c）
 * ==================================================================
 * 1) 字面量回潮：除白名单外，全仓不得再出现
 *      classroom.html?scheduleId / classroom-prep.html?scheduleId / replay.html?scheduleId
 * 2) C12-c：api.js 的 [CLS-LINK-BEGIN]…[CLS-LINK-END] 区间必须整体位于 IIFE 内。
 *
 * ★ 为什么不用 tools/check-global-collide.mjs 的判据：
 *   它按「行首有缩进 ⇒ 在函数体内」近似，而 api.js:749+ 的顶层声明全都带缩进，
 *   该守卫对这段是盲的（goBack 同名覆盖就是这么活下来的）。这里改用「相对深度的
 *   tokenizer」——必须跳过字符串/模板串/正则字面量/行注释/块注释，否则
 *   api.js 里 .replace(/'/g, '&#39;') 这类正则中的引号会被当成字符串起点，
 *   深度全错、静默给出假结论。
 *
 * 用法：node frontend/tools/check-classroom-link.js [--verbose] [--block-only] [目标文件]
 *       CLS_FRONTEND=/path/to/frontend CLS_REPO=/path/to/repo  # 仅测试用，覆盖扫描根
 * 退出码：0=通过 1=失败（fail-closed：找不到块标记直接失败，禁止 skip）
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLS_FRONTEND || path.resolve(__dirname, '..');
const REPO = process.env.CLS_REPO || path.resolve(ROOT, '..');
const API_JS = path.join(ROOT, 'js', 'public', 'api.js');

const BEGIN = '// [CLS-LINK-BEGIN]';
const END = '// [CLS-LINK-END]';

const LITERAL_PATTERNS = [
    /classroom\.html\?scheduleId/,
    /classroom-prep\.html\?scheduleId/,
    /replay\.html\?scheduleId/
];

const LITERAL_WHITELIST = [
    [/js[\\/]public[\\/]api\.js$/, '构造器本体'],
    [/shared[\\/]domain[\\/]classroom\.js$/, '唯一权威 URL 格式'],
    [/miniprogram[\\/]/, '小程序消费方'],
    [/js[\\/]shared-domain-bridge\.js$/, 'shared/ 的生成产物，改它没意义'],
    [/js[\\/]classroom[\\/]classroom-prep\.js$/, 'P0 禁区（页面内按钮），P1 收口时解禁'], // TODO(P1)
    [/js[\\/]classroom[\\/]classroom-main\.js$/, 'P0 禁区（App 内回放/站内返回），P3 随页面下线一并删'], // TODO(P3)
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', 'tools']);
const SCAN_EXT = new Set(['.js', '.html', '.mjs']);

const failures = [];
const notes = [];
function fail(file, msg) { failures.push(file + ': ' + msg); }
function note(msg) { notes.push(msg); }

// ------------------------------------------------------------------
// 轻量 tokenizer：跳过注释 / 字符串 / 模板串 / 正则字面量
// ------------------------------------------------------------------
const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'delete', 'void', 'throw', 'do', 'else', 'yield', 'await', 'new']);
const CH_BEFORE_REGEX = new Set(['=', '(', ',', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

function skipString(code, i, to) {
    const q = code[i];
    i++;
    while (i < to) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === q) return i + 1;
        if (ch === '\n') return i + 1;                 // 未闭合：不吞掉后续整文件
        i++;
    }
    return to;
}

function skipTemplate(code, i, to) {
    i++;                                              // 跳过 `
    while (i < to) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') return i + 1;
        if (ch === '$' && code[i + 1] === '{') { i = skipBraced(code, i + 2, to); continue; }
        i++;
    }
    return to;
}

/** 跳过 `${ ... }` 内部（可嵌套字符串/模板/注释/花括号） */
function skipBraced(code, i, to) {
    let depth = 1;
    while (i < to && depth > 0) {
        const ch = code[i], nx = code[i + 1];
        if (ch === '/' && nx === '/') { while (i < to && code[i] !== '\n') i++; continue; }
        if (ch === '/' && nx === '*') { i += 2; while (i < to && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
        if (ch === '"' || ch === "'") { i = skipString(code, i, to); continue; }
        if (ch === '`') { i = skipTemplate(code, i, to); continue; }
        if (ch === '{') { depth++; i++; continue; }
        if (ch === '}') { depth--; i++; continue; }
        i++;
    }
    return i;
}

function skipRegex(code, i, to) {
    i++;                                              // 跳过起始 /
    let inClass = false;
    while (i < to) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') { inClass = true; i++; continue; }
        if (ch === ']') { inClass = false; i++; continue; }
        if (ch === '/' && !inClass) { i++; while (i < to && /[a-z]/i.test(code[i])) i++; return i; }
        if (ch === '\n') return i + 1;
        i++;
    }
    return to;
}

function readWord(code, i, to) {
    let j = i;
    while (j < to && /[A-Za-z0-9_$]/.test(code[j])) j++;
    return { word: code.slice(i, j), end: j };
}

/** 去掉开头的空白与注释（用于判定「块内首个语句」） */
function stripLeadingComments(s) {
    let k = 0;
    for (;;) {
        while (k < s.length && /\s/.test(s[k])) k++;
        if (s[k] === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; continue; }
        if (s[k] === '/' && s[k + 1] === '*') { const e = s.indexOf('*/', k + 2); k = e < 0 ? s.length : e + 2; continue; }
        return s.slice(k);
    }
}

/**
 * 以 from 为「相对深度 0」扫描到 to。
 *   depth        结束时相对深度（{} 与 () 同计）
 *   decls        depth 0 处的声明关键字（会进全局 → 违规）
 *   firstToken   depth 0 处第一个有效 token
 *   hasCallIife  块内是否出现 })(); 形态的 IIFE 收尾
 */
function scanRange(code, from, to) {
    let i = from, depth = 0, prevSig = '', firstToken = '', hasCallIife = false;
    const decls = [];
    while (i < to) {
        const ch = code[i], nx = code[i + 1];
        if (ch === '/' && nx === '/') { while (i < to && code[i] !== '\n') i++; continue; }
        if (ch === '/' && nx === '*') { i += 2; while (i < to && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
        if (ch === '"' || ch === "'") { i = skipString(code, i, to); prevSig = 'STR'; continue; }
        if (ch === '`') { i = skipTemplate(code, i, to); prevSig = 'STR'; continue; }
        if (ch === '/') {
            if (KW_BEFORE_REGEX.has(prevSig) || CH_BEFORE_REGEX.has(prevSig) || prevSig === '') {
                i = skipRegex(code, i, to); prevSig = 'RE'; continue;
            }
            i++; prevSig = '/'; continue;
        }
        if (/\s/.test(ch)) { i++; continue; }
        if (/[A-Za-z_$]/.test(ch)) {
            const r = readWord(code, i, to);
            if (!firstToken) firstToken = r.word;
            if (depth === 0 && (r.word === 'function' || r.word === 'var' || r.word === 'let' || r.word === 'const' || r.word === 'class')) {
                const after = code.slice(r.end, Math.min(r.end + 60, to)).match(/^\s*([A-Za-z_$][\w$]*)/);
                decls.push(r.word + (after ? ' ' + after[1] : ''));
            }
            prevSig = r.word;
            i = r.end;
            continue;
        }
        // 括深度同时计 {} 与 ()：否则 `(function () {` 里的 function 会落在 depth 0 被误判
        if (ch === '{' || ch === '(') { if (!firstToken) firstToken = ch; depth++; prevSig = ch; i++; continue; }
        if (ch === '}') {
            depth--;
            if (/^\}\s*\)\s*\(\s*\)\s*;/.test(code.slice(i, Math.min(i + 8, to)))) hasCallIife = true;
            prevSig = '}'; i++; continue;
        }
        if (ch === ')') { depth--; prevSig = ')'; i++; continue; }
        if (!firstToken) firstToken = ch;
        prevSig = ch; i++;
    }
    return { depth, decls, firstToken, hasCallIife };
}

// ------------------------------------------------------------------
// 检查 1：字面量回潮（先剥注释，避免注释里的示例文案误报）
// ------------------------------------------------------------------
function walk(dir, out) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (SCAN_EXT.has(path.extname(name))) out.push(p);
    }
}

/** 剥注释、保留字符串。★ 必须与 scanRange 同一套正则判据，
 *  否则 /[&<>"']/g 这类正则里的引号会被当成字符串起点，之后整段注释漏剥。 */
function stripComments(code) {
    let out = '', i = 0, prevSig = '';
    const to = code.length;
    while (i < to) {
        const ch = code[i], nx = code[i + 1];
        if (ch === '/' && nx === '/') { while (i < to && code[i] !== '\n') i++; continue; }
        if (ch === '/' && nx === '*') {
            i += 2;
            while (i < to && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') out += '\n'; i++; }
            i += 2; prevSig = 'CMT'; continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            const st = i;
            i = (ch === '`') ? skipTemplate(code, i, to) : skipString(code, i, to);
            out += code.slice(st, i); prevSig = 'STR'; continue;
        }
        if (ch === '/' && (KW_BEFORE_REGEX.has(prevSig) || CH_BEFORE_REGEX.has(prevSig) || prevSig === '')) {
            const st = i;
            i = skipRegex(code, i, to);
            out += code.slice(st, i); prevSig = 'RE'; continue;
        }
        if (!/\s/.test(ch)) prevSig = /[A-Za-z0-9_$]/.test(ch) ? readWord(code, i, to).word : ch;
        out += ch; i++;
    }
    return out;
}

function checkLiterals() {
    const files = [];
    walk(ROOT, files);
    walk(path.join(REPO, 'shared'), files);
    walk(path.join(REPO, 'miniprogram'), files);
    let hits = 0, skipped = 0;
    for (const f of files) {
        const hit = LITERAL_WHITELIST.find(([re]) => re.test(f));
        if (hit) { skipped++; note('白名单跳过：' + path.relative(REPO, f) + '（' + hit[1] + '）'); continue; }
        const src = stripComments(fs.readFileSync(f, 'utf8'));
        src.split('\n').forEach((line, idx) => {
            if (LITERAL_PATTERNS.some(re => re.test(line))) {
                hits++;
                fail(path.relative(REPO, f) + ':' + (idx + 1), '出现课堂页字面量（必须走 window.ClassroomLink）：' + line.trim().slice(0, 100));
            }
        });
    }
    note('字面量扫描：' + files.length + ' 个文件，白名单 ' + skipped + ' 个，命中 ' + hits + ' 处');
}

// ------------------------------------------------------------------
// 检查 2：C12-c —— 块必须整体位于 IIFE 内
// ------------------------------------------------------------------
function checkBlock(target) {
    const file = target || API_JS;
    const rel = path.relative(REPO, file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch (e) { fail(rel, '读取失败：' + e.message); return; }

    const b = src.indexOf(BEGIN), e = src.indexOf(END);
    if (b < 0 || e < 0 || e < b) {
        fail(rel, 'C12-c：缺少 ' + BEGIN + ' / ' + END + ' 块标记（fail-closed：标记缺失即失败，不允许静默跳过）');
        return;
    }
    // 区间从标记行尾开始：标记行本身是注释，行尾的说明文字不能被当成代码扫描
    const markerLineEnd = src.indexOf('\n', b);
    const from = markerLineEnd < 0 ? e : markerLineEnd + 1;
    const block = src.slice(from, e);
    const r = scanRange(src, from, e);

    if (r.depth !== 0) fail(rel, 'C12-c：块首尾括号不平衡，结束时相对深度 = ' + r.depth);
    if (r.decls.length) fail(rel, 'C12-c：块内出现相对深度 0 的声明（会成为全局，可能让整个 api.js 解析期抛错）：' + r.decls.join(', '));
    if (r.firstToken !== '(') fail(rel, 'C12-c：块内首个有效 token 必须是 "("（IIFE 起始），实际为 "' + r.firstToken + '"');
    if (!/^\(\s*function\b/.test(stripLeadingComments(block))) fail(rel, 'C12-c：块内首个语句必须是 (function …)(…)，防止 IIFE 被拆掉后靠"恰好没引入顶层声明"逃过检查');
    if (!r.hasCallIife) fail(rel, 'C12-c：块内未发现 IIFE 收尾 "})();"，可能被拆掉');
    if (block.indexOf('window.ClassroomLink') < 0) fail(rel, 'C12-c：块内没有挂载 window.ClassroomLink，疑似空块或被误删');
}

// ------------------------------------------------------------------
function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose');
    const onlyBlock = args.includes('--block-only');
    const target = args.filter(a => !a.startsWith('--'))[0];
    try {
        if (!onlyBlock) checkLiterals();
        checkBlock(target);
    } catch (err) {
        fail('checker', '内部异常：' + (err && err.message));
    }
    if (verbose || failures.length) notes.forEach(n => console.log('[info] ' + n));
    if (failures.length) {
        console.error('\n[check-classroom-link] 失败 ' + failures.length + ' 项：');
        failures.forEach(f => console.error('  x ' + f));
        process.exit(1);
    }
    console.log('[check-classroom-link] 通过（字面量收敛 + C12-c IIFE 结构）');
}

main();
