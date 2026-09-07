// ============================================================================
// 分页组件（pagefoot.js）
// ----------------------------------------------------------------------------
// 被 admin / student / teacher 三个页面的十余个列表共用（用户、课程、模板、排期、
// 预约、预约记录、数据维护…），且同一页面内切换菜单时列表会整体重新渲染。
//
// 【为什么需要作用域隔离】
// Pagination 原先是一个全局单例。切换列表时 pageNum / total / totalPages 会从
// 上一个列表带过来，表现为「刚进课程列表却停在第 5 页」「总数显示的是上一个
// 列表的」这类串味现象。现在按「列表」分片存放：
//   · pageNum / total / totalPages / 取数回调  -> 每个列表一份
//   · pageSize                                 -> 全局共享 + localStorage 持久化
//     （"每页看多少条"是显示偏好，跨列表保持一致才符合直觉）
//   · 切换列表时 pageNum 归 1：与项目既有约定一致（各列表执行新查询前都会写
//     Pagination.pageNum = 1），也不会出现「列表只有 2 页却停在第 5 页」的空页。
//
// 【兼容性】
// Pagination 改为 Proxy，所有既有写法（Pagination.total = x、renderPagination(Pagination)、
// Pagination.pageNum = 1、内联 onclick 里的 Pagination.pageNum=1）全部照常工作，
// 16 个引用了 Pagination 的业务 JS 一行都不用改。
//
// 【防重复加载】
// 本文件被 <script src> 引入的同时，还有 7 个业务 JS 用 document.write 再引一次，
// 在 admin.html 上实际会执行多次。故开头做一次性守卫：重复执行直接返回，不重建状态。
// ============================================================================
(function (global) {
  'use strict';

  // 已加载过则直接返回（document.write 重复引入时不能重建状态，否则会丢失当前列表）
  if (global.Pagination) return;

  var DEFAULT_PAGE_SIZE = 5;
  var PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
  var PAGE_SIZE_STORE_KEY = 'pagination.pageSize';

  // ------------------------------------------------------------------
  // pageSize：跨列表共享的显示偏好，持久化到 localStorage
  // ------------------------------------------------------------------
  function readStoredPageSize() {
    try {
      var v = Number(global.localStorage && global.localStorage.getItem(PAGE_SIZE_STORE_KEY));
      // 只接受下拉框里存在的取值，避免 localStorage 被写脏后带出非法页大小
      return PAGE_SIZE_OPTIONS.indexOf(v) >= 0 ? v : DEFAULT_PAGE_SIZE;
    } catch (e) {
      return DEFAULT_PAGE_SIZE; // 隐私模式等场景下 localStorage 不可用
    }
  }

  function storePageSize(v) {
    try {
      if (global.localStorage) global.localStorage.setItem(PAGE_SIZE_STORE_KEY, String(v));
    } catch (e) {
      /* localStorage 不可用时不持久化即可，不影响本次会话 */
    }
  }

  var sharedPageSize = readStoredPageSize();

  // ------------------------------------------------------------------
  // 每个列表一份状态
  // ------------------------------------------------------------------
  var scopes = Object.create(null);
  var activeKey = null;

  function newScope() {
    return { pageNum: 1, total: 0, totalPages: 0, loader: null };
  }

  function currentScope() {
    var k = activeKey || 'default';
    if (!scopes[k]) scopes[k] = newScope();
    return scopes[k];
  }

  /**
   * 切换当前列表作用域。
   * @param {string}        key    列表标识
   * @param {Function=}     loader 该列表的取数回调
   */
  function setActiveScope(key, loader) {
    if (!key) key = 'default';
    var changed = (key !== activeKey);
    activeKey = key;
    var sc = currentScope();
    if (typeof loader === 'function') sc.loader = loader;
    // 切到另一个列表：页码归 1，避免把上一个列表的页码带过来
    if (changed) sc.pageNum = 1;
    return sc;
  }

  function runActiveLoader() {
    var loader = currentScope().loader;
    if (typeof loader === 'function') loader();
  }

  // ------------------------------------------------------------------
  // Pagination：对外仍是一个对象，内部按作用域读写
  // ------------------------------------------------------------------
  var state = {
    get pageNum() { return currentScope().pageNum; },
    set pageNum(v) { currentScope().pageNum = v; },

    get total() { return currentScope().total; },
    set total(v) { currentScope().total = v; },

    get totalPages() { return currentScope().totalPages; },
    set totalPages(v) {
      var sc = currentScope();
      sc.totalPages = Number(v) || 0;
      // 数据变少时把越界页码拉回最后一页，避免出现空白页
      if (sc.totalPages > 0 && sc.pageNum > sc.totalPages) sc.pageNum = sc.totalPages;
    },

    get pageSize() { return sharedPageSize; },
    set pageSize(v) {
      var n = Number(v);
      if (!(n > 0)) return;
      sharedPageSize = n;
      storePageSize(n);
    }
  };

  global.Pagination = new Proxy(state, {
    get: function (t, k) { return t[k]; },
    set: function (t, k, v) { t[k] = v; return true; }
  });

  // ------------------------------------------------------------------
  // 对外 API
  // ------------------------------------------------------------------

  /**
   * 指定当前列表的取数回调（各列表在渲染入口函数里调用，同时完成作用域切换）。
   * @param {Function} fun      取数并渲染的函数
   * @param {string=}  scopeKey 列表标识。缺省时取 fun.name —— 现有 10 处调用传的
   *                            都是具名函数，因此业务 JS 无需改动即可获得隔离能力。
   *                            仅当「同一个函数服务多个列表」时才需显式传值
   *                            （如 admin-user.js 用它同时渲染教师列表与学生列表）。
   */
  global.assignLoadobjectListFunction = function (fun, scopeKey) {
    if (typeof fun !== 'function') return;
    setActiveScope(scopeKey || fun.name || 'default', fun);
  };

  /** 把当前列表的页码重置为第 1 页（等价于 Pagination.pageNum = 1，语义更明确） */
  global.resetPagination = function () {
    currentScope().pageNum = 1;
  };

  /** 当前生效的列表标识，便于排查串味问题 */
  global.getPaginationScope = function () {
    return activeKey;
  };

  // ------------------------------------------------------------------
  // 分页栏
  // ------------------------------------------------------------------

  /** 分页栏骨架。每页条数下拉按 PAGE_SIZE_OPTIONS 生成，选中项与共享 pageSize 一致 */
  global.getPagebar = function () {
    var opts = PAGE_SIZE_OPTIONS.map(function (n) {
      return '<option value="' + n + '"' + (n === sharedPageSize ? ' selected' : '') + '>' + n + '</option>';
    }).join('');

    return [
      '<div class="pagination-bar">',
      '  <div class="pagination-info">',
      '    共 <span id="xxx-total">0</span> 条记录，每页 ',
      '    <select id="xxx-page-size" onchange="changeXxxPageSize()">' + opts + '</select> 条',
      '  </div>',
      '  <div class="pagination-btns" id="xxx-pagination-btns"></div>',
      '</div>'
    ].join('\n');
  };

  /** 渲染分页按钮，代入分页参数 */
  global.renderPagination = function (pg) {
    var btnContainer = document.getElementById('xxx-pagination-btns');
    var totalElem = document.getElementById('xxx-total');
    if (totalElem) totalElem.textContent = pg.total;
    if (!btnContainer) return;

    if (!pg.total) {
      btnContainer.innerHTML = '<span style="color:#999;">暂无数据</span>';
      return;
    }

    // 同步每页条数下拉：pageSize 跨列表共享，这里保证显示值与实际生效值一致
    var pageSizeElem = document.getElementById('xxx-page-size');
    if (pageSizeElem) {
      Array.prototype.forEach.call(pageSizeElem.options, function (opt) {
        opt.selected = (Number(opt.value) === Number(pg.pageSize));
      });
    }

    var html = '';

    // 上一页
    html += '<button class="pagination-btn" '
          + 'onclick="changeXxxPage(' + (pg.pageNum - 1) + ')" '
          + (pg.pageNum === 1 ? 'disabled' : '') + '>上一页</button>';

    // 页码（显示前后 3 页，超出省略）
    var start = Math.max(1, pg.pageNum - 3);
    var end = Math.min(pg.totalPages, pg.pageNum + 3);

    if (start > 1) {
      html += '<button class="pagination-btn" onclick="changeXxxPage(1)">1</button>';
      if (start > 2) html += '<span style="padding:0 4px;">...</span>';
    }

    for (var i = start; i <= end; i++) {
      html += '<button class="pagination-btn ' + (i === pg.pageNum ? 'active' : '') + '" '
            + 'onclick="changeXxxPage(' + i + ')">' + i + '</button>';
    }

    if (end < pg.totalPages) {
      if (end < pg.totalPages - 1) html += '<span style="padding:0 4px;">...</span>';
      html += '<button class="pagination-btn" onclick="changeXxxPage(' + pg.totalPages + ')">'
            + pg.totalPages + '</button>';
    }

    // 下一页
    html += '<button class="pagination-btn" '
          + 'onclick="changeXxxPage(' + (pg.pageNum + 1) + ')" '
          + (pg.pageNum === pg.totalPages ? 'disabled' : '') + '>下一页</button>';

    btnContainer.innerHTML = html;
  };

  /** 切换页码 */
  global.changeXxxPage = function (targetPage) {
    var sc = currentScope();
    if (targetPage < 1 || targetPage > sc.totalPages) return;
    sc.pageNum = targetPage;
    runActiveLoader();
    // 滚动到卡片顶部
    var card = document.querySelector('.card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth' });
  };

  /** 切换每页条数（跨列表共享 + 持久化），并把当前列表拉回第 1 页 */
  global.changeXxxPageSize = function () {
    var select = document.getElementById('xxx-page-size');
    if (!select) return;
    global.Pagination.pageSize = Number(select.value); // 走 setter：全局共享 + 持久化
    currentScope().pageNum = 1;
    runActiveLoader();
  };
})(window);
