/* =============================================================
 * 枚举字段 → 行业词 的唯一权威定义（js/public/enumTerms.js）
 * -------------------------------------------------------------
 * 背景：languageType（课程/咨询类型）在数据库里存的是 code（french/english/...），
 *       但下拉框的"显示词"只存在于 <option> 的 DOM 文本里（靠 data-term 换词）。
 *       列表是 JS 拼字符串渲染的，拿不到 DOM 文本，于是把 code 直接拼了进去
 *       （表现为列表里显示 english / English，而不是"劳动""行政"）。
 *       且 code→classTypeN 的序号映射在 5 个文件里写了 3 套、互相矛盾。
 *
 * 约定（以后新增枚举字段照此办理）：
 *   1. code 与词条 key 的对应关系**只在这里声明一次**，其它文件一律调用本模块；
 *   2. 下拉用 courseTypeOptionsHtml()，单元格用 courseTypeCellHtml()，
 *      拼接文本（如 "法语 B1入门 60 300"）用 courseTypeText()；
 *   3. 单元格输出 <span data-term="key">词</span>，这样切换行业时
 *      applyTerms() 能顺带刷新，且与全站 data-term(opt-in) 机制一致；
 *   4. 未知 code 一律原样输出（绝不显示 undefined / 空串），便于发现脏数据。
 *
 * 权威映射（与 js/public/terms.js 中 TERM_DICT.education 保持一致）：
 *   french → classType1（法语）   english → classType2（英语）
 *   chinese → classType3（汉语）  spanish → classType4（西语）
 * ============================================================= */
(function (global) {
  'use strict';

  /** 唯一的 code → 词条 key 映射表（顺序即下拉顺序） */
  var COURSE_TYPE_OPTIONS = [
    { value: 'french',  termKey: 'classType1', anchor: '法语' },
    { value: 'english', termKey: 'classType2', anchor: '英语' },
    { value: 'chinese', termKey: 'classType3', anchor: '汉语' },
    { value: 'spanish', termKey: 'classType4', anchor: '西语' }
  ];

  /**
   * 归一化 code：去空格、转小写、把历史脏数据/别名映射回标准 code。
   * 库里确实出现过 'English'（首字母大写）等写法，故做兼容。
   */
  var COURSE_TYPE_ALIAS = {
    fr: 'french', french: 'french',
    en: 'english', english: 'english',
    zh: 'chinese', cn: 'chinese', chinese: 'chinese',
    es: 'spanish', sp: 'spanish', spanish: 'spanish',
    // 历史脏数据：误把"显示词"存进了字段
    '法语': 'french', '英语': 'english', '英文': 'english',
    '汉语': 'chinese', '中文': 'chinese', '国语': 'chinese',
    '西语': 'spanish', '西班牙语': 'spanish'
  };

  function normalizeCourseType(code) {
    if (code === null || code === undefined) return '';
    var s = String(code).trim();
    if (!s) return '';
    var low = s.toLowerCase();
    return COURSE_TYPE_ALIAS[low] || COURSE_TYPE_ALIAS[s] || low;
  }

  function findCourseType(code) {
    var c = normalizeCourseType(code);
    if (!c) return null;
    for (var i = 0; i < COURSE_TYPE_OPTIONS.length; i++) {
      if (COURSE_TYPE_OPTIONS[i].value === c) return COURSE_TYPE_OPTIONS[i];
    }
    return null;
  }

  /** 取当前生效词表（服务端合并词 > 行业词），取不到时回退 education */
  function getTermsSafe() {
    try {
      if (typeof global.getTerms === 'function') return global.getTerms() || {};
    } catch (e) { /* 忽略：termsFunction.js 未加载或出错 */ }
    // 注意：terms.js 里是 const TERM_DICT（词法声明），不会挂到 window 上，
    // 必须用裸标识符 + typeof 探测；浏览器与 Node vm 行为一致。
    try {
      if (typeof TERM_DICT !== 'undefined' && TERM_DICT) return TERM_DICT.education || {};
    } catch (e2) { /* 忽略 */ }
    return {};
  }

  /**
   * 取词条：合并词 → 当前行业词 → 锚点词（education 基准词）
   * 多一层"行业词"兜底，是因为服务端词表里可能存在空串条目——
   * 直接掉到锚点词会在 legal 行业下显示 education 的"英语"，显然不对。
   */
  function termOf(key, anchor) {
    var t = getTermsSafe()[key];
    if (t !== null && t !== undefined && t !== '') return t;
    try {
      var ind = (typeof global.getCurrentIndustry === 'function')
        ? global.getCurrentIndustry()
        : (global.localStorage ? global.localStorage.getItem('industry') : null);
      var d = (typeof TERM_DICT !== 'undefined' && TERM_DICT) ? TERM_DICT[ind] : null;
      if (d && d[key]) return d[key];
    } catch (e) { /* 忽略 */ }
    return anchor;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  /** code → 显示词（用于字符串拼接）。未知 code 原样返回。 */
  function courseTypeText(code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) return '';
    var o = findCourseType(s);
    if (!o) return s;
    return termOf(o.termKey, o.anchor);
  }

  /** code → 单元格 HTML（带 data-term，切换行业时会被 applyTerms 刷新） */
  function courseTypeCellHtml(code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) return '';
    var o = findCourseType(s);
    if (!o) return esc(s);
    return '<span data-term="' + o.termKey + '">' + esc(courseTypeText(s)) + '</span>';
  }

  /**
   * 生成 <option> 片段
   * @param {string} selected 当前选中 code
   * @param {object} [opts] { empty: '全部' } —— 传了就在最前面加一个空值选项
   */
  function courseTypeOptionsHtml(selected, opts) {
    opts = opts || {};
    var cur = normalizeCourseType(selected);
    var out = '';
    if (opts.empty !== undefined && opts.empty !== null) {
      out += '<option value="">' + esc(opts.empty) + '</option>';
    }
    for (var i = 0; i < COURSE_TYPE_OPTIONS.length; i++) {
      var o = COURSE_TYPE_OPTIONS[i];
      out += '<option value="' + o.value + '"' + (cur === o.value ? ' selected' : '') + '>'
           + '<span data-term="' + o.termKey + '">' + esc(courseTypeText(o.value)) + '</span>'
           + '</option>';
    }
    return out;
  }

  /* ------------------------------------------------------------
   * 通用枚举：key = 前缀 + code（如 classForm1p1 / classLevelB1）
   * 适用所有"词条 key 由 code 直接拼出"的字段（班级形式、难度等级…）
   * ------------------------------------------------------------ */

  /** code → 显示词；无对应词条时回退 code 本身 */
  function enumTermText(prefix, code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) return '';
    var t = getTermsSafe()[prefix + s];
    return (t !== null && t !== undefined && t !== '') ? t : s;
  }

  /** code → 单元格 HTML（带 data-term） */
  function enumTermCellHtml(prefix, code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) return '';
    var key = prefix + s;
    var t = getTermsSafe()[key];
    if (t === null || t === undefined || t === '') return esc(s);
    return '<span data-term="' + esc(key) + '">' + esc(t) + '</span>';
  }

  // 导出到 window，供各页面内联脚本与 js/*.js 使用
  global.COURSE_TYPE_OPTIONS = COURSE_TYPE_OPTIONS;
  global.normalizeCourseType = normalizeCourseType;
  global.courseTypeText = courseTypeText;
  global.courseTypeCellHtml = courseTypeCellHtml;
  global.courseTypeOptionsHtml = courseTypeOptionsHtml;
  global.enumTermText = enumTermText;
  global.enumTermCellHtml = enumTermCellHtml;
})(window);
