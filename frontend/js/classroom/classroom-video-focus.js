/**
 * classroom-video-focus.js —— 视频焦点放大（2026-11-17）
 *
 * 功能：多个视频源时，点击某个画面把它放大到主区，其余画面缩到右侧一列；
 *       再点一次 / 点关闭按钮 / 按 Esc 恢复默认均分网格。
 *
 * 设计要点：
 *  - **只作用于 #video-grid 内部**，外层 #video-panel 的拖动/缩放（classroom-panels.js）
 *    完全不动：焦点态是网格内的「观看模式」，不改变面板的位置/尺寸/层级。
 *  - **纯本地状态**：焦点 id 存在 JS 变量，不进 localStorage、不广播。
 *    刷新后回默认布局最自然；也避免「导播式」那套服务端信令与权限。
 *  - **事件委托 + MutationObserver**：tile 由 RtcTiles 动态增删（进房 append/离房 remove），
 *    所以点击监听绑在 grid 上（委托），而不是每个 tile；成员变化时重新应用焦点态，
 *    焦点成员离开则自动清除（否则 grid 上留个不存在的 id，谁都不是焦点却还缩着侧栏）。
 *  - **恢复默认免费**：移除 grid 的 .has-spotlight 与 tile 的 .is-spotlight 即可，
 *    CSS Grid 自动回到 repeat(auto-fit, minmax(220px,1fr))，无需记录/还原坐标。
 *
 * 与录制的关系：焦点是本地观看态，不影响录制流（录教师上行流），回放也不会有放大效果。
 */
(function () {
  'use strict';

  var GRID_ID = 'video-grid';
  var SPOT_CLASS = 'has-spotlight';     // 加在 #video-grid 上
  var FOCUS_CLASS = 'is-spotlight';     // 加在焦点 tile 上
  var READY_ATTR = 'data-focus-ready';  // grid 上：tile>=2 时才允许点击
  var CLOSE_CLASS = 'vt-spotlight-close';

  var focusedId = null;   // 当前焦点 tile 的 id（vt-local / vt-{peerId}）
  var bound = false;

  function grid() { return document.getElementById(GRID_ID); }

  function tiles() {
    var g = grid();
    if (!g) return [];
    return Array.prototype.slice.call(g.querySelectorAll('.video-tile'));
  }

  /** 给焦点 tile 右上角加关闭按钮；tile 是动态创建的，所以在 JS 里插，不污染 rtc-engine 模板 */
  function addCloseBtn(tile) {
    if (tile.querySelector('.' + CLOSE_CLASS)) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = CLOSE_CLASS;
    btn.title = '关闭放大';
    btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      clear();
    });
    tile.appendChild(btn);
  }

  function removeCloseBtn(tile) {
    var btn = tile.querySelector('.' + CLOSE_CLASS);
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  /** 把当前 focusedId 应用到 DOM；每次成员增删也走这里 */
  function apply() {
    var g = grid();
    if (!g) return;
    var all = tiles();

    // 单人课堂不启用焦点（点了没意义）；这个属性也给 CSS 控制 cursor 提示
    if (all.length >= 2) g.setAttribute(READY_ATTR, '1');
    else g.removeAttribute(READY_ATTR);

    // 焦点成员已离开（tile 被 remove）→ 自动清除，避免布局卡在焦点态
    if (focusedId && !document.getElementById(focusedId)) {
      focusedId = null;
    }

    if (!focusedId) {
      g.classList.remove(SPOT_CLASS);
      all.forEach(function (t) { t.classList.remove(FOCUS_CLASS); removeCloseBtn(t); });
      return;
    }

    g.classList.add(SPOT_CLASS);
    all.forEach(function (t) {
      if (t.id === focusedId) {
        t.classList.add(FOCUS_CLASS);
        addCloseBtn(t);
      } else {
        t.classList.remove(FOCUS_CLASS);
        removeCloseBtn(t);
      }
    });
  }

  function clear() {
    if (!focusedId) return;
    focusedId = null;
    apply();
  }

  function toggle(tileId) {
    if (!tileId) return;
    focusedId = (focusedId === tileId) ? null : tileId;
    apply();
  }

  function bind() {
    var g = grid();
    if (!g || bound) return;
    bound = true;

    // 事件委托：tile 动态增删，绑在稳定的 grid 上
    g.addEventListener('click', function (e) {
      if (!g.hasAttribute(READY_ATTR)) return;   // <2 个画面不响应
      var target = e.target;
      // 关闭按钮由自身 handler 处理，这里别再 toggle 一次
      if (target && typeof target.closest === 'function'
          && target.closest('.' + CLOSE_CLASS)) return;
      var tile = target && typeof target.closest === 'function'
        ? target.closest('.video-tile') : null;
      if (tile && tile.id) toggle(tile.id);
    });

    // Esc 退出焦点（输入框里按 Esc 也会退出，可接受）
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && focusedId) clear();
    });

    // 成员增删：只观察 grid 的直接子节点变化（tile 的 append/remove）
    // 焦点按钮插在 tile 内部，不会触发这里，避免自激循环
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function () { apply(); });
      mo.observe(g, { childList: true });
    } else {
      // 极老浏览器兜底：进房/离房常见路径会调用 showVideo，借它触发一次重算
      var origShow = window.RtcTiles && window.RtcTiles.showVideo;
      if (origShow) {
        window.RtcTiles.showVideo = function () {
          var r = origShow.apply(this, arguments);
          apply();
          return r;
        };
      }
    }

    apply();
  }

  window.ClassroomVideoFocus = {
    init: function () { bind(); return this; },
    /** 供控制台/诊断：当前焦点 tile id */
    current: function () { return focusedId; },
    clear: clear
  };
})();
