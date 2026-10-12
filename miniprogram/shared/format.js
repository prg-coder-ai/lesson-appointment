// 跨端共享：纯文本格式化工具（无 DOM 依赖）
// maskPhone / maskEmail 已下沉为 domain/mask.js（单一权威源，零 DOM 纯函数），此处 re-export 以兼容既有引用；
// 不要再在本地实现一份（避免与 Web 端 api.js / 小程序副本漂移）。
// escapeHtml / escapeAttr 暂不在 P1 范畴，保留本地实现。

// 手机号 / 邮箱脱敏：单一权威源（零 DOM 纯函数），从 domain/mask.js 取
export { maskPhone, maskEmail } from './domain/mask.js';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
  return escapeHtml(str);
}
