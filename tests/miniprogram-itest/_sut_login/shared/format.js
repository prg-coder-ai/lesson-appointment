// 跨端共享：纯文本格式化工具（无 DOM 依赖）
// 从 frontend/js/public/api.js 的 maskPhone/maskEmail/escapeHtml 迁移而来。

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

// 手机号脱敏：11 位保留前3后4；其余保留首尾中间 *
export function maskPhone(phone) {
  if (phone == null) return '';
  const s = String(phone).trim();
  const L = s.length;
  if (L === 0) return '';
  if (L === 11) return s.substring(0, 3) + '****' + s.substring(7);
  if (L <= 4) return '*'.repeat(L);
  return s.substring(0, 1) + '*'.repeat(L - 2) + s.substring(L - 1);
}

// 邮箱脱敏：仅遮蔽 @ 之前部分，保留域名
export function maskEmail(email) {
  if (email == null) return '';
  const s = String(email).trim();
  if (s.length === 0) return '';
  const atIdx = s.indexOf('@');
  if (atIdx < 0) return s;
  const local = s.substring(0, atIdx);
  const domain = s.substring(atIdx);
  const L = local.length;
  let masked;
  if (L <= 1) masked = '*';
  else if (L <= 4) masked = local.charAt(0) + '*'.repeat(Math.max(1, L - 1));
  else {
    const stars = '*'.repeat(Math.min(4, L - 4));
    masked = local.substring(0, 2) + stars + local.substring(L - 2);
  }
  return masked + domain;
}
