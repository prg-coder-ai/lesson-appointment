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

// 收件箱列表：返回 PageResult<MessageInbox> { rows, total, pageNum, pageSize }
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

// 角色是否可发送通知（学生/教师/管理员/平台管理员均可）
export function canSend(role) {
  return role === 'student' || role === 'teacher' || role === 'admin' || role === 'platform_admin';
}
// 角色是否管理员（可全局彻底删除任意已发消息）
export function isManager(role) {
  return role === 'admin' || role === 'platform_admin';
}

// 收件/收藏/回收站 列表项 → 视图模型
export function toInboxItem(m) {
  return {
    id: m.messageId,
    title: m.title || '(无标题)',
    preview: previewText(m),
    time: fmtTime(m.sendTime || m.createTime),
    unread: !m.isRead,
    starred: !!m.isStarred,
    category: m.categoryCode || '',
    priority: m.priority || '',
    folder: m.folder || '',
    checked: false
  };
}

// 已发列表项 → 视图模型
export function toSentItem(m) {
  return {
    id: m.messageId,
    title: m.title || '(无标题)',
    preview: m.status === 'recalled' ? '已收回' : (m.status === 'partial_recalled' ? '部分收回' : '已发送'),
    time: fmtTime(m.sendTime || m.createTime),
    category: m.categoryCode || '',
    priority: m.priority || '',
    recipientCount: Number(m.recipientCount) || 0,
    readCount: Number(m.readCount) || 0,
    recallable: !!m.recallable,
    status: m.status || 'sent',
    checked: false
  };
}

// 已发列表（发送者视角）
export async function getSent(uid, { pageNum = 1, pageSize = 15 } = {}) {
  return request({ url: ENDPOINTS.MSG_SENT, method: 'GET', params: { pageNum, pageSize }, customErrorMsg: false });
}

// 批量已读
export async function batchRead(uid, ids) {
  return request({ url: ENDPOINTS.MSG_BATCH_READ(uid), method: 'POST', data: { messageIds: ids }, customErrorMsg: false });
}
// 批量删除（移回收站）
export async function batchDelete(uid, ids) {
  return request({ url: ENDPOINTS.MSG_BATCH_DELETE(uid), method: 'DELETE', data: { messageIds: ids }, customErrorMsg: false });
}
// 批量彻底删除（回收站清空）
export async function batchPurge(uid, ids) {
  return request({ url: ENDPOINTS.MSG_BATCH_PURGE(uid), method: 'DELETE', data: { messageIds: ids }, customErrorMsg: false });
}

// 回收站恢复（单条）
export async function restore(uid, mid) {
  return request({ url: ENDPOINTS.MSG_RESTORE(uid, mid), method: 'POST', customErrorMsg: false });
}
// 彻底删除单条个人副本（回收站内）
export async function purge(uid, mid) {
  return request({ url: ENDPOINTS.MSG_PURGE(uid, mid), method: 'DELETE', customErrorMsg: false });
}

// 列出某用户全部消息 id（供「全部已读」）；isDeleted=0 仅收件箱
export async function getMessageIds(uid, isDeleted) {
  const params = {};
  if (isDeleted !== undefined && isDeleted !== null) params.isDeleted = isDeleted;
  return request({ url: ENDPOINTS.MSG_IDS(uid), method: 'GET', params, customErrorMsg: false }) || [];
}

// 撤回已发消息（发送者/管理员，仅接收方均未读可撤回）
export async function recallMessage(mid) {
  return request({ url: ENDPOINTS.MSG_WITHDRAW(mid), method: 'POST', customErrorMsg: false });
}
// 管理员全局彻底删除（连同所有收件人副本与投递记录）
export async function deleteSentGlobal(mid) {
  return request({ url: ENDPOINTS.MSG_DELETE_GLOBAL(mid), method: 'DELETE', customErrorMsg: false });
}

// 单条消息投递追踪（接收/已读统计）
export async function getDeliveryStatus(mid) {
  return request({ url: ENDPOINTS.MSG_DELIVERY(mid), method: 'GET', customErrorMsg: false }) || {};
}

// 发送通知（scope 或指定用户）：body = { title, content, priority, recipientUserIds, broadcast, categoryCode }
export async function sendMessage(body) {
  return request({ url: ENDPOINTS.MSG_SEND, method: 'POST', data: body, customErrorMsg: false });
}

// 接收人 scope 解析（api 主模块）：GET /api/v1/user/message-recipients?scope=&tenantId=
export async function getRecipients(scope, tenantId) {
  const params = { scope };
  if (tenantId) params.tenantId = tenantId;
  return request({ url: ENDPOINTS.MSG_RECIPIENTS, method: 'GET', params, customErrorMsg: false }) || [];
}
