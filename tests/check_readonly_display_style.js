/**
 * 「排期信息」只读字段显示口径守卫（2026-09-28）
 *
 * 需求：这些字段必须**保持只读**，但**文字用正常深色**，不要灰蒙蒙。
 *
 * 为什么需要守卫：
 *   1) 灰色由两处叠加造成 —— `.readonly { color:#999 }` 与 `.nofocus { filter:grayscale(0.8) }`。
 *      只改一处会留下“半灰”，单看 diff 很难发现。
 *   2) 学生端「排期信息」里曾混着两种写法：带 class="readonly" 的（灰底灰字）与
 *      只带 readonly 属性的（白底黑字）。同一行并排显示时底色不一致，像 bug。
 *   3) 还有一类字段只有 `class="readonly"`、没有 `readonly` 属性 ——
 *      pointer-events:none 只挡鼠标，键盘 Tab 聚焦后仍能改值，等于“假的只读”。
 *
 * 注意：注释里出现 grayscale 字样属于说明文字，不是生效声明 —— 判据一律
 * 建立在**去注释后的 CSS** 上，否则“把滤镜删掉但留一行注释解释”会被误报。
 *
 * 用法：
 *   node tests/check_readonly_display_style.js
 *   FRONTEND_DIR=<副本目录> node tests/check_readonly_display_style.js   # 阴性对照
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '..', 'frontend');

/**
 * template+clone 改造后，学生端「排期信息」的 <input> 已搬进 student.html 的
 * <template id="tpl-student-booking">（源码里不再有这段 HTML）。C 组守卫须读真实模板，
 * 字段 id / 样式类 / readonly 属性才是生产那一份。
 */
function extractBookingTemplate() {
  const html = fs.readFileSync(path.join(FRONTEND, 'student.html'), 'utf8');
  const m = html.match(/<template id="tpl-student-booking">[\s\S]*?<\/template>/);
  if (!m) throw new Error('在 student.html 中找不到 #tpl-student-booking 模板');
  return m[0];
}

let pass = 0;
const fails = [];
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fails.push(name); console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}

/** 去掉 CSS 注释：注释中的 grayscale 只是解释文字，不应被当作生效声明 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取出 CSS 中某个「选择器 { ... }」规则的声明体（按首个 `}` 收口） */
function cssBlock(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  if (open < 0) return null;
  const close = css.indexOf('}', open);
  if (close < 0) return null;
  return css.slice(open + 1, close);
}

/** 取该选择器声明体里的某个属性值 */
function cssProp(css, selector, prop) {
  const body = cssBlock(css, selector);
  if (body === null) return null;
  const m = body.match(new RegExp(prop + '\\s*:\\s*([^;}]+)'));
  return m ? m[1].trim() : null;
}

/** 抽出所有 <input ...>，区分「独立 readonly 属性」与「class 里含 readonly」 */
function inputStats(src) {
  return (src.match(/<input\b[^>]*>/g) || []).map(tag => {
    // 先剥掉 class 属性，避免把 class="readonly" 误当成 readonly 属性
    const noClass = tag.replace(/class\s*=\s*("[^"]*"|'[^']*')/g, 'class=""');
    return {
      tag,
      isReadonlyAttr: /\breadonly\b/.test(noClass),
      hasReadonlyClass: /class\s*=\s*("[^"]*\breadonly\b[^"]*"|'[^']*\breadonly\b[^']*')/.test(tag),
    };
  });
}

/** 样式表体检（学生端 / 教师端口径一致） */
function auditCss(label, cssPath) {
  console.log('\n=== ' + label + ' ===');
  const raw = fs.readFileSync(cssPath, 'utf8');
  const css = stripComments(raw);

  const color = cssProp(css, '.readonly {', 'color');
  assert('存在 .readonly 规则', color !== null);
  assert('只读字段文字为深色（不再是灰字 #999）',
    color !== null && /#333\b|#000\b|inherit/i.test(color), 'color=' + color);
  assert('只读字段仍保留浅灰底 #f5f5f5（只读标识不丢）',
    (cssProp(css, '.readonly {', 'background') || '').includes('f5f5f5'));
  assert('只读仍禁用交互（pointer-events:none 未丢）',
    /pointer-events\s*:\s*none/.test(cssBlock(css, '.readonly {') || ''));
  assert('存在 .nofocus 规则', cssBlock(css, '.nofocus {') !== null);
  assert('.nofocus 不再使用 grayscale 滤镜（整行文字被去色的元凶）',
    !/grayscale/i.test(cssBlock(css, '.nofocus {') || ''));
  assert('样式表生效声明中无 grayscale 残留', !/grayscale/i.test(css));
}

auditCss('A 组 学生端样式表 css/student.css', path.join(FRONTEND, 'css', 'student.css'));
auditCss('B 组 教师端样式表 css/teacher.css', path.join(FRONTEND, 'css', 'teacher.css'));

// 学生端满额提示色不能被本次改动误伤
const studentCss = stripComments(fs.readFileSync(path.join(FRONTEND, 'css', 'student.css'), 'utf8'));
assert('满额提示色 .readonly.site-full 仍在且为红色',
  /\.readonly\.site-full\s*\{/.test(studentCss) && /#f5222d/i.test(cssBlock(studentCss, '.readonly.site-full') || ''));

// =====================================================================
console.log('\n=== C 组 学生端「排期信息」：样式类与只读属性双全 ===');
// 旧版这里读 student-bookingCards.js 里的 HTML 字符串；改造后那段 HTML 已迁到 student.html 模板。
const bookingTpl = extractBookingTemplate();
const sInputs = inputStats(bookingTpl);

const onlyAttr = sInputs.filter(x => x.isReadonlyAttr && !x.hasReadonlyClass);
assert('不存在「只带 readonly 属性、无统一样式类」的字段（底色/文字不一致的来源）',
  onlyAttr.length === 0, onlyAttr.map(x => x.tag).join(' | '));

const onlyClass = sInputs.filter(x => x.hasReadonlyClass && !x.isReadonlyAttr);
assert('不存在「只有样式类、无 readonly 属性」的字段（pointer-events 挡不住键盘输入）',
  onlyClass.length === 0, onlyClass.map(x => x.tag).join(' | '));

// 逐个点名，防止今后新增字段时漏掉写法
['teacherNameForCourse', 'originalTimeZone', 'startDate', 'startDate_weekday', 'startTime', 'endDate',
 'timeZone', 'displayStartDate', 'displayStartDate_weekday', 'displayStartTime',
 'displayEndDate', 'displayEndDate_weekday', 'repeatTypeDisplay', 'repeatCycleDisplay',
 'availableSites', 'now_availableSites']
  .forEach(id => {
    const hit = sInputs.find(x => x.tag.includes('id="' + id + '"'));
    assert('排期信息字段 ' + id + ' = 统一样式类 + 只读属性',
      !!hit && hit.hasReadonlyClass && hit.isReadonlyAttr);
  });

// =====================================================================
console.log('\n=== D 组 教师端排期展示字段写法统一 ===');
const teacherJs = fs.readFileSync(path.join(FRONTEND, 'js', 'teacher-courseAndScheduleBrowserCards.js'), 'utf8');
const tInputs = inputStats(teacherJs);
const tAttrOnly = tInputs.filter(x => x.isReadonlyAttr && !x.hasReadonlyClass);
assert('教师端不存在「只带 readonly 属性、无统一样式类」的字段',
  tAttrOnly.length === 0, tAttrOnly.map(x => x.tag).join(' | '));
['startDate', 'startTime', 'endDate', 'timeZone', 'originalTimeZone', 'displayStartDate'].forEach(id => {
  const hit = tInputs.find(x => x.tag.includes('id="' + id + '"'));
  assert('教师端排期字段 ' + id + ' 带统一样式类', !!hit && hit.hasReadonlyClass);
});

// =====================================================================
console.log('\n共 ' + (pass + fails.length) + ' 项，PASS ' + pass + '，FAIL ' + fails.length);
if (fails.length) {
  console.log('失败项：');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
