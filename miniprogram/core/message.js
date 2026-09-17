// 小程序端：消息中心服务封装（走 message-service / msgBase）
// 对齐 frontend/js/messages-inbox.js 的取数逻辑，但用微信请求层。
// 说明：小程序无 SSE，消息中心以「轮询 + 手动刷新」实现即时更新。

import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';

// 未读总数（Result<Long> → number）
export async function getUnreadCount(uid) {
  try {
    const n = await request({ url: ENDPOINTS.MSG_UNREAD(uid), method: 'GET', customErrorMsg: false });
    return (typeof n === 'number') ? n : 0;
  } catch (e) { return 0; }
}

// 收件箱列表：返回 PageResult<MessageInbox> { list, total, pageNum, pageSize }
export async function getInbox(uid, { pageNum = 1, pageSize = 15, folder, unreadOnly, categoryCode, keyword } = {}) {
  const qs = { pageNum, pageSize, folder, unreadOnly, categoryCode, keyword };
  return request({ url: ENDPOINTS.MSG_INBOX(uid, qs), method: 'GET', customErrorMsg: false });
}

// 消息详情：Map<String,Object>（含 title/content/payload/sender 等）
export async function getDetail(uid, mid) {
  return request({ url: ENDPOINTS.MSG_DETAIL(uid, mid), method: 'GET' });
}

// 标记已读 / 未读
export async function setRead(uid, mid, read) {
  const url = read ? ENDPOINTS.MSG_READ(uid, mid) : ENDPOINTS.MSG_UNREAD_SET(uid, mid);
  return request({ url, method: 'POST', customErrorMsg: false });
}

// 收藏切换：starred=true 取消收藏(unstar)，false 收藏(star)
export async function toggleStar(uid, mid, starred) {
  const url = starred ? ENDPOINTS.MSG_UNSTAR(uid, mid) : ENDPOINTS.MSG_STAR(uid, mid);
  return request({ url, method: 'POST', customErrorMsg: false });
}

// 删除单条
export async function deleteMessage(uid, mid) {
  return request({ url: ENDPOINTS.MSG_DELETE(uid, mid), method: 'DELETE', customErrorMsg: false });
}

// 分类树（三级分类）
export async function getCategories() {
  try {
    return await request({ url: ENDPOINTS.MSG_CATEGORIES, method: 'GET', customErrorMsg: false }) || [];
  } catch (e) { return []; }
}

// 列表项摘要：取正文前 N 字
export function previewText(msg, n = 48) {
  if (!msg) return '';
  const raw = msg.content || msg.body || msg.summary || '';
  const text = String(raw).replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n) + '…' : text;
}

// 时间格式化 YYYY-MM-DD HH:mm
export function fmtTime(ts) {
  if (!ts) return '';
  let d;
  if (typeof ts === 'number') d = new Date(ts < 1e12 ? ts * 1000 : ts);
  else d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const p = (x) => (x < 10 ? '0' + x : '' + x);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
