/**
 * 课堂面板布局：视频 / 白板 / 讲稿 三块区域可拖动、可缩放、本地记忆、可复位（2026-11-16）。
 *
 * <p><b>为什么要"按需脱离布局"而不是一开始就全部自由定位</b>
 * 默认布局（视频填满中栏、白板切显、讲稿居中浮层）是绝大多数人用的形态，必须原样保留。
 * 所以这里的原则是：仅在用户真的动过某块面板时，才把它从「跟随布局」切成「自由定位」——
 * 切换的瞬间用 {@code getBoundingClientRect()} 量出它当前的位置尺寸写死为 fixed 坐标，
 * 视觉上零位移。没动过的面板永远走原 CSS，不受本模块影响。
 *
 * <p><b>记忆与复位</b>
 * 布局存在 {@code localStorage}（键 {@code classroom.panelLayout.v1}，按浏览器而不是按账号，
 * 属于设备偏好）。刷新/下次进入自动恢复，且恢复时会按当前视口夹紧——换了小屏也不会跑到屏幕外。
 * 复位有两条路：面板自身的复位按钮，或双击拖动条；{@code resetAll()} 供整体复位。
 *
 * <p><b>缩放后为什么要补一次 resize 事件</b>
 * 白板 canvas 的像素尺寸由容器 clientWidth/Height 决定（classroom-whiteboard.js#_resize），
 * 讲稿 PDF 也要按容器宽度重渲染。容器一旦被拖动缩放，浏览器不会自动发 resize，
 * 这里主动 dispatch 一次（节流 120ms），两块内容才会重新按新尺寸绘制，否则会被 CSS 拉伸模糊。
 *
 * <p>本模块只管「位置 / 尺寸 / 层级」，不碰任何面板的显隐——
 * 视频与白板互斥、讲稿开关仍由各自模块控制，{@code .hidden} 是 {@code display:none !important}，
 * 与这里写入的内联定位互不干扰。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'classroom.panelLayout.v1';
  var MIN_W = 260;          // 再小就看不清内容了
  var MIN_H = 180;
  var EDGE = 4;             // 面板与视口边缘至少留这么多，避免贴边后抓不到拖动条
  var Z_BASE = 65;          // 高于巡课浮层(50)、低于弹窗(9000/9999)
  var Z_STEP = 5;

  var ORDER = ['video', 'whiteboard', 'material'];
  var LABELS = { video: '视频', whiteboard: '白板', material: '讲稿' };

  var saved = {};           // panelId -> {left, top, width, height}
  // 层级顺序：末尾最高。视频排在白板之后 = 浮动小窗默认压在白板上（画中画），
  // 讲稿最高（它是盖在所有人脸前面的看稿工具）。谁被点过谁就升到最上。
  var order = ['whiteboard', 'video', 'material'];
  var bound = false;
  var notifyTimer = null;

  function panelEl(id) {
    if (id === 'video') return document.getElementById('video-panel');
    if (id === 'whiteboard') return document.getElementById('whiteboard-area');
    if (id === 'material') return document.getElementById('material-stage');
    return null;
  }

  function isFree(el) { return el.classList.contains('cl-panel-free'); }

  /** 面板内的按钮/输入框不应触发拖动（否则点「复位」「关闭」会把面板拖走） */
  function isInteractive(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('button, input, select, textarea, a, [contenteditable="true"]');
  }

  function viewport() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 1024,
      h: window.innerHeight || document.documentElement.clientHeight || 768
    };
  }

  /** 夹紧到视口内并守住最小尺寸——拖动/缩放/恢复/视口变化四处共用同一口径 */
  function clampRect(r) {
    var vp = viewport();
    var w = Math.max(MIN_W, Math.min(Math.round(r.width || MIN_W), vp.w - EDGE * 2));
    var h = Math.max(MIN_H, Math.min(Math.round(r.height || MIN_H), vp.h - EDGE * 2));
    var left = Math.max(EDGE, Math.min(Math.round(r.left), vp.w - w - EDGE));
    var top = Math.max(EDGE, Math.min(Math.round(r.top), vp.h - h - EDGE));
    return { left: left, top: top, width: w, height: h };
  }

  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      saved = (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      saved = {};   // 隐私模式/损坏数据：当成没记过，不影响使用
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (e) {
      /* 配额满或禁用存储：布局只在本次会话有效，不报错打断课堂 */
    }
  }

  /** 当前内联样式对应的矩形（free 态才有意义） */
  function currentRect(el) {
    return {
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
      width: parseFloat(el.style.width) || MIN_W,
      height: parseFloat(el.style.height) || MIN_H
    };
  }

  function applyRect(el, r) {
    var c = clampRect(r);
    el.classList.add('cl-panel-free');
    el.style.position = 'fixed';
    // 讲稿默认用 left/right + top/bottom 的百分比定位，必须把 right/bottom 显式置 auto，
    // 否则 width/height 会和 left+right 一起参与计算，宽度设置了也不生效。
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = c.left + 'px';
    el.style.top = c.top + 'px';
    el.style.width = c.width + 'px';
    el.style.height = c.height + 'px';
    return c;
  }

  /** 首次把面板从「跟随布局」切成「自由定位」：量当前矩形并写死，视觉上不跳动 */
  function freePanel(el) {
    if (!isFree(el)) {
      var r = el.getBoundingClientRect();
      el.classList.add('cl-panel-free');
      el.style.position = 'fixed';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = Math.round(r.left) + 'px';
      el.style.top = Math.round(r.top) + 'px';
      el.style.width = Math.round(r.width) + 'px';
      el.style.height = Math.round(r.height) + 'px';
    }
    return currentRect(el);
  }

  function applyZ() {
    order.forEach(function (pid, idx) {
      var el = panelEl(pid);
      if (!el) return;
      // 只有自由态才吃内联层级；跟布局的面板保持 CSS 里的原值（讲稿默认 60）
      el.style.zIndex = isFree(el) ? String(Z_BASE + idx * Z_STEP) : '';
    });
  }

  function raise(id) {
    var i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.push(id);
    applyZ();
  }

  /** 容器尺寸变了要让它自己重算：白板重设 canvas 像素、讲稿按新宽度重渲染 PDF */
  function notifyResize() {
    if (notifyTimer) return;
    notifyTimer = setTimeout(function () {
      notifyTimer = null;
      try {
        window.dispatchEvent(new Event('resize'));
      } catch (e) {
        /* 极老浏览器不支持 Event 构造：内容只是暂时被拉伸，不影响可用性 */
      }
    }, 120);
  }

  function remember(id, rect) {
    saved[id] = rect;
    persist();
  }

  function bindDrag(el, id) {
    var handle = el.querySelector('[data-cl-drag]');
    if (!handle) return;

    handle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;   // 只响应左键/触摸
      if (isInteractive(e.target)) return;
      e.preventDefault();
      raise(id);

      var base = freePanel(el);
      var startX = e.clientX;
      var startY = e.clientY;
      var next = null;
      var raf = null;

      document.body.classList.add('cl-panel-dragging');

      function move(ev) {
        next = {
          left: base.left + (ev.clientX - startX),
          top: base.top + (ev.clientY - startY),
          width: base.width,
          height: base.height
        };
        if (raf) return;                                 // 一帧只写一次样式
        raf = window.requestAnimationFrame(function () {
          raf = null;
          if (next) applyRect(el, next);
        });
      }

      function finish() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        document.body.classList.remove('cl-panel-dragging');
        if (raf) { window.cancelAnimationFrame(raf); raf = null; }
        var final = next || base;
        // 松手时再夹一次并落库：拖动过程末尾可能已越界，不能把越界坐标记下来
        remember(id, applyRect(el, final));
      }

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });

    // 双击拖动条 = 复位这一块（比找小图标快，且符合桌面习惯）
    handle.addEventListener('dblclick', function (e) {
      if (isInteractive(e.target)) return;
      resetPanel(id);
      if (window.clToast) window.clToast(LABELS[id] + '面板已恢复默认位置与大小');
    });
  }

  function bindResize(el, id) {
    var handle = el.querySelector('[data-cl-resize]');
    if (!handle) return;

    handle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();      // 别让面板的置顶/拖动也跟着响应
      raise(id);

      var base = freePanel(el);
      var startX = e.clientX;
      var startY = e.clientY;
      var next = null;
      var raf = null;

      function move(ev) {
        next = {
          left: base.left,
          top: base.top,
          width: base.width + (ev.clientX - startX),
          height: base.height + (ev.clientY - startY)
        };
        if (raf) return;
        raf = window.requestAnimationFrame(function () {
          raf = null;
          if (next) applyRect(el, next);
        });
      }

      function finish() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        if (raf) { window.cancelAnimationFrame(raf); raf = null; }
        remember(id, applyRect(el, next || base));
        notifyResize();           // 尺寸定稿后让白板重设画布、讲稿重排 PDF
      }

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });
  }

  function bindReset(el, id) {
    var btn = el.querySelector('[data-cl-reset]');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      resetPanel(id);
      if (window.clToast) window.clToast(LABELS[id] + '面板已恢复默认位置与大小');
    });
  }

  /** 复位单块：清掉内联定位与记忆，交还给 CSS（讲稿回到居中浮层、视频回到填满中栏） */
  function resetPanel(id) {
    var el = panelEl(id);
    if (!el) return;
    el.classList.remove('cl-panel-free');
    el.style.position = '';
    el.style.right = '';
    el.style.bottom = '';
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = '';
    el.style.zIndex = '';
    if (saved[id]) {
      delete saved[id];
      persist();
    }
    var i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.unshift(id);
    applyZ();
    notifyResize();
  }

  function resetAll() {
    ORDER.forEach(function (id) { resetPanel(id); });
    persist();
  }

  function restoreAll() {
    ORDER.forEach(function (id) {
      var el = panelEl(id);
      var r = saved[id];
      if (!el || !r) return;
      if (!(r.width > 0) || !(r.height > 0)) return;   // 脏数据直接忽略，别把面板弄成 0 尺寸
      saved[id] = applyRect(el, r);                    // 顺带按当前视口夹紧
    });
    applyZ();
  }

  /** 视口变化（换窗口大小/投影切换）时把自由态面板拉回可视范围 */
  function onViewportResize() {
    var changed = false;
    ORDER.forEach(function (id) {
      var el = panelEl(id);
      if (!el || !isFree(el)) return;
      var before = currentRect(el);
      var after = applyRect(el, before);
      if (after.left !== before.left || after.top !== before.top ||
          after.width !== before.width || after.height !== before.height) {
        saved[id] = after;
        changed = true;
      }
    });
    if (changed) persist();
  }

  function init() {
    loadSaved();
    if (!bound) {
      bound = true;
      ORDER.forEach(function (id) {
        var el = panelEl(id);
        if (!el) return;
        bindDrag(el, id);
        bindResize(el, id);
        bindReset(el, id);
        // 捕获阶段统一置顶：点面板任何一处（画布、视频、标题）都把它抬到最上层
        el.addEventListener('pointerdown', function () { raise(id); }, true);
      });
      window.addEventListener('resize', onViewportResize);
    }
    restoreAll();
    return this;
  }

  window.ClassroomPanels = {
    init: init,
    reset: resetPanel,
    resetAll: resetAll,
    /** 供调试/诊断：某块面板是否存过布局 */
    hasSaved: function (id) { return !!saved[id]; }
  };
})();
