/**
 * <title> 术语化集成检查（真实代码 + mock 浏览器）
 *
 * 覆盖：js/public/terms.js（TERM_DICT 真实词表）+ js/public/documentTitle.js（真实渲染逻辑）
 * 关注点：浏览器标签页标题是否随行业 / 服务端词表 / 租户品牌正确刷新，且不与页内 #brand-title 打架。
 *
 * 用法： node doc-develop/itest_document_title.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FRONTEND = path.resolve(__dirname, '../frontend');
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log('              PASS  ' + name); }
  else { fail++; fails.push(name); console.log('              FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

/** 造一个最小浏览器环境，加载真实脚本 */
function makeEnv({ htmlTitle, termTitle, industry, serverMap, brandEl }) {
  const store = Object.assign({ industry: industry || 'education' }, {});
  const titleEl = { tagName: 'TITLE', textContent: htmlTitle, attrs: {} };
  if (termTitle) titleEl.attrs['data-term-title'] = termTitle;
  titleEl.getAttribute = (k) => (k in titleEl.attrs ? titleEl.attrs[k] : null);
  titleEl.setAttribute = (k, v) => { titleEl.attrs[k] = v; };

  let brand = null;
  if (brandEl) {
    brand = { textContent: brandEl.text || '', attrs: Object.assign({}, brandEl.attrs || {}) };
    brand.getAttribute = (k) => (k in brand.attrs ? brand.attrs[k] : null);
    brand.setAttribute = (k, v) => { brand.attrs[k] = v; };
  }

  const doc = {
    title: htmlTitle,
    querySelector: (sel) => (sel === 'title' ? titleEl : null),
    getElementById: (id) => (id === 'brand-title' ? brand : null),
    addEventListener: () => {},
  };
  const sandbox = {
    console,
    document: doc,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    addEventListener: () => {},
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'js/public/terms.js'), 'utf8'), ctx);
  // 模拟 termsFunction.js 的 getTerms()：本地行业词 + 服务端合并词
  vm.runInContext(
    'window.getTerms = function () {' +
    '  var base = TERM_DICT[localStorage.getItem("industry") || "education"] || TERM_DICT.education;' +
    '  var s = window.__SERVER_MAP__;' +
    '  return s ? Object.assign({}, base, s) : base;' +
    '};',
    ctx
  );
  if (serverMap) sandbox.__SERVER_MAP__ = serverMap;
  vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'js/public/documentTitle.js'), 'utf8'), ctx);
  // 脚本内注册了 DOMContentLoaded/load 监听（mock 为 no-op），这里手动触发
  return { ctx, sandbox, doc, titleEl, brand, apply: (opts) => sandbox.window.applyDocumentTitle(opts) };
}

(async () => {
  console.log('\n=== A. 模板渲染（<title data-term-title="{lessonSystem} - 管理端">）===');
  {
    let e = makeEnv({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'education' });
    check('A1 education 默认：锚点词', e.apply() === '语言教学预约系统 - 管理端', e.doc.title);

    e = makeEnv({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'legal' });
    check('A2 legal：标题随行业切换', e.apply() === '法律咨询预约系统 - 管理端', e.doc.title);

    e = makeEnv({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'counseling' });
    check('A3 counseling：心理咨询预约系统', e.apply() === '心理咨询预约系统 - 管理端', e.doc.title);

    e = makeEnv({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'exercise' });
    check('A4 exercise：健身教练预约系统', e.apply() === '健身教练预约系统 - 管理端', e.doc.title);
  }

  console.log('\n=== B. 旧页面兜底（无 data-term-title，标题里直接写锚点词）===');
  {
    let e = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'legal' });
    check('B1 无模板时仍能替换锚点词', e.apply() === '法律咨询预约系统 - 学生端', e.doc.title);

    e = makeEnv({ htmlTitle: '审计日志 - 语言教学预约系统', industry: 'counseling' });
    check('B2 锚点词在尾部也能替换', e.apply() === '审计日志 - 心理咨询预约系统', e.doc.title);

    e = makeEnv({ htmlTitle: '预约入口', industry: 'legal' });
    check('B3 标题不含锚点词时保持原样', e.apply() === '预约入口', e.doc.title);
  }

  console.log('\n=== C. 服务端合并词优先（租户词 > 行业词 > 平台词，由后端合并后下发）===');
  {
    const e = makeEnv({
      htmlTitle: '语言教学预约系统 - 平台管理端',
      termTitle: '{lessonSystem} - 平台管理端',
      industry: 'legal',
      serverMap: { lessonSystem: '某某律所咨询系统' },
    });
    check('C1 服务端词覆盖行业词', e.apply() === '某某律所咨询系统 - 平台管理端', e.doc.title);
  }

  console.log('\n=== D. 未知 key 不得出现 undefined ===');
  {
    const e = makeEnv({ htmlTitle: 'x', termTitle: '{lessonSystem} - {notAKey}', industry: 'education' });
    check('D1 缺失词保留占位符而非 undefined', e.apply() === '语言教学预约系统 - {notAKey}', e.doc.title);
  }

  console.log('\n=== E. 租户品牌（URL 带 tCode → 机构名）===');
  {
    const e = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', termTitle: '{lessonSystem} - 学生端', industry: 'legal' });
    e.apply();
    const r = e.apply({ brand: '启明律所预约系统' });
    check('E1 品牌覆盖行业系统名', r === '启明律所预约系统 - 学生端', r);

    e.doc.title = '语言教学预约系统 - 学生端'; // 模拟换页重来
    check('E2 品牌记忆：再次调用仍为品牌', e.apply() === '启明律所预约系统 - 学生端', e.doc.title);

    const e2 = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'legal' });
    e2.apply({ brand: '启明律所预约系统' });
    check('E3 无模板页面也支持品牌', e2.doc.title === '启明律所预约系统 - 学生端', e2.doc.title);
  }

  console.log('\n=== F. 页内 #brand-title 同步与冲突 ===');
  {
    // F1：没有 data-term 的 brand-title（student/teacher.html）→ 同步为行业词
    let e = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'legal', brandEl: { text: '语言教学预约系统' } });
    e.apply();
    check('F1 无 data-term 的 brand-title 同步行业词', e.brand.textContent === '法律咨询预约系统', e.brand.textContent);

    // F2：有 data-term 的（admin/index.html）→ 交给 applyTerms，本模块不改
    e = makeEnv({ htmlTitle: '语言教学预约系统 - 管理端', industry: 'legal', brandEl: { text: '语言教学预约系统', attrs: { 'data-term': 'lessonSystem' } } });
    e.apply();
    check('F2 有 data-term 的 brand-title 不被本模块覆盖', e.brand.textContent === '语言教学预约系统', e.brand.textContent);

    // F3：已被租户品牌改写的（data-tenant-brand 标记）→ 不被行业词/后续调用覆盖回去
    e = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'legal', brandEl: { text: '启明律所预约系统', attrs: { 'data-tenant-brand': '1' } } });
    e.apply();
    check('F3 品牌元素带标记后不被行业词回写', e.brand.textContent === '启明律所预约系统', e.brand.textContent);

    // F4：brand-title 与 title 同时为品牌
    e = makeEnv({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'legal', brandEl: { text: '语言教学预约系统' } });
    e.apply({ brand: '启明律所预约系统' });
    check('F4 品牌同时作用于 title 与 brand-title',
      e.doc.title === '启明律所预约系统 - 学生端' && e.brand.textContent === '启明律所预约系统',
      e.doc.title + ' | ' + e.brand.textContent);
  }

  console.log('\n=== G. 幂等与健壮性 ===');
  {
    const e = makeEnv({ htmlTitle: '语言教学预约系统 - 教师端', termTitle: '{lessonSystem} - 教师端', industry: 'counseling' });
    const a = e.apply(); const b = e.apply(); const c = e.apply();
    check('G1 重复调用结果稳定', a === b && b === c && c === '心理咨询预约系统 - 教师端', [a, b, c].join(' / '));

    const e2 = makeEnv({ htmlTitle: '', termTitle: null, industry: 'education' });
    let ok = true, out = '';
    try { out = e2.apply(); } catch (err) { ok = false; out = err.message; }
    check('G2 空标题不抛异常', ok, out);

    const e3 = makeEnv({ htmlTitle: '语言教学预约系统', industry: 'no_such_industry' });
    let ok3 = true, out3 = '';
    try { out3 = e3.apply(); } catch (err) { ok3 = false; out3 = err.message; }
    check('G3 未知行业回落 education 词表', ok3 && out3 === '语言教学预约系统', out3);
  }

  console.log('\n=== H. 真实链路：按页面顺序加载三个脚本并触发 DOMContentLoaded ===');
  {
    function bootPage({ htmlTitle, termTitle, industry }) {
      const store = { industry: industry || 'education' };   // 无 token → 不拉 /term/map；无 tCode → 不改品牌
      const titleEl = { textContent: htmlTitle, attrs: {} };
      if (termTitle) titleEl.attrs['data-term-title'] = termTitle;
      titleEl.getAttribute = (k) => (k in titleEl.attrs ? titleEl.attrs[k] : null);
      titleEl.setAttribute = (k, v) => { titleEl.attrs[k] = v; };
      const brandEl = { textContent: '语言教学预约系统', attrs: {} };
      brandEl.getAttribute = (k) => (k in brandEl.attrs ? brandEl.attrs[k] : null);
      brandEl.setAttribute = (k, v) => { brandEl.attrs[k] = v; };

      const listeners = {};
      const doc = {
        title: htmlTitle,
        querySelector: (s) => (s === 'title' ? titleEl : null),
        getElementById: (id) => (id === 'brand-title' ? brandEl : null),
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        body: { querySelectorAll: () => [] },
        head: { appendChild: () => {} },
        createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] }),
      };
      const sandbox = {
        console,
        URLSearchParams,                     // termsFunction.js 的 getTenantCodeParam 依赖
        document: doc,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
        location: { search: '', pathname: '/admin.html', href: 'http://x/admin.html', origin: 'http://x' },
        addEventListener: () => {},
      };
      sandbox.window = sandbox;
      const ctx = vm.createContext(sandbox);
      for (const f of ['js/public/terms.js', 'js/public/termsFunction.js', 'js/public/documentTitle.js']) {
        vm.runInContext(fs.readFileSync(path.join(FRONTEND, f), 'utf8'), ctx);
      }
      vm.runInContext('window.injectLangSwitch = function () {};', ctx);  // 语言下拉与本用例无关，置空
      let err = null;
      try { (listeners['DOMContentLoaded'] || []).forEach((fn) => fn()); }
      catch (e) { err = e; }
      return { doc, brandEl, err, sandbox };
    }

    let r = bootPage({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'education' });
    check('H1 真实链路无异常', !r.err, r.err && r.err.message);
    check('H2 education 标题不变', r.doc.title === '语言教学预约系统 - 管理端', r.doc.title);

    r = bootPage({ htmlTitle: '语言教学预约系统 - 管理端', termTitle: '{lessonSystem} - 管理端', industry: 'legal' });
    check('H3 legal：DOMContentLoaded 自动刷新标题', r.doc.title === '法律咨询预约系统 - 管理端', r.doc.title);

    r = bootPage({ htmlTitle: '语言教学预约系统 - 学生端', industry: 'counseling' });
    check('H4 旧页面（无模板）走兜底也一样生效', r.doc.title === '心理咨询预约系统 - 学生端', r.doc.title);
  }

  console.log('\n=========================== 汇总 ===========================');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fails.length) { console.log('失败项：'); fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); process.exit(1); }
})();
