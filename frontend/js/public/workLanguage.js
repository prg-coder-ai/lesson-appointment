/* =============================================================
 * 授课语言（work_language）—— 唯一权威定义（js/public/workLanguage.js）
 * -------------------------------------------------------------
 * 与 enumTerms.js 的分工（2026-10-25 语义拆分，勿再混用）：
 *   · enumTerms.js 服务 **classType**：course.languageType 存的是 code，
 *     显示词由 sys_term 按**行业**渲染 —— 教育行业 english→「英语」，
 *     法律行业 english→「劳动」，健身行业 english→「力量训练」。
 *   · 本文件服务 **workLanguage**：「用哪种语言上课」，与行业无关，
 *     固定清单（英语/法语/汉语/德语/西班牙语/土耳其语）＋租户自定义项。
 *     它**绝不经过 sys_term** —— 把授课语言丢进词表，就会重演
 *     「法律租户的授课语言显示成劳动」这种语义污染。
 *
 * 数据来源：GET /work-language/list（平台内置 tenantId=0 ＋ 本租户自定义）。
 * 为什么还要本地 DEFAULT_ITEMS 兜底：表单/表格是同步拼 innerHTML 的，
 * 接口没回来时下拉不能是空的；接口回来后用服务器清单覆盖
 * （带上租户自定义项与多语言名），失败则一直用兜底六项。
 *
 * 约定：
 *   1. code 与显示名的对应只在本文件声明，其它文件一律调 WorkLanguageDomain；
 *   2. 下拉用 workLanguageOptionsHtml()，单元格用 workLanguageCellHtml()，
 *      拼接文本用 workLanguageText()；
 *   3. 未知 code 原样返回（绝不打成空串或 undefined），便于发现脏数据；
 *   4. 空值一律显示「跟随课程」/「—」，不要显示 code。
 * ============================================================= */
(function (global) {
  'use strict';

  /* 与 sys_work_language 的种子数据保持一致（tenant_id=0 六项） */
  var DEFAULT_ITEMS = [
    { tenantId: 0, langCode: 'english', nameZh: '英语',     nameEn: 'English',  nameFr: 'Anglais',  sortOrder: 10 },
    { tenantId: 0, langCode: 'french',  nameZh: '法语',     nameEn: 'French',   nameFr: 'Français', sortOrder: 20 },
    { tenantId: 0, langCode: 'chinese', nameZh: '汉语',     nameEn: 'Chinese',  nameFr: 'Chinois',  sortOrder: 30 },
    { tenantId: 0, langCode: 'german',  nameZh: '德语',     nameEn: 'German',   nameFr: 'Allemand', sortOrder: 40 },
    { tenantId: 0, langCode: 'spanish', nameZh: '西班牙语', nameEn: 'Spanish',  nameFr: 'Espagnol', sortOrder: 50 },
    { tenantId: 0, langCode: 'turkish', nameZh: '土耳其语', nameEn: 'Turkish',  nameFr: 'Turc',     sortOrder: 60 }
  ];

  var cache = null;   // 服务器清单（成功后覆盖 DEFAULT_ITEMS）
  var loading = null; // 去重中的 Promise，避免一个页面多次并发拉取

  function endpoints() {
    return (global.ApiPaths && global.ApiPaths.ENDPOINTS) || {};
  }

  /**
   * 端点路径：先取别名表（运行期权威），再显式回落。
   *
   * <p>为什么回落分支要连点号一起写全（而不是先取别名表再按 key 取）：
   * tools/check-endpoints-refs.mjs 靠「点号 + 常量名」的**字面**模式统计常量是否被引用，
   * 纯动态取属性（ep[key]）它识别不到，会把新常量报成"无人引用"，甚至把注释里的
   * 通配写法误判成未定义常量。两个分支运行期等价：前者规避 ApiPaths 未加载时抛错，
   * 后者让守卫能看见真实引用。
   */
  function listPath() {
    var ep = endpoints();
    return ep.WORK_LANGUAGE_LIST
      || (global.ApiPaths && global.ApiPaths.ENDPOINTS.WORK_LANGUAGE_LIST)
      || '/work-language/list';
  }

  function savePath() {
    var ep = endpoints();
    return ep.WORK_LANGUAGE_SAVE
      || (global.ApiPaths && global.ApiPaths.ENDPOINTS.WORK_LANGUAGE_SAVE)
      || '/work-language/save';
  }

  function absUrl(path) {
    return (global.API_BASE_URL || '') + path;
  }

  /** 当前界面语言：zh / en / fr（与 termsFunction.js 同一来源） */
  function currentLang() {
    try {
      return String(global.localStorage ? global.localStorage.getItem('lang') || 'zh' : 'zh')
        .trim().toLowerCase();
    } catch (e) { return 'zh'; }
  }

  /** 按界面语言取显示名；缺失时逐级回落到中文 */
  function labelOf(item) {
    if (!item) return '';
    var lang = currentLang();
    if (lang === 'en') return item.nameEn || item.nameZh || item.langCode || '';
    if (lang === 'fr') return item.nameFr || item.nameEn || item.nameZh || item.langCode || '';
    return item.nameZh || item.nameEn || item.langCode || '';
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  function findItem(code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim().toLowerCase();
    if (!s) return null;
    var list = items();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].langCode || '').toLowerCase() === s) return list[i];
    }
    return null;
  }

  /** 当前可用清单（服务器优先，未加载时返回内置六项） */
  function items() {
    return (cache && cache.length) ? cache : DEFAULT_ITEMS;
  }

  /** 拉取清单（幂等；force=true 强制刷新，如租户新增了自己的语言后） */
  function load(force) {
    if (cache && !force) return Promise.resolve(cache);
    if (loading && !force) return loading;
    loading = (function () {
      var url = absUrl(listPath());
      var p;
      try {
        p = (typeof global.request === 'function')
          ? global.request({ url: url, method: 'GET' })
          : Promise.reject(new Error('request 未加载'));
      } catch (e) {
        p = Promise.reject(e);
      }
      return p.then(function (res) {
        if (Array.isArray(res) && res.length) cache = res;
        return items();
      }, function (err) {
        // 失败不抛：下拉退回内置六项，页面照常可用（授课语言不是关键路径）
        console.warn('[workLanguage] 拉取授课语言清单失败，使用内置六项兜底：', err && err.message);
        return items();
      }).then(function (list) {
        loading = null;
        return list;
      });
    })();
    return loading;
  }

  /** code → 显示名；未知 code 原样返回；空值返回空串（由调用方决定显示「跟随课程」还是「—」） */
  function text(code) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) return '';
    var item = findItem(s);
    return item ? labelOf(item) : s;
  }

  /**
   * 生成 <option> 片段（同步）。
   *
   * @param {string} selected 当前选中的 code
   * @param {object} [opts]
   *        { empty: '跟随课程' }  —— 传了就在最前面加一个空值项（值 ''）
   *        { includeEmptyText: false } —— 传 false 则不显示空值项
   * @returns {string}
   */
  function optionsHtml(selected, opts) {
    opts = opts || {};
    var cur = (selected === null || selected === undefined) ? '' : String(selected).trim();
    var out = '';
    if (opts.empty !== undefined && opts.empty !== null) {
      out += '<option value=""' + (cur === '' ? ' selected' : '') + '>' + esc(opts.empty) + '</option>';
    }
    var list = items();
    var matched = false;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var code = String(it.langCode || '');
      if (!code) continue;
      var isSel = (code.toLowerCase() === cur.toLowerCase());
      if (isSel) matched = true;
      out += '<option value="' + esc(code) + '"' + (isSel ? ' selected' : '') + '>'
        + esc(labelOf(it)) + '</option>';
    }
    // 库里存了一个当前清单里没有的 code（租户停用了自定义语言 / 历史脏值）：
    // 原样补一项并选中，否则 select 会静默跳到第一项，用户一保存就把原值改掉。
    if (cur && !matched) {
      out += '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>';
    }
    return out;
  }

  /** code → 单元格 HTML；空值显示「—」，未知 code 原样显示 */
  function cellHtml(code, emptyText) {
    var s = (code === null || code === undefined) ? '' : String(code).trim();
    if (!s) {
      return '<span style="color:#bfbfbf;">' + esc(emptyText === undefined ? '—' : emptyText) + '</span>';
    }
    return '<span class="wl-badge" data-wl="' + esc(s) + '">' + esc(text(s)) + '</span>';
  }

  /** 反查：显示名 → code（从旧数据/文本导入时用，找不到返回空串） */
  function codeOf(nameOrCode) {
    var s = (nameOrCode === null || nameOrCode === undefined) ? '' : String(nameOrCode).trim();
    if (!s) return '';
    var list = items();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].langCode || '').toLowerCase() === s.toLowerCase()) return list[i].langCode;
      if (labelOf(list[i]) === s) return list[i].langCode;
      if (list[i].nameZh === s || list[i].nameEn === s || list[i].nameFr === s) return list[i].langCode;
    }
    return '';
  }

  /** 是否平台内置项（tenantId=0）：内置项对所有租户只读，界面上不允许删除 */
  function isBuiltin(item) {
    return !!item && Number(item.tenantId || 0) === 0;
  }

  function requestRaw(opt) {
    if (typeof global.request !== 'function') {
      return Promise.reject(new Error('request 未加载'));
    }
    return global.request(opt);
  }

  /**
   * 租户新增/更新一条自定义授课语言（仅租户管理员，后端校验角色）。
   *
   * @param {{langCode:string,nameZh:string,nameEn?:string,nameFr?:string,sortOrder?:number}} payload
   * @returns {Promise<Object>} 保存后的记录
   */
  function save(payload) {
    return requestRaw({
      method: 'POST',
      url: absUrl(savePath()),
      data: payload || {}
    }).then(function (res) { cache = null; return res; });
  }

  /**
   * 删除本租户自定义的授课语言。
   * 后端会拦下：内置项、以及仍被模板/课程/排期引用的项。
   *
   * @param {number|string} id
   */
  function remove(id) {
    var ep = endpoints();
    var path;
    if (typeof ep.WORK_LANGUAGE_DELETE === 'function') {
      path = ep.WORK_LANGUAGE_DELETE(id);
    } else if (global.ApiPaths && global.ApiPaths.ENDPOINTS && global.ApiPaths.ENDPOINTS.WORK_LANGUAGE_DELETE) {
      path = global.ApiPaths.ENDPOINTS.WORK_LANGUAGE_DELETE(id);
    } else {
      path = '/work-language/delete/' + encodeURIComponent(id);
    }
    return requestRaw({ method: 'DELETE', url: absUrl(path) })
      .then(function (res) { cache = null; return res; });
  }

  global.WorkLanguageDomain = {
    items: items,
    load: load,
    text: text,
    optionsHtml: optionsHtml,
    cellHtml: cellHtml,
    codeOf: codeOf,
    isBuiltin: isBuiltin,
    save: save,
    remove: remove,
    DEFAULT_ITEMS: DEFAULT_ITEMS
  };

  /* 全局便捷函数（与 enumTerms.js 的 courseTypeOptionsHtml 等保持同一调用风格，
     各页面内联 onclick / 模板字符串直接可用） */
  global.workLanguageOptionsHtml = optionsHtml;
  global.workLanguageText = text;
  global.workLanguageCellHtml = cellHtml;
})(window);
