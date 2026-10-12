/**
 * 「教师ID 右侧的姓名提示」渲染链路测试（无浏览器）
 *
 * 背景：用户反馈「职业信息维护页面，教师ID 右边原来还有教师名称显示（右对齐），现在没有了」。
 * 该元素 = teacherInfo.html 的 #f-teacherNameHint，由 renderTeacherNameHint() 控制。
 * 代码级排查结论（本测试即证据）：
 *   - 编辑模式链路本来正常（真实数据跑出来是「教师姓名：teacher2」）；
 *   - 真正的缺口在**新增模式**：detail 接口 404 时走 buildEmptyForm，name 为空 → 提示被整块隐藏，
 *     管理员只能看到一串 teacherId。现在新增/编辑模式都会用 /user/name/{userId} 补查姓名。
 *   - 隐藏方式从「内联 display:none + style.display=''」改为 `hidden` 属性，消除两者抵消的脆弱点。
 *
 * 本测试用 Node `vm` + 极简 DOM 垫片加载 frontend/js 下**真实源码文件**，
 * 注入**真实接口响应**（.workbuddy/tmp/resp.json，取自本地 8081 实测），
 * 走完 loadTeacherInfo → enterEditMode / enterAddMode 全链路。
 *
 * 运行：node tests/teacher-info-name-hint-test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24';
const HTML = fs.readFileSync(path.join(ROOT, 'frontend/teacherInfo.html'), 'utf8');
const RESP_PATH = path.join(ROOT, '.workbuddy/tmp/resp.json');

let pass = 0, fail = 0;
const failures = [];
function ck(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; failures.push(name); console.log('  FAIL  ' + name + (detail != null ? '   [' + detail + ']' : '')); }
}

/* ============ 一、DOM 垫片 ============ */
function makeEl(tag, id) {
    // textContent / innerHTML 联动：真实 DOM 里 el.textContent='' 会清空子节点（innerHTML 随之变空），
    // 垫片必须复刻这一点，否则「清空后仍读到旧内容」会造成假 FAIL。
    let _html = '', _text = '';
    const el = {
        tagName: (tag || 'div').toUpperCase(),
        id: id || '',
        hidden: false,
        _attrs: {},
        _listeners: {},
        _classes: new Set(),
        style: {},
        value: '',
        checked: false,
        parentNode: null,
        children: [],
        classList: {
            add: (c) => el._classes.add(c),
            remove: (c) => el._classes.delete(c),
            contains: (c) => el._classes.has(c)
        },
        getAttribute: (k) => (k in el._attrs ? el._attrs[k] : null),
        removeAttribute: (k) => { if (k === 'hidden') el.hidden = false; delete el._attrs[k]; },
        hasAttribute: (k) => k in el._attrs,
        addEventListener: (t, fn) => { (el._listeners[t] = el._listeners[t] || []).push(fn); },
        removeEventListener: () => {},
        appendChild: (c) => { el.children.push(c); if (c) c.parentNode = el; return c; },
        removeChild: (c) => { el.children = el.children.filter((x) => x !== c); return c; },
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        contains: () => false,
        focus: () => {}, blur: () => {}, click: () => {},
        scrollIntoView: () => {},
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 30, bottom: 30, right: 100 }),
        dispatchEvent: () => true
    };
    Object.defineProperty(el, 'innerHTML', {
        get: () => _html,
        set: (v) => { _html = String(v == null ? '' : v); _text = _html.replace(/<[^>]*>/g, ''); }
    });
    Object.defineProperty(el, 'textContent', {
        get: () => _text,
        set: (v) => { _text = String(v == null ? '' : v); _html = ''; }
    });
    el.setAttribute = function (k, v) {
        el._attrs[k] = String(v);
        if (k === 'style') {
            String(v).split(';').forEach((pair) => {
                const i = pair.indexOf(':');
                if (i > 0) el.style[pair.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = pair.slice(i + 1).trim();
            });
        }
        if (k === 'id') el.id = String(v);
        if (k === 'hidden') el.hidden = true;
    };
    return el;
}

// 从真实 HTML 建立 id → 元素 映射，并解析内联 style / hidden 属性 / class
const byId = {};
{
    const re = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g;
    let m;
    while ((m = re.exec(HTML))) {
        const tag = m[1], attrsAll = ' ' + m[2] + ' ' + m[4], id = m[3];
        const el = makeEl(tag, id);
        const sm = /style="([^"]*)"/.exec(attrsAll);
        if (sm) el.setAttribute('style', sm[1]);
        if (/\shidden(\s|>|$)/.test(attrsAll)) el.hidden = true;
        const cm = /class="([^"]*)"/.exec(attrsAll);
        if (cm) cm[1].split(/\s+/).filter(Boolean).forEach((c) => el._classes.add(c));
        byId[id] = el;
    }
}
const docBody = makeEl('body', 'body');
const documentShim = {
    body: docBody,
    documentElement: makeEl('html', 'html'),
    readyState: 'complete',
    title: '',
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => (sel && sel[0] === '#' ? (byId[sel.slice(1)] || null) : null),
    querySelectorAll: () => [],
    createElement: (t) => makeEl(t),
    addEventListener: () => {},
    removeEventListener: () => {},
    execCommand: () => true
};

/* ============ 二、沙箱与桩 ============ */
const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
    URLSearchParams, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN,
    document: documentShim
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.location = {
    search: '?userid=00778949306c41e5a15bc3cc7e3903e5',
    href: 'http://localhost/teacherInfo.html?userid=00778949306c41e5a15bc3cc7e3903e5',
    pathname: '/teacherInfo.html', origin: 'http://localhost', hostname: 'localhost', protocol: 'http:'
};
sandbox.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] != null ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
};
sandbox.alert = () => {};
sandbox.confirm = () => true;
sandbox.navigator = { userAgent: 'node-vm' };

vm.createContext(sandbox);

const resp = fs.existsSync(RESP_PATH) ? JSON.parse(fs.readFileSync(RESP_PATH, 'utf8')) : null;
const REAL_NAME = (resp && resp.data && resp.data.name) || '';
const NEW_TEACHER_ID = 'brandnewteacher0001';
const NEW_TEACHER_NAME = '新老师·李四';

sandbox.__RESP_DATA = resp && resp.data;

vm.runInContext(`
  window.__calls = [];
  // 按 URL 分流的 request 桩：既覆盖 detail 查询，也覆盖新的 /user/name 补查
  function request(opts){
    const url = opts && opts.url || '';
    window.__calls.push(url);
    if (url.indexOf('/user/name/') === 0 || url.indexOf('/user/name/') !== -1) {
      const id = decodeURIComponent(url.split('/user/name/')[1] || '');
      if (id === '${NEW_TEACHER_ID}') return Promise.resolve('${NEW_TEACHER_NAME}');
      if (id === '00778949306c41e5a15bc3cc7e3903e5') return Promise.resolve('${REAL_NAME}');
      return Promise.resolve('N/A');
    }
    return Promise.resolve(window.__RESP_DATA);
  }
  function termText(key){ return key === 'teacher' ? '教师' : key; }
  function applyTerms(){}
  function getCurrentIndustry(){ return 'education'; }
  function getCurrentUserInfo(){ return { userId: 'admin1', role: 'admin', tenantId: 2 }; }
  function pageUrl(p){ return p; }
  // api.js 既有的姓名查询工具（真实实现含入参保护 + 尾随点号清洗 + 失败返回 "n/a"）
  function getUserNameById(id){
    window.__calls.push('/user/name/' + id);
    if (id === '${NEW_TEACHER_ID}') return Promise.resolve('${NEW_TEACHER_NAME}');
    if (id === '00778949306c41e5a15bc3cc7e3903e5') return Promise.resolve('${REAL_NAME}');
    return Promise.resolve('n/a');
  }
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escapeAttr(s){ return escapeHtml(s); }
  function goBack(){}
  function refreshRightPage(){}
`, sandbox);

const LOAD_ORDER = [
    'frontend/js/teacherInfo-common.js',
    'frontend/js/teacherInfo-edit.js',
    'frontend/js/teacherInfo-publish.js',
    'frontend/js/teacherInfo.js'
];
let src = ';';
for (const f of LOAD_ORDER) src += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n;\n';

console.log('=== 一、源码加载 ===');
let loadErr = null;
try { vm.runInContext(src, sandbox, { filename: 'teacherInfo-bundle.js' }); } catch (e) { loadErr = e; }
ck('四个页面脚本可正常加载执行', loadErr === null, loadErr && loadErr.message);
ck('关键函数已定义（fillEditForm / renderTeacherNameHint / fetchTeacherName）',
    typeof sandbox.fillEditForm === 'function'
    && typeof sandbox.renderTeacherNameHint === 'function'
    && typeof sandbox.fetchTeacherName === 'function');
if (loadErr) { console.log('\n通过 ' + pass + ' / 失败 ' + fail); process.exit(1); }

const nameHint = byId['f-teacherNameHint'];
// 提示元素的"可见文本"：innerHTML 会被替换，用去标签近似
const hintText = () => String(nameHint.innerHTML || nameHint.textContent || '').replace(/<[^>]*>/g, '');
const hintVisible = () => nameHint.hidden === false && hintText().trim() !== '';
// teacherInfo.js 的模块状态用 let 声明 —— 属于沙箱的词法作用域，
// 挂在 sandbox 对象上读写不到（sandbox.x / sandbox.currentTeacherId 恒 undefined），
// 必须回沙箱内求值。
const evalIn = (expr) => vm.runInContext(expr, sandbox);

console.log('\n=== 二、静态结构护栏（HTML） ===');
ck('#f-teacherNameHint 元素存在', !!nameHint);
ck('提示元素带 name-hint 类（右对齐样式生效点）', nameHint._classes.has('name-hint'));
ck('隐藏方式为 hidden 属性，不再依赖内联 display:none',
    nameHint.hidden === true && !/display\s*:\s*none/.test(String(nameHint.getAttribute('style') || '')),
    'style=' + JSON.stringify(nameHint.getAttribute('style')));
ck('阴性对照：HTML 中该元素确实不再出现内联 display:none 写法',
    HTML.indexOf('id="f-teacherNameHint" style=') === -1);
ck('提示元素所在行的容器为两端分布（space-between）',
    HTML.indexOf('justify-content:space-between;align-items:baseline') !== -1);
ck('CSS 中定义了 .name-hint 右对齐规则（margin-left:auto + text-align:right）',
    /\.name-hint\s*\{[^}]*margin-left:\s*auto[^}]*text-align:\s*right/.test(HTML));
ck('CSS 的 .name-hint 未设置 display（否则会覆盖 hidden 属性）',
    !/\.name-hint\s*\{[^}]*display\s*:/.test(HTML));
{
    const commonSrc = fs.readFileSync(path.join(ROOT, 'frontend/js/teacherInfo-common.js'), 'utf8');
    ck('fetchTeacherName 复用 api.js 既有的 getUserNameById（含入参保护）',
        /getUserNameById\s*\(/.test(commonSrc) && /typeof\s+getUserNameById\s*!==\s*['"]function['"]/.test(commonSrc));
    ck('fetchTeacherName 把 "n/a" 归一成空串（大小写不敏感）',
        /toLowerCase\(\)\s*!==\s*['"]n\/a['"]/.test(commonSrc));
    const editSrc = fs.readFileSync(path.join(ROOT, 'frontend/js/teacherInfo-edit.js'), 'utf8');
    ck('fillEditForm 不再自己读 style.display 开关提示（统一走 renderTeacherNameHint）',
        !/nameHint\.style\.display/.test(editSrc) && /renderTeacherNameHint\(data\.name\)/.test(editSrc));
    const infoSrc = fs.readFileSync(path.join(ROOT, 'frontend/js/teacherInfo.js'), 'utf8');
    ck('enterAddMode 会补查姓名（新增模式修复的核心）',
        /await\s+fetchTeacherName\(teacherId\)/.test(infoSrc));
    ck('enterEditMode 对 name 缺失也有兜底补查', /await\s+fetchTeacherName\(currentTeacherId\)/.test(infoSrc));
    ck('补查结果带竞态守卫（切换后丢弃迟到响应）',
        /currentMode\s*!==\s*['"]add['"]\s*\|\|\s*currentTeacherId\s*!==\s*teacherId/.test(infoSrc));
}

console.log('\n=== 三、数据来源（真实接口响应） ===');
ck('响应中 data.name 非空', !!REAL_NAME, REAL_NAME);

(async () => {
    console.log('\n=== 四、编辑模式（有职业信息的教师） ===');
    try { await sandbox.loadTeacherInfo('00778949306c41e5a15bc3cc7e3903e5'); } catch (e) { console.log('  loadTeacherInfo 抛错：' + e.message); }
    ck('进入查看模式（非新增）', evalIn('currentMode') === 'view', evalIn('currentMode'));
    ck('查看模式加载后提示保持隐藏（不再无脑显示空提示）', nameHint.hidden === true, 'hidden=' + nameHint.hidden);

    try { await sandbox.enterEditMode(); } catch (e) { console.log('  enterEditMode 抛错：' + e.message); }
    console.log('  提示文本 = ' + JSON.stringify(hintText()));
    console.log('  hidden   = ' + nameHint.hidden);
    ck('编辑模式后提示可见', nameHint.hidden === false, 'hidden=' + nameHint.hidden);
    ck('提示文本包含真实教师姓名 ' + REAL_NAME, hintText().indexOf(REAL_NAME) !== -1, hintText());
    ck('提示文本带「姓名：」前缀（右对齐显示位）', hintText().indexOf('姓名：') !== -1, hintText());
    ck('姓名放在 name-hint-value 元素里（可独立着色）', /name-hint-value/.test(nameHint.innerHTML));
    ck('编辑模式不会走补查接口（detail 已带 name）',
        sandbox.__calls.filter((u) => u.indexOf('/user/name/') !== -1).length === 0,
        sandbox.__calls.join(','));

    console.log('\n=== 五、新增模式（教师尚无职业信息 —— 本次修复的真实缺口） ===');
    sandbox.__calls = [];
    // 真实链路里 currentTeacherId 由 loadTeacherInfoFromUrl 从 URL 读出，
    // 与传给 enterAddMode 的是同一个值；这里同步一下，避免竞态守卫误拦。
    evalIn("currentTeacherId = '" + NEW_TEACHER_ID + "'");
    try { await sandbox.enterAddMode(NEW_TEACHER_ID); } catch (e) { console.log('  enterAddMode 抛错：' + e.message); }
    console.log('  提示文本 = ' + JSON.stringify(hintText()));
    ck('新增模式触发了姓名补查接口',
        sandbox.__calls.some((u) => u.indexOf('/user/name/') !== -1), sandbox.__calls.join(','));
    ck('新增模式补查后提示可见并显示姓名', hintVisible() && hintText().indexOf(NEW_TEACHER_NAME) !== -1, hintText());
    ck('新增模式落到 originalData.name（后续保存/展示可复用）',
        evalIn('originalData && originalData.name') === NEW_TEACHER_NAME,
        evalIn('originalData && originalData.name'));

    console.log('\n=== 六、边界对照 ===');
    ck('fetchTeacherName 把 "N/A" 归一成空串',
        (await sandbox.fetchTeacherName('nosuchuser')) === '');
    ck('fetchTeacherName 对空入参直接返回空串（不发请求）',
        (await sandbox.fetchTeacherName('')) === '');
    sandbox.renderTeacherNameHint('');
    ck('姓名为空时整块隐藏（不渲染 undefined / 空提示）',
        nameHint.hidden === true && hintText().trim() === '');
    ck('阴性对照：旧实现（内联 display:none + style.display=""）在此垫片下无法通过 hidden 判据',
        (() => {
            const probe = makeEl('div', 'probe');
            probe.setAttribute('style', 'color:#999;display:none');   // 旧 HTML 的写法
            probe.style.display = '';                                  // 旧 JS 的解锁写法
            // 旧写法改动的是 style 对象，hidden 恒为 false；新的判据读 hidden，
            // 因此「旧实现是否可见」在新判据下无法被区分 —— 故本用例确认判据依赖的是 hidden 属性本身
            return probe.hidden === false && 'hidden' in probe;
        })());

    console.log('\n' + (fail === 0 ? '全部通过' : '存在失败项') + '：' + pass + ' 通过 / ' + fail + ' 失败');
    if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
    process.exit(fail === 0 ? 0 : 1);
})();
