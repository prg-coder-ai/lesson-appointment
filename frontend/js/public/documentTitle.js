/**
 * 文档标题（浏览器标签页 / <title>）术语化
 *
 * 为什么需要单独一个文件：
 *   1) termsFunction.js 的 applyTerms(root = document.body) 只扫描 body，
 *      <title> 在 <head> 里，**永远不会被 data-term 机制替换** —— 切换行业后
 *      标签页标题仍显示锚点词（"语言教学预约系统"），与页面内术语不一致。
 *   2) <title> 是 RCDATA 元素，里面写 <span data-term="xxx"> 不会当成标签解析，
 *      而是原样当作纯文本显示 —— 标题会变成一坨带尖括号的乱码（admin.html 曾如此）。
 *
 * 约定（HTML 侧）：
 *   <title data-term-title="{lessonSystem} - 管理端">语言教学预约系统 - 管理端</title>
 *   - data-term-title 是标题模板，{key} 会被当前生效词条替换（key 取值同 data-term）；
 *   - 标签内的纯文本只是"未执行 JS 时的兜底"，写出锚点词即可；
 *   - 不加 data-term-title 的旧页面走兜底：把标题里的锚点词替换为行业词。
 *
 * 优先级（由 render() 保证）：租户品牌 > 服务端合并词 > 本地行业词 > 锚点词 > 占位符原样
 *
 * 依赖：js/public/terms.js（TERM_DICT）、js/public/termsFunction.js（getTerms，可选）
 * 暴露：window.applyDocumentTitle({ brand })
 */
(function () {
  'use strict';

  /** lessonSystem 的锚点词（education 基准词，与 TERM_KEYS 中 anchor 一致） */
  var ANCHOR_SYSTEM = '语言教学预约系统';

  var initialTitle = null;  // 页面原始 <title> 快照（术语替换前，只取一次）
  var tenantBrand = null;   // 租户品牌标题（如"某某机构预约系统"），由 applyTenantTitle 传入

  function doc() { return (typeof document !== 'undefined') ? document : null; }

  /** 当前 <title> 元素（可能为 null：极简沙箱环境） */
  function titleEl() {
    var d = doc();
    if (!d || typeof d.querySelector !== 'function') return null;
    try { return d.querySelector('title'); } catch (e) { return null; }
  }

  /** 快照原始标题：必须在任何替换发生之前调用（DOMContentLoaded 时 body 已被 applyTerms 改过，但 title 没有） */
  function snapshot() {
    if (initialTitle != null) return;
    var d = doc();
    var t = d ? (d.title || '') : '';
    if (t) { initialTitle = t; return; }
    var el = titleEl();
    if (el && el.textContent) initialTitle = el.textContent;
  }

  /** 当前生效词表：优先 termsFunction.js 的 getTerms()（本地行业词 + 服务端合并词） */
  function currentTerms() {
    try {
      if (typeof window.getTerms === 'function') {
        var t = window.getTerms();
        if (t) return t;
      }
    } catch (e) { /* getTerms 抛错则走兜底 */ }
    try {
      var industry = (typeof localStorage !== 'undefined' && localStorage.getItem('industry')) || 'education';
      if (typeof window.TERM_DICT !== 'undefined' && window.TERM_DICT[industry]) return window.TERM_DICT[industry];
    } catch (e) { /* localStorage 不可用时忽略 */ }
    return {};
  }

  /** 系统名（lessonSystem 当前词，缺失则用锚点词） */
  function systemName(terms) {
    return (terms && terms.lessonSystem) ? terms.lessonSystem : ANCHOR_SYSTEM;
  }

  /** 标题模板：优先 data-term-title，否则用原始标题快照 */
  function template() {
    snapshot();
    var el = titleEl();
    var tpl = (el && typeof el.getAttribute === 'function') ? el.getAttribute('data-term-title') : null;
    if (tpl && tpl.trim()) return tpl.trim();
    if (initialTitle) return initialTitle;
    return (el && el.textContent) ? el.textContent : ((doc() && doc().title) || '');
  }

  /** 渲染最终标题（纯函数，不写 DOM） */
  function render() {
    var terms = currentTerms();
    var sys = systemName(terms);
    var s = template();

    // ① 占位符 {key} -> 当前词（无该词时保留占位符，避免显示 "undefined"）
    s = s.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, key) {
      return (terms[key] != null && terms[key] !== '') ? terms[key] : m;
    });

    // ② 兜底：未加 data-term-title 的旧页面，标题里直接写了锚点词
    if (sys !== ANCHOR_SYSTEM && s.indexOf(ANCHOR_SYSTEM) >= 0) {
      s = s.split(ANCHOR_SYSTEM).join(sys);
    }

    // ③ 租户品牌优先（URL 带 tCode 时，把系统名替换成"机构名+预约系统"）
    if (tenantBrand) {
      if (s.indexOf(sys) >= 0) s = s.split(sys).join(tenantBrand);
      else if (s.indexOf(ANCHOR_SYSTEM) >= 0) s = s.split(ANCHOR_SYSTEM).join(tenantBrand);
    }
    return s;
  }

  /**
   * 应用标题。
   * @param {Object} [opts]
   * @param {string} [opts.brand] 租户品牌标题，传入后写入并长期生效（租户入口页面）
   * @returns {string} 应用后的 document.title
   */
  function applyDocumentTitle(opts) {
    if (opts && opts.brand) tenantBrand = opts.brand;
    var s = render();
    var d = doc();
    if (d && s && d.title !== s) d.title = s;
    syncBrandTitle();
    return d ? d.title : s;
  }

  /**
   * 同步页面内可见大标题（#brand-title）。
   * 只处理"没有 data-term 且未被租户品牌改写过"的元素：
   *   - 有 data-term 的由 applyTerms() 负责（admin.html/index.html）；
   *   - 被 applyTenantTitle 写过品牌的加 data-tenant-brand 标记，避免被行业词覆盖回去。
   */
  function syncBrandTitle() {
    var d = doc();
    if (!d || typeof d.getElementById !== 'function') return;
    var el = d.getElementById('brand-title');
    if (!el || !el.getAttribute) return;
    if (el.getAttribute('data-term')) return;            // 交给 applyTerms
    if (el.getAttribute('data-tenant-brand')) return;    // 已是租户品牌，不改
    var name = tenantBrand || systemName(currentTerms());
    if (name && el.textContent !== name) el.textContent = name;
  }

  window.applyDocumentTitle = applyDocumentTitle;

  // 页面加载完成后应用一次（行业词 / 服务端词表到位后再刷一次由调用方触发）
  if (doc() && typeof doc().addEventListener === 'function') {
    doc().addEventListener('DOMContentLoaded', function () { applyDocumentTitle(); });
  }
  if (typeof window.addEventListener === 'function') {
    // window load 晚于所有同步脚本，也大概率晚于 /term/map 的返回，作为最终兜底
    window.addEventListener('load', function () { applyDocumentTitle(); });
  }
})();
