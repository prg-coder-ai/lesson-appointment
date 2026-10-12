// 弹窗/对话框适配层（单一权威源，零平台特定副作用）。
// 运行时自动探测：小程序用 wx.showModal；Web 用 window.alert/confirm/prompt。
// 统一为 Promise 接口，使两端调用方（包括共享业务代码）写法一致。
//
// 关键差异：小程序无原生 prompt（无法在 showModal 内输入文本）。
// 故 prompt 在 mp 端默认拒绝，并提示业务页「注入自定义输入组件解析器」——
// 即「重设计输入流」：把文本输入下沉到页面级 WXML 输入框，再经 setPromptResolver 回灌。
// 这是 mp 与 Web 唯一不能逐字对齐的适配点，已在设计上显式暴露而非静默降级。

function isMp() {
  return typeof wx !== 'undefined' && typeof wx.showModal === 'function';
}
function getWin() {
  return (typeof window !== 'undefined') ? window : null;
}

let promptResolver = null;
export function setPromptResolver(fn) {
  promptResolver = (typeof fn === 'function') ? fn : null;
}

// alert：仅告知，无返回值（resolve 当点击确定）
export function alert(message, opts) {
  opts = opts || {};
  if (isMp()) {
    return new Promise((resolve) => {
      wx.showModal({
        title: opts.title || '提示',
        content: String(message == null ? '' : message),
        showCancel: false,
        confirmText: opts.confirmText || '确定',
        success: () => resolve(),
        fail: () => resolve()
      });
    });
  }
  const w = getWin();
  if (w) { w.alert(message); return Promise.resolve(); }
  return Promise.resolve();
}

// confirm：返回 Promise<boolean>
export function confirm(message, opts) {
  opts = opts || {};
  if (isMp()) {
    return new Promise((resolve) => {
      wx.showModal({
        title: opts.title || '提示',
        content: String(message == null ? '' : message),
        showCancel: opts.showCancel !== false,
        confirmText: opts.confirmText || '确定',
        cancelText: opts.cancelText || '取消',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
  }
  const w = getWin();
  if (w && typeof w.confirm === 'function') return Promise.resolve(w.confirm(message));
  return Promise.resolve(false);
}

// prompt：返回 Promise<string|null>（取消/不支持时为 null）
export function prompt(message, defaultValue, opts) {
  opts = opts || {};
  if (isMp()) {
    if (promptResolver) return Promise.resolve(promptResolver(message, defaultValue, opts));
    return Promise.reject(new Error('小程序端暂不支持原生 prompt：请使用页面内输入框组件，并调用 setPromptResolver 注入解析器'));
  }
  const w = getWin();
  if (w && typeof w.prompt === 'function') return Promise.resolve(w.prompt(message, defaultValue));
  return Promise.resolve(null);
}

export default { alert, confirm, prompt, setPromptResolver };
