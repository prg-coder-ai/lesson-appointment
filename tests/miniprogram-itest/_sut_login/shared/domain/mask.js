// 数据脱敏：手机号 / 电子邮箱
// 抽自：
//   - frontend/js/public/api.js 的 maskPhone / maskEmail（Web 端唯一实现）
//   - miniprogram/shared/format.js 的 maskPhone / maskEmail（手迁副本，已改为 re-export 本模块）
// 消费：列表页用 maskPhone / maskEmail 渲染手机/邮箱；后台编辑回填必须走原始值缓存，
//       绝不能把脱敏串（如 138****5678）写回数据库。
// 纯函数、零 DOM、零小程序 API。Node 下可直接 import 做单测。
// Web 端经 P0 构建桥接后可挂 window.MaskDomain（当前为 P0-Web 阻塞，未接）。

/** 手机号脱敏：11 位保留前3后4；其余保留首尾、中间用 * 代替（≤4 位全盘星） */
export function maskPhone(phone) {
  if (phone == null) return '';
  const s = String(phone).trim();
  const L = s.length;
  if (L === 0) return '';
  if (L === 11) return s.substring(0, 3) + '****' + s.substring(7);
  if (L <= 4) return '*'.repeat(L);
  return s.substring(0, 1) + '*'.repeat(L - 2) + s.substring(L - 1);
}

/** 电子邮箱脱敏：仅遮蔽 @ 之前部分，保留域名与前后缀以提高辨识度。
 *  本地部分规则：
 *   - 长度 ≤ 1：全盘 *            （如 a@b.cn      → *@b.cn）
 *   - 长度 = 2：保留首字符 + 1*   （如 ab@c        → a*@c）
 *   - 长度 3~4：保留首字符，其余 *（如 abc@x → a**@x，abcd@x → a***@x）
 *   - 长度 ≥ 5：保留前 2 + 后 2，中间最多 4 个 *（如 zhangsan@example.com → zh****an@example.com）
 *  无 @ 的串原样返回（非邮箱，不脱敏）。 */
export function maskEmail(email) {
  if (email == null) return '';
  const s = String(email).trim();
  if (s.length === 0) return '';
  const atIdx = s.indexOf('@');
  if (atIdx < 0) return s;                       // 无 @ 视为非邮箱，原样返回
  const local = s.substring(0, atIdx);
  const domain = s.substring(atIdx);             // 含 @，整段保留
  const L = local.length;
  let masked;
  if (L <= 1) {
    masked = '*';
  } else if (L <= 4) {
    masked = local.charAt(0) + '*'.repeat(Math.max(1, L - 1));
  } else {
    const stars = '*'.repeat(Math.min(4, L - 4));
    masked = local.substring(0, 2) + stars + local.substring(L - 2);
  }
  return masked + domain;
}
