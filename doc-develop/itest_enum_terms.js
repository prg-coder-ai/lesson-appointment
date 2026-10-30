/**
 * 枚举字段行业词显示集成检查（真实代码 + mock 浏览器）
 *
 * 覆盖：js/public/terms.js（TERM_DICT 真实词表）+ js/public/enumTerms.js（唯一权威映射）
 *      + 各消费方（admin-template / admin-course / admin-schedule / student-bookingCards
 *        / datamaintain_delete / admin-dataMaintainPage）的静态引用检查
 *
 * 关注点：
 *   1. 列表/下拉/拼接文本是否都能把 code（english）正确显示成行业词（legal: 劳动）
 *   2. admin-template.js 曾经的 code↔序号颠倒是否修好（english 必须 → classType2）
 *   3. 脏数据（'English' / '英语' / 未知 code）不丢数据、不出 undefined
 *
 * 用法： node doc-develop/itest_enum_terms.js
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

/** 加载真实 terms.js + enumTerms.js，可注入服务端合并词 */
function makeEnv(industry, serverMap) {
  const store = { industry: industry || 'education' };
  const sandbox = {
    console,
    document: { querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null },
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
  vm.runInContext(fs.readFileSync(path.join(FRONTEND, 'js/public/enumTerms.js'), 'utf8'), ctx);
  // 词法声明（const TERM_DICT / TERM_KEYS）不会挂到 sandbox 上，需要按表达式取
  sandbox.__run = (code) => vm.runInContext(code, ctx);
  return sandbox;
}

const read = (p) => fs.readFileSync(path.join(FRONTEND, p), 'utf8');

(async () => {
  console.log('\n=== A. courseTypeText：code → 行业词 ===');
  {
    const e = makeEnv('education');
    check('A1 education french→法语', e.courseTypeText('french') === '法语', e.courseTypeText('french'));
    check('A2 education english→英语', e.courseTypeText('english') === '英语', e.courseTypeText('english'));
    check('A3 education chinese→汉语', e.courseTypeText('chinese') === '汉语', e.courseTypeText('chinese'));
    check('A4 education spanish→西语', e.courseTypeText('spanish') === '西语', e.courseTypeText('spanish'));

    const l = makeEnv('legal');
    check('A5 legal english→劳动（不是 English）', l.courseTypeText('english') === '劳动', l.courseTypeText('english'));
    check('A6 legal french→婚姻', l.courseTypeText('french') === '婚姻', l.courseTypeText('french'));
    check('A7 legal chinese→刑事', l.courseTypeText('chinese') === '刑事', l.courseTypeText('chinese'));
    check('A8 legal spanish→行政', l.courseTypeText('spanish') === '行政', l.courseTypeText('spanish'));

    const c = makeEnv('counseling');
    check('A9 counseling english→情感', c.courseTypeText('english') === '情感', c.courseTypeText('english'));
    const x = makeEnv('exercise');
    check('A10 exercise english→灵巧训练', x.courseTypeText('english') === '灵巧训练', x.courseTypeText('english'));
  }

  console.log('\n=== B. 脏数据 / 边界（绝不丢数据、不出 undefined）===');
  {
    const l = makeEnv('legal');
    check('B1 首字母大写 English → 劳动', l.courseTypeText('English') === '劳动', l.courseTypeText('English'));
    check('B2 前后空格 " english " → 劳动', l.courseTypeText('  english  ') === '劳动', l.courseTypeText('  english  '));
    check('B3 全大写 ENGLISH → 劳动', l.courseTypeText('ENGLISH') === '劳动', l.courseTypeText('ENGLISH'));
    check('B4 历史脏数据"英语" → 劳动', l.courseTypeText('英语') === '劳动', l.courseTypeText('英语'));
    check('B5 未知 code 原样返回', l.courseTypeText('german') === 'german', l.courseTypeText('german'));
    check('B6 空串 → 空串', l.courseTypeText('') === '', JSON.stringify(l.courseTypeText('')));
    check('B7 null → 空串（不出 null/undefined）', l.courseTypeText(null) === '', JSON.stringify(l.courseTypeText(null)));
    check('B8 结果不含 "undefined"', !/undefined/.test(l.courseTypeText(undefined)));
  }

  console.log('\n=== C. courseTypeCellHtml：列表单元格（带 data-term，切行业会被 applyTerms 刷新）===');
  {
    const l = makeEnv('legal');
    const cell = l.courseTypeCellHtml('english');
    check('C1 单元格含 data-term="classType2"', cell.indexOf('data-term="classType2"') >= 0, cell);
    check('C2 单元格文本为"劳动"', cell.indexOf('>劳动</span>') >= 0, cell);
    check('C3 空值 → 空串', l.courseTypeCellHtml('') === '', JSON.stringify(l.courseTypeCellHtml('')));
    check('C4 脏数据也能出行业词', l.courseTypeCellHtml('English').indexOf('>劳动</span>') >= 0, l.courseTypeCellHtml('English'));
    check('C5 未知值原样输出（不吞）', l.courseTypeCellHtml('german') === 'german', l.courseTypeCellHtml('german'));
    check('C6 HTML 转义（防注入）', l.courseTypeCellHtml('<img>') === '&lt;img&gt;', l.courseTypeCellHtml('<img>'));
  }

  console.log('\n=== D. courseTypeOptionsHtml：下拉（顺序 + 选中 + 空选项）===');
  {
    const l = makeEnv('legal');
    const html = l.courseTypeOptionsHtml('english', { empty: '全部' });
    const values = [...html.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    check('D1 值顺序固定 french,english,chinese,spanish',
      JSON.stringify(values) === JSON.stringify(['', 'french', 'english', 'chinese', 'spanish']), JSON.stringify(values));

    const idxEn = html.indexOf('value="english"');
    const idxZh = html.indexOf('value="chinese"');
    check('D2 english 对应 classType2（颠倒已修）',
      html.slice(idxEn, idxEn + 120).indexOf('classType2') >= 0, html.slice(idxEn, idxEn + 120));
    check('D3 chinese 对应 classType3',
      html.slice(idxZh, idxZh + 120).indexOf('classType3') >= 0, html.slice(idxZh, idxZh + 120));
    check('D4 选中项带 selected',
      html.slice(idxEn - 60, idxEn + 40).indexOf('value="english" selected') >= 0 || html.indexOf('value="english" selected') >= 0, html);
    check('D5 只选中一个', (html.match(/ selected/g) || []).length === 1, String((html.match(/ selected/g) || []).length));
    check('D6 空选项文本为"全部"', html.indexOf('<option value="">全部</option>') >= 0, html.slice(0, 60));
    check('D7 选项文本为行业词', html.indexOf('>劳动</span>') >= 0 && html.indexOf('>婚姻</span>') >= 0, html);
    const noEmpty = l.courseTypeOptionsHtml('french');
    check('D8 不传 opts 时无空选项', noEmpty.indexOf('value=""') < 0, noEmpty.slice(0, 60));
    check('D9 不传 opts 时 french 选中', noEmpty.indexOf('value="french" selected') >= 0, noEmpty.slice(0, 80));
  }

  console.log('\n=== E. enumTermText / enumTermCellHtml（难度等级、课程形式等同源字段）===');
  {
    const l = makeEnv('legal');
    check('E1 classForm 1p1 → 个案咨询', l.enumTermText('classForm', '1p1') === '个案咨询', l.enumTermText('classForm', '1p1'));
    check('E2 classForm 1pN → 小组咨询', l.enumTermText('classForm', '1pN') === '小组咨询', l.enumTermText('classForm', '1pN'));
    const e = makeEnv('education');
    check('E3 education classForm 1p1 → 一对一', e.enumTermText('classForm', '1p1') === '一对一', e.enumTermText('classForm', '1p1'));
    check('E4 classLevel B1 → B1入门', e.enumTermText('classLevel', 'B1') === 'B1入门', e.enumTermText('classLevel', 'B1'));
    check('E5 未知 code 回退 code 本身', e.enumTermText('classLevel', 'C9') === 'C9', e.enumTermText('classLevel', 'C9'));
    const cell = l.enumTermCellHtml('classForm', '1p1');
    check('E6 单元格带 data-term="classForm1p1"', cell.indexOf('data-term="classForm1p1"') >= 0, cell);
    check('E7 单元格文本为个案咨询', cell.indexOf('>个案咨询</span>') >= 0, cell);
  }

  console.log('\n=== F. 服务端合并词优先（租户/平台词覆盖本地行业词）===');
  {
    const s = makeEnv('legal', { classType2: '公司法务', classForm1p1: '专属咨询' });
    check('F1 服务端词覆盖行业词', s.courseTypeText('english') === '公司法务', s.courseTypeText('english'));
    check('F2 服务端词覆盖 classForm', s.enumTermText('classForm', '1p1') === '专属咨询', s.enumTermText('classForm', '1p1'));
    check('F3 未覆盖项仍取行业词', s.courseTypeText('french') === '婚姻', s.courseTypeText('french'));
    check('F4 空串词不生效（回退锚点词）', makeEnv('legal', { classType2: '' }).courseTypeText('english') === '劳动',
      makeEnv('legal', { classType2: '' }).courseTypeText('english'));
  }

  console.log('\n=== G. 消费方静态检查（防止再写死 / 再写错映射）===');
  {
    // G1：全前端不得再有硬编码的 code + classTypeN 配对
    const files = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) { if (f !== 'node_modules' && f !== 'dist' && f !== 'tools' && f !== 'test') walk(p); }
        else if (/\.(js|html)$/.test(f)) files.push(p);
      }
    })(FRONTEND);

    const bad = [];
    const re = /<option value="(french|english|chinese|spanish)"[^>]*>\s*<span data-term="(classType\d)">/g;
    for (const f of files) {
      if (path.basename(path.dirname(f)) === 'test') continue;
      const s = read(path.relative(FRONTEND, f));
      let m;
      while ((m = re.exec(s))) {
        // 权威映射：french→1 english→2 chinese→3 spanish→4
        const want = { french: '1', english: '2', chinese: '3', spanish: '4' }[m[1]];
        if (m[2] !== 'classType' + want) bad.push(path.relative(FRONTEND, f) + ':' + m[1] + '→' + m[2]);
      }
    }
    check('G1 无硬编码的 code↔classType 配对（或配对正确）', bad.length === 0, bad.join(' | '));

    // G2：五个消费方都必须走 helper
    const need = {
      'js/admin-template.js': ['courseTypeOptionsHtml', 'courseTypeCellHtml'],
      'js/admin-course.js': ['courseTypeOptionsHtml', 'courseTypeText'],
      'js/admin-schedule.js': ['courseTypeOptionsHtml'],
      'js/student-bookingCards.js': ['courseTypeOptionsHtml'],
      'js/public/datamaintain_delete.js': ['courseTypeText'],
      'js/admin-dataMaintainPage.js': ['courseTypeCellHtml'],
    };
    for (const [f, fns] of Object.entries(need)) {
      const s = read(f);
      const miss = fns.filter((fn) => s.indexOf(fn) < 0);
      check('G2 ' + f + ' 已改用 helper', miss.length === 0, '缺少 ' + miss.join(','));
    }

    // G3：三个页面必须引入 enumTerms.js
    for (const f of ['admin.html', 'student.html', 'teacher.html']) {
      check('G3 ' + f + ' 引入 enumTerms.js', read(f).indexOf('js/public/enumTerms.js') >= 0);
    }
  }

  console.log('\n=== H. TERM_KEYS 锚点与 TERM_DICT 基准词一致性（restoreAnchorTerms 依赖）===');
  {
    const e = makeEnv('education');
    const bad = e.__run(
      'TERM_KEYS.filter(function (t) {' +
      '  var b = TERM_DICT.education[t.key];' +
      '  return b !== undefined && b !== t.anchor;' +
      '}).map(function (t) { return t.key + ": anchor=" + t.anchor + " 基准词=" + TERM_DICT.education[t.key]; })'
    );
    check('H1 TERM_KEYS.anchor 与 TERM_DICT.education 完全一致', bad.length === 0, bad.join(' | '));
  }

  console.log('\n=========================== 汇总 ===========================');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  if (fails.length) { console.log('  失败项：'); fails.forEach((f, i) => console.log(`   ${i + 1}. ${f}`)); }
  process.exit(fail ? 1 : 0);
})();
