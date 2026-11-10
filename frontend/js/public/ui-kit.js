/**
 * ui-kit.js —— 双端共享 UI 基建（UI-1~UI-5）
 *
 * 提供：公共 Toast(mfToast)、Confirm 弹窗(mfConfirm)、骨架屏(mfSkeleton*)、
 *       空状态(mfEmptyState)、业务码友好文案(mfBizError)。
 *
 * 约定（来自《前端双端改进完整方案》§2）：
 *  - 挂到 window 的函数统一以 mf 前缀，避免与既有私有 toast/confirm 冲突
 *    （admin-schedule.js / messages-inbox.js 各自在 IIFE 内定义了私有 toast，
 *    二者都用 #msg-toast，同一页面若同时加载会抢同一个 id）。
 *  - Toast 使用独立 DOM id #mf-toast，Confirm 用 #mf-modal-layer，均不抢占既有 id。
 *  - 所有用户可控文本一律经转义或 textContent，杜绝 XSS。
 */
(function () {
  'use strict';

  // ---- 转义（复用全局 escapeHtml，缺失则本地兜底） ----
  function mfEscapeHtml(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ====================== UI-1 公共 Toast ======================
  function ensureToastEl() {
    let el = document.getElementById('mf-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mf-toast';
      el.style.cssText = [
        'position:fixed', 'left:50%', 'top:24px', 'transform:translateX(-50%)',
        'z-index:99999', 'display:flex', 'flex-direction:column', 'gap:8px',
        'pointer-events:none', 'max-width:90vw'
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  /**
   * 轻量 Toast。type ∈ success | error | warn | info
   * @returns 创建的 toast 节点（便于测试/动画）
   */
  function mfToast(message, type) {
    const host = ensureToastEl();
    const box = document.createElement('div');
    const palette = {
      success: { bg: '#f0f9eb', fg: '#67c23a', bd: '#bce9a8' },
      error:   { bg: '#fef0f0', fg: '#f56c6c', bd: '#f7c4c4' },
      warn:    { bg: '#fdf6ec', fg: '#e6a23c', bd: '#f3d9a4' },
      info:    { bg: '#edf2ff', fg: '#409eff', bd: '#bcdcff' }
    };
    const c = palette[type] || palette.info;
    box.style.cssText = [
      'pointer-events:auto', 'padding:10px 16px', 'border-radius:8px',
      'font-size:14px', 'line-height:1.4', 'box-shadow:0 2px 12px rgba(0,0,0,.12)',
      'background:' + c.bg, 'color:' + c.fg, 'border:1px solid ' + c.bd,
      'max-width:420px', 'word-break:break-word', 'opacity:0',
      'transition:opacity .2s ease'
    ].join(';');
    box.textContent = (message == null ? '' : String(message));
    host.appendChild(box);
    requestAnimationFrame(function () { box.style.opacity = '1'; });
    const ttl = (type === 'error' || type === 'warn') ? 3600 : 2400;
    setTimeout(function () {
      box.style.opacity = '0';
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 220);
    }, ttl);
    return box;
  }

  // ====================== UI-2 公共 Confirm Modal ======================
  function ensureModalLayer() {
    let layer = document.getElementById('mf-modal-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'mf-modal-layer';
      layer.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99998', 'display:none',
        'align-items:center', 'justify-content:center',
        'background:rgba(0,0,0,.45)'
      ].join(';');
      document.body.appendChild(layer);
    }
    return layer;
  }

  /**
   * mfConfirm({ title, message, okText, cancelText, danger })
   *  @returns Promise<boolean>  用户点确定 resolve(true)，取消/点遮罩 resolve(false)
   *  message 视为纯文本（textContent），不解析 HTML，杜绝 XSS。
   */
  function mfConfirm(opts) {
    opts = opts || {};
    const title = opts.title || '请确认';
    const message = (opts.message == null ? '' : String(opts.message));
    const okText = opts.okText || '确定';
    const cancelText = opts.cancelText || '取消';
    const danger = !!opts.danger;

    return new Promise(function (resolve) {
      const layer = ensureModalLayer();
      const panel = document.createElement('div');
      panel.style.cssText = [
        'background:#fff', 'border-radius:12px', 'width:min(420px,92vw)',
        'padding:20px', 'box-shadow:0 8px 30px rgba(0,0,0,.25)',
        'font-family:inherit'
      ].join(';');

      const h = document.createElement('div');
      h.textContent = title;
      h.style.cssText = 'font-size:16px;font-weight:600;color:#222;margin-bottom:10px;';
      panel.appendChild(h);

      const p = document.createElement('div');
      p.textContent = message;
      p.style.cssText = 'font-size:14px;color:#555;line-height:1.6;white-space:pre-wrap;';
      panel.appendChild(p);

      const bar = document.createElement('div');
      bar.style.cssText = 'margin-top:18px;display:flex;justify-content:flex-end;gap:10px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = cancelText;
      cancelBtn.style.cssText = 'padding:7px 16px;border:1px solid #dcdfe6;border-radius:6px;background:#fff;color:#606266;cursor:pointer;font-size:14px;';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = okText;
      okBtn.style.cssText = 'padding:7px 16px;border:1px solid transparent;border-radius:6px;cursor:pointer;font-size:14px;color:#fff;background:' + (danger ? '#f56c6c' : '#722ed1') + ';';

      bar.appendChild(cancelBtn);
      bar.appendChild(okBtn);
      panel.appendChild(bar);
      layer.appendChild(panel);
      layer.style.display = 'flex';

      function cleanup() {
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (!layer.firstChild) layer.style.display = 'none';
      }
      cancelBtn.onclick = function () { cleanup(); resolve(false); };
      okBtn.onclick = function () { cleanup(); resolve(true); };
      layer.onclick = function (e) { if (e.target === layer) { cleanup(); resolve(false); } };
    });
  }

  // ====================== UI-3 骨架屏 ======================
  // 返回 HTML 字符串，调用方：container.innerHTML = mfSkeletonCard();
  function mfSkeletonCard() {
    return '<div class="mf-skeleton-card">' +
      '<div class="mf-skeleton-line" style="width:60%"></div>' +
      '<div class="mf-skeleton-line" style="width:90%"></div>' +
      '<div class="mf-skeleton-line" style="width:80%"></div>' +
      '<div class="mf-skeleton-line" style="width:40%"></div>' +
      '</div>';
  }
  function mfSkeletonBlock(n) {
    n = n || 3;
    let s = '';
    for (let i = 0; i < n; i++) {
      s += '<div class="mf-skeleton-line" style="width:' + (50 + (i % 3) * 15) + '%"></div>';
    }
    return s;
  }

  // ====================== UI-4 空状态 ======================
  // opts: { icon, title, desc, actionText, actionHandler }
  function mfEmptyState(opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'mf-empty-state';
    if (opts.icon) {
      const ic = document.createElement('div');
      ic.className = 'mf-empty-icon';
      ic.textContent = opts.icon;
      wrap.appendChild(ic);
    }
    const t = document.createElement('div');
    t.className = 'mf-empty-title';
    t.textContent = opts.title || '暂无数据';
    wrap.appendChild(t);
    if (opts.desc) {
      const d = document.createElement('div');
      d.className = 'mf-empty-desc';
      d.textContent = opts.desc;
      wrap.appendChild(d);
    }
    if (opts.actionText) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = opts.actionText;
      btn.style.cssText = 'margin-top:10px;background:#722ed1;border-color:#722ed1;';
      if (typeof opts.actionHandler === 'function') {
        btn.onclick = opts.actionHandler;
      }
      wrap.appendChild(btn);
    }
    return wrap;
  }

  // ====================== UI-5 业务码友好文案 ======================
  // 归属/频控类业务码统一提示。命中已知码返回 true（调用方不必再弹通用错误）。
  function mfBizError(code, msg) {
    if (code === 403) {
      mfToast(
        (msg && msg.indexOf('只能') !== -1) ? msg : '您没有权限执行该操作（仅可操作本人数据）',
        'error'
      );
      return true;
    }
    if (code === 1001) {
      mfToast('操作过于频繁，请稍后再试', 'warn');
      return true;
    }
    return false;
  }

  // ====================== 导出 ======================
  window.mfToast = mfToast;
  window.mfConfirm = mfConfirm;
  window.mfSkeletonCard = mfSkeletonCard;
  window.mfSkeletonBlock = mfSkeletonBlock;
  window.mfEmptyState = mfEmptyState;
  window.mfBizError = mfBizError;
  window.mfEscapeHtml = mfEscapeHtml;
})();
