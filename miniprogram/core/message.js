// 小程序端：消息中心服务封装（走 message-service / msgBase）
// 对齐 frontend/js/messages-inbox.js 的取数逻辑，但用微信请求层。
// 说明：小程序无 SSE，消息中心以「轮询 + 手动刷新」实现即时更新。

import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';
// 编码 → 文案的映射**权威源在 shared/domain/message.js**（Web 端经桥接挂 window.MessageDomain 用同一份）。
// 本文件只做转发，不再各存一份映射（否则两端新增优先级档位/发送者类型时必然漂移）。
import {
  categoryText, priorityCode, priorityText, senderTypeText,
  setCategoryDict, getCategoryDict, categoryListFromTree, collectCategoryCodes,
  deliveryStatusText, recipientStateText,
  setTenantDict, getTenantDict, tenantText
} from '../shared/domain/message.js';

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

/* ==================== 编码 → 文案（界面上不允许出现裸编码） ====================
 * 消息中心的 category / priority / senderType 三个维度，后端存的都是**编码**：
 *   · priority：HIGH / MEDIUM / LOW（见 message_center.msg_message.priority 列注释）
 *   · senderType：teacher / admin / platform_admin / student / system
 *   · categoryCode：租户或平台在「消息分类」里自定义的编码，展示名在 msg_category.category_name
 * 展示层一律经下面的映射函数取文案；编码仍随视图模型带出（priorityCode 供 pri-XXX 样式类、
 * categoryCode 供筛选与二次翻译），二者不能混用。
 *
 * 实现已下沉 shared/domain/message.js（与 Web 端同一份真源），此处仅转发；
 * 各函数的契约说明见该文件。
 */
export {
  categoryText, priorityCode, priorityText, senderTypeText,
  setCategoryDict, getCategoryDict, categoryListFromTree, collectCategoryCodes,
  deliveryStatusText, recipientStateText,
  setTenantDict, getTenantDict, tenantText
};

/**
 * 解析发送者的姓名与账号（详情页「发件人 / 账号」用）。
 * 账号的可见范围受后端权限约束，这里按角色分路：
 *   · 管理员（admin / platform_admin）：GET /user/page?userId= → 同时拿到 name 与 account；
 *   · 其他角色：GET /user/name/{id} → 只有姓名（该接口 ALL_ROLES）。
 * 刻意不给学生/教师开「按 userId 查账号」的口子：那等于允许拿 userId 枚举他人登录账号。
 * 系统消息无发送者，直接返回空；任何失败都静默降级，不阻断详情展示。
 * 返回 { name, account }。
 */
export async function resolveSender(senderId, senderTypeVal, opts) {
  const out = { name: '', account: '' };
  if (!senderId || !senderTypeVal || senderTypeVal === 'system') return out;
  try {
    if (opts && opts.isAdmin) {
      const box = await request({
        url: ENDPOINTS.USER_PAGE, method: 'GET',
        params: { userId: senderId, pageNum: 1, pageSize: 1 },
        customErrorMsg: false
      });
      const row = (box && box.rows && box.rows[0]) || null;
      if (row) { out.name = row.name || ''; out.account = row.account || ''; }
    } else {
      const n = await request({ url: ENDPOINTS.USER_NAME(senderId), method: 'GET', customErrorMsg: false });
      // 后端查不到时返回字面量 'N/A'（不是空串），要挡掉
      out.name = (typeof n === 'string' && n !== 'N/A') ? n : '';
    }
  } catch (e) { /* 解析失败不阻断详情 */ }
  return out;
}

/**
 * 拉取全部租户并灌进共享字典（`tenantId → 公司名`），供**平台管理员**在详情页展示「发送方租户」。
 *
 * 为什么拉全量：需要的是「任意发送方租户 → 公司名」，而 /tenant/{id} 是单条接口，逐条查会变成 N 次请求。
 * 权限：GET /api/v1/tenant/list 后端是 checkPlatformAdmin（PLATFORM_ONLY），非平台管理员调用会 403 —
 * 故**只在平台管理员身份下调用**，拿不到就当没有字典（tenantText 返回空 → 整行不显示），不弹提示。
 */
let __tenantListLoaded = false;   // 模块级缓存：租户名单在会话内基本不变，一次即可
export async function getTenantList(force) {
  if (__tenantListLoaded && !force) return getTenantDict();
  try {
    const list = await request({ url: ENDPOINTS.TENANT_LIST, method: 'GET', customErrorMsg: false });
    __tenantListLoaded = true;
    return setTenantDict(list);
  } catch (e) {
    __tenantListLoaded = true;    // 失败也置位：不反复重试，本次不显示租户名
    return setTenantDict([]);
  }
}

// 收件/收藏/回收站 列表项 → 视图模型
export function toInboxItem(m) {
  return {
    id: m.messageId,
    title: m.title || '(无标题)',
    preview: (m.preview != null && m.preview !== '') ? m.preview : previewText(m),
    time: fmtTime(m.sendTime || m.createTime),
    unread: !m.isRead,
    starred: !!m.isStarred,
    categoryCode: m.categoryCode || '',
    categoryName: m.categoryName || '',
    category: categoryText(m.categoryCode, m.categoryName),   // 展示文案
    priorityCode: priorityCode(m.priority),                    // 样式类名用
    priority: priorityText(m.priority),                        // 展示文案
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
    categoryCode: m.categoryCode || '',
    categoryName: m.categoryName || '',
    category: categoryText(m.categoryCode, m.categoryName),
    priorityCode: priorityCode(m.priority),
    priority: priorityText(m.priority),
    recipientCount: Number(m.recipientCount) || 0,
    readCount: Number(m.readCount) || 0,
    recallable: !!m.recallable,
    status: m.status || 'sent',
    checked: false
  };
}

/**
 * 分类字典晚于列表到达时，就地重贴分类文案（幂等）。
 * 场景：分类树（/message-categories/tree）与列表请求并发，首屏可能用不上字典；
 * 字典到手后把已渲染的行重算一次，避免「已发 / 管理」这类只给 categoryCode 的行停在「未分类」。
 * 只改 category 一个字段，勾选态等其余字段原样保留。
 */
export function relabelCategory(it) {
  if (!it) return it;
  return Object.assign({}, it, { category: categoryText(it.categoryCode, it.categoryName) });
}

// 已发列表（发送者视角）
export async function getSent(uid, { pageNum = 1, pageSize = 15 } = {}) {
  return request({ url: ENDPOINTS.MSG_SENT, method: 'GET', params: { pageNum, pageSize }, customErrorMsg: false });
}

// 发送历史列表（管理员/租户管理员视角，本租户全部已发）：GET /api/v1/messages
// 后端 history() 要求 isManager()；非平台管理员自动按当前租户隔离。
export async function getMessageList({ status, senderType, pageNum = 1, pageSize = 15 } = {}) {
  const params = { pageNum, pageSize };
  if (status) params.status = status;
  if (senderType) params.senderType = senderType;
  return request({ url: ENDPOINTS.MSG_LIST, method: 'GET', params, customErrorMsg: false });
}

// 发送历史（管理/本租户）列表项 → 视图模型（标题/发送者/时间/状态；不含接收统计，统计见详情）
export function toManageItem(m) {
  const base = toSentItem(m);
  const senderTypeVal = senderTypeText(m.senderType);
  // 管理列表的「发送者」= 类型 + 发送者 ID（该列表返回体无姓名/账号，逐个反查会打成 N+1，
  // 姓名与账号以详情页为准 —— 详情页按角色解析，见 resolveSender）
  const sender = senderTypeVal +
    (m.senderId != null && m.senderId !== '' ? '（' + m.senderId + '）' : '');
  const statusText = m.status === 'recalled' ? '已收回'
    : (m.status === 'partial_recalled' ? '部分收回' : '已发送');
  return Object.assign(base, {
    sender,
    statusText,
    // 管理列表不显示接收/已读统计（toSentItem 默认算成 0 会误导），统一以详情页为准
    recipientCount: 0, readCount: 0
  });
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

// 单条消息的接收人明细（分页）：PageResult<{userId, deliveryStatus, deliveryTime, isRead, readTime, isDeleted, ...}>
// readState: 'all'（默认，可不传） | 'read' | 'unread'；权限与投递统计一致（管理员或发送者本人）。
// 行内**只有 userId**：姓名与账号经 getUserBriefs 批量补齐（本服务是独立库，拿不到主库用户信息）。
export async function getMessageRecipients(mid, { pageNum = 1, pageSize = 20, readState } = {}) {
  return request({
    url: ENDPOINTS.MSG_RECIPIENTS_OF(mid, { pageNum, pageSize, readState }),
    method: 'GET', customErrorMsg: false
  }) || { rows: [], total: 0 };
}

// 批量用户摘要：返回 { [userId]: { name, account } }。
// account 仅管理员（admin / platform_admin）拿得到（服务端按 token 角色裁定），
// 学生 / 教师回包里没有该字段 —— 因此调用方要按「可能为空」渲染，不要留空白占位。
// 任何失败都静默降级为空映射：姓名属增强信息，不该让整页报错。
export async function getUserBriefs(ids) {
  const list = (Array.isArray(ids) ? ids : String(ids || '').split(','))
    .map(s => String(s || '').trim()).filter(Boolean);
  if (!list.length) return {};
  try {
    const rows = await request({ url: ENDPOINTS.USER_BRIEFS(list), method: 'GET', customErrorMsg: false }) || [];
    const map = {};
    rows.forEach(r => {
      if (r && r.userId) map[r.userId] = { name: r.name || '', account: r.account || '' };
    });
    return map;
  } catch (e) { return {}; }
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
