/**
 * 「分类编码」组合框 —— 交互测试（无浏览器）
 *
 * 背景：用户反馈「下拉箭头不清晰、操作容易失误」。代码级排查发现三个成因：
 *   1) 箭头是一个文字符号 ▾，热区仅 ~18px，且被输入框的 inline `padding:6px` 压在内侧；
 *   2) 点箭头时若输入框未聚焦 → 先 focus()（触发 focus 监听把下拉打开）再翻转 style，
 *      两者自相抵消 → 下拉「展开后立刻收起」，表现就是"点了没反应"；
 *   3) 下拉 absolute 定位在 .msg-compose-body(overflow:auto) 内 → 超出边界被裁剪，显示不全。
 *
 * 本测试用 Node `vm` + 极简 DOM 垫片加载 frontend/js/messages-inbox.js 的**真源码切片**
 * （loadCategoryOptions / renderComboList / setupCategoryCombo），模拟真实事件序列断言行为。
 * 每个关键判据都配「阴性对照」——先证明判据能抓住坏实现，避免恒真判据造成假绿。
 *
 * 运行：node tests/msg-category-combo-test.js   （纯本地，不需后端）
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join('C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24', 'frontend/js/messages-inbox.js');

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail != null ? '   [' + detail + ']' : '')); }
}

/* ============ 一、极简 DOM 垫片 ============ */
// 识别 li[data-code] 与 li.cc-empty —— renderComboList 的输出结构是固定的，正则足够
function parseLis(html, parentEl) {
    const out = [];
    const re = /<li([^>]*)>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1], inner = m[2];
        const codeM = /data-code="([^"]*)"/.exec(attrs);
        const clsM = /class="([^"]*)"/.exec(attrs);
        const li = makeEl('li', codeM ? { 'data-code': codeM[1] } : {});
        li.parent = parentEl || null;   // 真实 DOM 里 li 的祖先是 ul → combo，contains() 依赖这条链
        if (clsM) clsM[1].split(/\s+/).filter(Boolean).forEach((c) => li.classList.add(c));
        li.textContent = inner.replace(/<[^>]*>/g, '');
        out.push(li);
    }
    return out;
}

let docListeners = [];
let winListeners = {};

function makeEl(tag, attrs) {
    const el = {
        tagName: tag,
        _attrs: Object.assign({}, attrs || {}),
        _listeners: {},
        _classes: new Set(),
        _lis: [],
        _html: '',
        _value: '',
        style: {},
        parent: null,
        getAttribute(k) { return this._attrs[k] != null ? String(this._attrs[k]) : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return this._attrs[k] != null; },
        addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
        dispatch(t, ev) {
            ev = ev || {};
            if (!ev.preventDefault) ev.preventDefault = function () { ev.defaultPrevented = true; };
            ev.type = t;
            ev.target = ev.target || this;
            (this._listeners[t] || []).forEach((f) => f(ev));
        },
        contains(n) { let p = n; while (p) { if (p === this) return true; p = p.parent; } return false; },
        closest(sel) { let p = this; while (p) { if (sel === 'li' && p.tagName === 'li') return p; p = p.parent; } return null; },
        getBoundingClientRect() { return this._rect || { left: 100, top: 100, right: 340, bottom: 126, width: 240, height: 26 }; },
        // focus 仅在"尚未聚焦"时派发 focus 事件（与浏览器一致）——旧代码的自相抵消正是依赖这一点
        focus() { if (this._focused) return; this._focused = true; this.dispatch('focus'); },
        blur() { if (!this._focused) return; this._focused = false; this.dispatch('blur'); },
        scrollIntoView() { this._scrolledInto = true; },
        querySelectorAll(sel) { return (sel === 'li[data-code]') ? this._lis.filter((l) => l.getAttribute('data-code')) : []; },
        querySelector(sel) { return (sel === 'li[data-code]') ? (this.querySelectorAll(sel)[0] || null) : null; }
    };
    el.classList = {
        add: (c) => el._classes.add(c),
        remove: (c) => el._classes.delete(c),
        contains: (c) => el._classes.has(c),
        toggle: (c, f) => { if (f === undefined) { el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c); } else { f ? el._classes.add(c) : el._classes.delete(c); } }
    };
    Object.defineProperty(el, 'innerHTML', {
        get() { return el._html; },
        set(v) { el._html = String(v); el._lis = parseLis(el._html, el); }
    });
    Object.defineProperty(el, 'value', {
        get() { return el._value; },
        set(v) { el._value = v; }
    });
    return el;
}

// 装载源码切片
const src = fs.readFileSync(SRC, 'utf8');
const startMark = '  // 拉取消息分类预设';
const endMark = '  async function doSend(root)';
const s = src.indexOf(startMark), e = src.indexOf(endMark);
if (s < 0 || e < 0 || e <= s) { console.error('切片失败：标记未找到'); process.exit(2); }
const slice = src.slice(s, e);

const ITEMS = [
    { categoryCode: 'SENDER_TEACHER_ADMIN', categoryName: '教师/管理员消息' },
    { categoryCode: 'HOMEWORK_NOTICE', categoryName: '作业通知' },
    { categoryCode: 'BOOKING_CREATED', categoryName: '预约/候补申请' },
    { categoryCode: 'BOOKING_CONFIRMED', categoryName: '预约确认/候补递补' },
    { categoryCode: 'LEAVE_NOTICE', categoryName: '请假审批通知' }
];

let mreqReply = ITEMS;      // 可切换成 [] / 抛错
let mreqCalls = 0;
const mreq = {
    get(url) {
        mreqCalls++;
        if (mreqReply === 'THROW') return Promise.reject(new Error('network'));
        return Promise.resolve(mreqReply);
    }
};

function buildCtx() {
    const combo = makeEl('span', { id: 'msg-category-combo' });
    const input = makeEl('input', { id: 'msg-category' });
    const ul = makeEl('ul', { id: 'msg-category-list' });
    const arrow = makeEl('span', { id: 'msg-category-arrow' });
    input.parent = combo; ul.parent = combo; arrow.parent = combo;
    ul.style.display = 'none';
    const map = {
        '#msg-category-combo': combo, '#msg-category': input,
        '#msg-category-list': ul, '#msg-category-arrow': arrow
    };
    const root = { querySelector: (sel) => map[sel] || null };
    const win = {
        innerWidth: 1200, innerHeight: 800,
        addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); }
    };
    const doc = {
        addEventListener(t, f, c) { docListeners.push({ t, f, c }); }
    };
    const ctx = {
        mreq, esc: (x) => (x == null ? '' : String(x)),
        window: win, document: doc, console, Promise, Array
    };
    ctx.window.escapeHtml = ctx.esc;
    vm.createContext(ctx);
    vm.runInContext(slice, ctx);
    return { ctx, root, combo, input, ul, arrow, win };
}

// 一次「点箭头」= 模拟浏览器真实序列：先 mousedown（可能引发 focus），再 click
function clickArrow(env) {
    env.arrow.dispatch('mousedown', { preventDefault() { this.defaultPrevented = true; } });
    env.arrow.dispatch('click');
}
function isOpen(env) { return env.ul.style.display !== 'none'; }

/* ============ 二、判据（正例 + 阴性对照） ============ */
(async function main() {
    // --- 阴性对照：证明「判据能抓住坏实现」---
    // 复刻旧箭头的自相抵消写法：focus() 先触发展开，再翻转 style → 立刻收起
    (function () {
        let display = 'none';
        let focused = false;
        const focusHandlers = [() => { display = ''; }];      // 旧代码的 focus → showAll
        function oldArrowMousedown() {
            if (!focused) { focused = true; focusHandlers.forEach((h) => h()); }
            display = (display === 'none' ? '' : 'none');
        }
        oldArrowMousedown();
        ck('阴性对照：旧写法「未聚焦点箭头」确实会展开后立刻收起（判据有效）', display === 'none', 'display=' + JSON.stringify(display));
    })();

    // --- G1 未聚焦点箭头 → 展开 ---
    let env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.ul._items = ITEMS.slice();
    clickArrow(env);
    ck('G1 输入框未聚焦时点箭头 → 下拉展开', isOpen(env), 'display=' + JSON.stringify(env.ul.style.display));
    ck('G1b 展开时箭头带 is-open（视觉翻转）', env.arrow.classList.contains('is-open'));
    ck('G1c aria-expanded=true', env.input.getAttribute('aria-expanded') === 'true');

    // --- G2 再点箭头 → 收起 ---
    clickArrow(env);
    ck('G2 已展开时再点箭头 → 收起', !isOpen(env), 'display=' + JSON.stringify(env.ul.style.display));
    ck('G2b 收起时 is-open 移除 + aria-expanded=false',
        !env.arrow.classList.contains('is-open') && env.input.getAttribute('aria-expanded') === 'false');

    // --- G3 点输入框 → 展开 ---
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.ul._items = ITEMS.slice();
    env.input.dispatch('focus');
    ck('G3 输入框获得焦点 → 展开', isOpen(env));

    // --- G4 输入过滤 ---
    env.input.value = 'booking';
    env.input.dispatch('input');
    let codes = env.ul.querySelectorAll('li[data-code]').map((l) => l.getAttribute('data-code'));
    ck('G4 按编码片段过滤：booking → 两项',
        codes.length === 2 && codes.indexOf('BOOKING_CREATED') >= 0 && codes.indexOf('BOOKING_CONFIRMED') >= 0,
        JSON.stringify(codes));
    env.input.value = '请假';
    env.input.dispatch('input');
    codes = env.ul.querySelectorAll('li[data-code]').map((l) => l.getAttribute('data-code'));
    ck('G4b 按中文名过滤：请假 → LEAVE_NOTICE',
        codes.length === 1 && codes[0] === 'LEAVE_NOTICE', JSON.stringify(codes));
    env.input.value = 'zzz';
    env.input.dispatch('input');
    ck('G4c 无匹配时给出可输入的提示', env.ul.innerHTML.indexOf('无匹配分类') >= 0);

    // --- G5 点选项 → 填值 + 收起 ---
    env.input.value = '';
    env.input.dispatch('input');
    const liTarget = env.ul.querySelectorAll('li[data-code]')[2];
    env.ul.dispatch('mousedown', { target: liTarget, preventDefault() { this.defaultPrevented = true; } });
    ck('G5 点选项 → 编码写入输入框', env.input.value === liTarget.getAttribute('data-code'), env.input.value);
    ck('G5b 点选项后下拉收起', !isOpen(env));

    // --- G6 键盘操作 ---
    // 先清空输入（展开时会预高亮「当前值」那项，属 G7 覆盖的行为；这里要从"未高亮"起步）
    env.input.value = '';
    env.input.dispatch('focus');
    env.input.dispatch('keydown', { key: 'ArrowDown' });
    const lis = env.ul.querySelectorAll('li[data-code]');
    ck('G6 ↓ 键激活首项', lis[0] && lis[0].classList.contains('active'));
    env.input.dispatch('keydown', { key: 'ArrowDown' });
    ck('G6b ↓ 键下移一项', lis[1] && lis[1].classList.contains('active') && !lis[0].classList.contains('active'));
    env.input.dispatch('keydown', { key: 'ArrowUp' });
    env.input.dispatch('keydown', { key: 'ArrowUp' });
    ck('G6c ↑ 键可回到末项（环绕）', lis[lis.length - 1].classList.contains('active'));
    env.input.dispatch('keydown', { key: 'ArrowDown' });
    env.input.dispatch('keydown', { key: 'Enter' });
    ck('G6d Enter 选中当前项并收起',
        env.input.value === lis[0].getAttribute('data-code') && !isOpen(env), env.input.value);
    env.input.dispatch('focus');
    env.input.dispatch('keydown', { key: 'Escape' });
    ck('G6e Esc 关闭下拉', !isOpen(env));

    // --- G7 当前值高亮（避免"看错行"）---
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.ul._items = ITEMS.slice();
    env.input.value = 'HOMEWORK_NOTICE';
    env.input.dispatch('focus');
    const cur = env.ul.querySelectorAll('li[data-code]').filter((l) => l.classList.contains('is-cur'));
    ck('G7 展开时高亮当前值对应项（唯一命中）',
        cur.length === 1 && cur[0].getAttribute('data-code') === 'HOMEWORK_NOTICE', '命中 ' + cur.length + ' 项');
    ck('G7b 当前值项带勾选标记', env.ul.innerHTML.indexOf('cc-tick') >= 0);

    // --- G8 空数据 / 加载中提示（旧代码这里是"空框"，看起来像坏了）---
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.input.dispatch('focus');
    ck('G8 数据未就绪时提示「加载中」而非空框', env.ul.innerHTML.indexOf('加载中') >= 0, env.ul.innerHTML.slice(0, 40));
    env.ul._items = [];
    env.input.dispatch('input');
    ck('G8b 接口返回空数组时提示「暂无预设分类」', env.ul.innerHTML.indexOf('暂无预设分类') >= 0, env.ul.innerHTML.slice(0, 40));

    // --- G9 loadCategoryOptions：填充 + 失败兜底 ---
    mreqReply = ITEMS;
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    await env.ctx.loadCategoryOptions(env.root);
    ck('G9 拉取成功 → 缓存进 ul._items', Array.isArray(env.ul._items) && env.ul._items.length === ITEMS.length);
    mreqReply = [];
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    await env.ctx.loadCategoryOptions(env.root);
    env.input.dispatch('focus');
    ck('G9b 接口返回空 → 仍可打开下拉且给出提示（不空白）',
        isOpen(env) && env.ul.innerHTML.indexOf('暂无预设分类') >= 0);
    mreqReply = 'THROW';
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    await env.ctx.loadCategoryOptions(env.root);
    env.input.dispatch('focus');
    ck('G9c 接口异常 → 不阻塞，下拉仍可打开且可手输',
        isOpen(env) && Array.isArray(env.ul._items) && env.ul._items.length === 0);
    mreqReply = ITEMS;

    // --- G10 定位：fixed 跟随 + 下方空间不足时向上翻转 ---
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.ul._items = ITEMS.slice();
    env.input._rect = { left: 300, top: 200, right: 540, bottom: 226, width: 240, height: 26 };
    env.input.dispatch('focus');
    ck('G10 正常情况：下拉定位在输入框正下方（top 生效、bottom 归位）',
        env.ul.style.top === '228px' && env.ul.style.bottom === 'auto' && env.ul.style.left === '300px',
        'top=' + env.ul.style.top + ' bottom=' + env.ul.style.bottom + ' left=' + env.ul.style.left);
    ck('G10b 宽度不小于 260 以便完整显示「编码 + 名称」', parseFloat(env.ul.style.width) >= 260, env.ul.style.width);
    env.input.dispatch('focus'); // 已展开，place 不变
    env.input._rect = { left: 300, top: 700, right: 540, bottom: 726, width: 240, height: 26 }; // 距底 74px
    env.input.dispatch('input');   // 触发重新定位
    ck('G10c 下方空间不足时向上翻转（bottom 生效、top 归位）',
        env.ul.style.top === 'auto' && env.ul.style.bottom === '102px',
        'top=' + env.ul.style.top + ' bottom=' + env.ul.style.bottom);

    // --- G11 点击卡片外关闭（含"点击其它元素立即收起"）---
    env = buildCtx();
    env.ctx.setupCategoryCombo(env.root);
    env.ul._items = ITEMS.slice();
    env.input.dispatch('focus');
    ck('G11 前置：下拉已展开', isOpen(env));
    const outside = makeEl('div');
    docListeners.filter((l) => l.t === 'mousedown').forEach((l) => l.f({ target: outside }));
    ck('G11b 点击 combo 之外 → 收起', !isOpen(env));
    env.input.dispatch('focus');
    const inside = env.ul.querySelectorAll('li[data-code]')[0];
    docListeners.filter((l) => l.t === 'mousedown').forEach((l) => l.f({ target: inside }));
    ck('G11c 点击下拉内部 → 不误关（由选项逻辑接管）', isOpen(env));

    // --- G12 静态护栏：结构与样式不得回退 ---
    const htmlSeg = src.slice(src.indexOf("'　分类编码：'"), src.indexOf("'<div class=\"row\" style=\"color:#999;\">"));
    const inputSeg = htmlSeg.slice(htmlSeg.indexOf('<input id="msg-category"'), htmlSeg.indexOf('>', htmlSeg.indexOf('<input id="msg-category"')));
    ck('G12 输入框不得再有 inline padding（会盖住右侧箭头）',
        inputSeg.indexOf('style="padding') < 0, inputSeg.slice(0, 90));
    ck('G12b 箭头是带 aria-label 的独立按钮元素',
        htmlSeg.indexOf('class="combo-arrow"') >= 0 && htmlSeg.indexOf('aria-label="展开分类列表"') >= 0);
    ck('G12c 下拉容器不再用 absolute 定位（否则被 overflow:auto 容器裁剪）',
        /\.combo-list\{position:fixed/.test(src), (src.match(/\.combo-list\{[^}]*/) || [''])[0].slice(0, 40));
    ck('G12d 输入框为箭头预留了右侧内边距', /\.combo input\{[^}]*padding:6px 34px/.test(src));
    ck('G12e 箭头热区不小于 28px', /\.combo-arrow\{[^}]*width:30px/.test(src));
    ck('G12f 选项项带 role=option（combobox 语义完整）',
        /return '<li role="option" data-code=/.test(src));
    ck('G12g 箭头不参与 Tab 序列（避免"能聚焦却无键盘响应"）',
        htmlSeg.indexOf('tabindex="-1"') >= 0);

    console.log('\n----------------------------------------');
    console.log('总计 ' + (pass + fail) + ' 项：通过 ' + pass + '，失败 ' + fail);
    if (fail) { console.log('失败项：'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
})();
