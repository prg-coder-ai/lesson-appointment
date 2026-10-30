// 消息中心展示映射：编码 → 文案（零 DOM、零小程序 API、纯函数）
// 抽自两端各自一份的重复实现：
//   - miniprogram/core/message.js（SENDER_TEXT / PRIORITY_TEXT / CATEGORY_DICT + 四个映射函数）
//   - frontend/js/messages-inbox.js（列表行、已发行、详情弹层直接贴裸编码）
// 统一为本模块后，Web 端经 P0 桥接挂 window.MessageDomain，小程序端 core/message.js 委托同一份，
// 新增优先级档位 / 发送者类型时只需改这里（否则两端必然漂移）。
//
// 背景：message-service 库里存的都是**编码**——
//   · priority：HIGH / MEDIUM / LOW（msg_message.priority）
//   · senderType：teacher / admin / platform_admin / student / system
//   · categoryCode：租户或平台在「消息分类」里自定义的编码，展示名在 msg_category.category_name
// 界面上不允许出现 categoryCode / HIGH 这类裸编码，一律过下面的映射函数。

/** 优先级编码 → 文案 */
export const PRIORITY_TEXT = { HIGH: '高', MEDIUM: '中', LOW: '低' };

/** 发送者类型编码 → 文案 */
export const SENDER_TYPE_TEXT = {
  teacher: '教师',
  admin: '管理员',
  platform_admin: '平台管理员',
  student: '学生',
  system: '系统'
};

// 分类编码 → 名称字典（canonical 形状：{ code, name }）。由分类树填充。
// 收件箱列表/详情后端会顺带回填 categoryName；「已发 / 管理」列表与投递详情**只给 categoryCode**，
// 所以必须留一份本地字典兜底，否则这两处只能显示编码。
let CATEGORY_DICT = Object.create(null);

/**
 * 用分类列表刷新字典（幂等）。
 * 入参为 canonical 形状：[{ code, name }]；后端原始树请先过 categoryListFromTree()。
 * @returns {Object} 刷新后的字典副本
 */
export function setCategoryDict(list) {
  const dict = Object.create(null);
  (list || []).forEach((c) => {
    if (c && c.code) dict[c.code] = c.name || c.code;
  });
  CATEGORY_DICT = dict;
  return Object.assign({}, dict);
}

/** 当前分类字典（只读用途；需要一份普通对象时用返回副本） */
export function getCategoryDict() {
  return Object.assign({}, CATEGORY_DICT);
}

/** 分类展示文案：后端名称 → 本地字典 → 「未分类」（有编码但查不到名称）；无编码返回空（不显示标签） */
export function categoryText(code, name) {
  if (name) return name;
  if (!code) return '';
  return CATEGORY_DICT[code] || '未分类';
}

/**
 * 后端分类树/列表 → canonical [{ code, name, level }]。
 * 兼容后端两种字段名（categoryCode/categoryName 与 code/name）与嵌套 children；
 * CategoryController.tree() 当前返回扁平列表，children 分支是防御性的。
 */
export function categoryListFromTree(items) {
  const out = [];
  (function walk(arr) {
    (arr || []).forEach((c) => {
      if (!c) return;
      const code = c.categoryCode || c.code;
      const name = c.categoryName || c.name;
      if (code) out.push({ code: code, name: name || code, level: c.categoryLevel || c.level || 1 });
      if (Array.isArray(c.children)) walk(c.children);
    });
  })(items);
  return out;
}

/**
 * 收集分类编码白名单（发送前前端预校验用）。
 * 兼容原始树与 canonical 列表，递归取 小写编码 → true。
 */
export function collectCategoryCodes(items) {
  const valid = Object.create(null);
  (function walk(arr) {
    (arr || []).forEach((c) => {
      if (!c) return;
      const code = c.categoryCode || c.code;
      if (code) valid[String(code).toLowerCase()] = true;
      if (Array.isArray(c.children)) walk(c.children);
    });
  })(items);
  return Object.assign({}, valid);
}

/** 优先级编码（供样式类名 pri-XXX / msg-pri.XXX 用，不参与展示） */
export function priorityCode(code) {
  return code ? String(code).toUpperCase() : '';
}

/** 优先级展示文案：空值返回空，未知编码原样透出（便于排查新增档位），否则 HIGH/MEDIUM/LOW → 高/中/低 */
export function priorityText(code) {
  if (code === null || code === undefined || code === '') return '';
  const key = String(code).toUpperCase();
  return PRIORITY_TEXT[key] || String(code);
}

/** 发送者类型展示文案：空值返回空，未知编码原样透出 */
export function senderTypeText(type) {
  if (!type) return '';
  return SENDER_TYPE_TEXT[type] || String(type);
}

/* ==================== 消息状态（发送台账：「已发」/「消息管理」列表与详情用） ==================== */

/**
 * 消息状态编码 → 文案（msg_message.status）。
 *
 * `withdrawn` 是**历史值**，与 `recalled` 同义（都是「已收回」）：
 *   · 建表注释里声明的词汇表是 `sent/withdrawn`（原文「已撤回」，注释本身已被 GBK 误读成乱码）；
 *   · 而代码从第一版提交起只写 `sent`/`recalled`/`partial_recalled`（全历史 .java 中 grep `withdrawn` 命中 0）；
 *   · 库里现存 3 行 `withdrawn` 均为 2026-09-05 的早期数据（send_time = update_time，从未执行过撤回动作）。
 * 故此处按「同义别名」归一，而不是当脏数据丢弃 —— 界面上必须给出中文，不能漏出裸英文。
 */
export const MESSAGE_STATUS_TEXT = {
  sent: '已发送',
  recalled: '已收回',
  partial_recalled: '部分收回',
  withdrawn: '已收回',
};

/** 消息状态编码 → 文案；未知编码原样透出，便于发现新增档位 */
export function messageStatusText(status) {
  if (!status) return '';
  return MESSAGE_STATUS_TEXT[status] || String(status);
}

/* ==================== 投递 / 接收人状态（「已发」详情的接收人列表用） ==================== */

/** 投递状态编码 → 文案（msg_delivery.delivery_status） */
export const DELIVERY_STATUS_TEXT = { 0: '未投递', 1: '已投递', 2: '已确认接收', 3: '投递失败' };

/** 投递状态编码 → 文案；未知编码原样透出，便于排查新增档位 */
export function deliveryStatusText(code) {
  if (code === null || code === undefined || code === '') return '';
  return DELIVERY_STATUS_TEXT[Number(code)] || String(code);
}

/**
 * 接收人行的状态标签：把「投递状态」与「收件箱副本状态」合并成一个人类可读的词。
 *
 * 判定优先级（自上而下，命中即返回）：
 *   ① isDeleted=1 → 已撤回：收回（withdraw）会把**未读**副本置为已删除，这是用户视角的「撤回」
 *   ② isRead=1   → 已读（阅读时间另行展示 readTime）
 *   ③ deliveryStatus=3 → 投递失败
 *   ④ deliveryStatus=0 → 未投递（尚未落库到对方收件箱）
 *   ⑤ 其余 → 未读
 *
 * 返回 { text, cls }：text 直接展示，cls 供样式类（rec-read / rec-unread / rec-failed / rec-pending / rec-revoked）；
 * 状态文案一律走本函数，界面上不出现裸 deliveryStatus 数字。
 */
export function recipientStateText(row) {
  const r = row || {};
  if (r.isDeleted) return { text: '已撤回', cls: 'revoked' };
  if (r.isRead) return { text: '已读', cls: 'read' };
  const st = (r.deliveryStatus === null || r.deliveryStatus === undefined) ? null : Number(r.deliveryStatus);
  if (st === 3) return { text: '投递失败', cls: 'failed' };
  if (st === 0) return { text: '未投递', cls: 'pending' };
  return { text: '未读', cls: 'unread' };
}

/* ==================== 发送方租户（平台管理员识别「哪家租户发来的」） ==================== */

/**
 * 租户ID → 公司名（org_name）字典。
 *
 * 用途唯一：**平台管理员**看消息详情时，消息来自哪个租户需要落到公司名。
 * 数据源是主系统的 GET /api/v1/tenant/list（PLATFORM_ONLY，返回 [{id, tenantCode, orgName}]）；
 * message-service（消息库）是独立库，拿不到 sys_tenant，故只能由调用方拉全量后灌进这里。
 *
 * 为什么不能按 tenantId 逐个查 /tenant/{id}：一页 N 条就是 N 次请求。
 * 租户总量是「几十」量级，拉全量建映射更划算（platform-admin-package.js 已是这个做法）。
 */
let TENANT_DICT = {};

/** 用 /tenant/list 结果刷新字典；兼容 {id,...} 与 {tenantId,...} 两种键名 */
export function setTenantDict(list) {
  const dict = {};
  (list || []).forEach((t) => {
    if (!t) return;
    const id = (t.id !== undefined && t.id !== null) ? t.id : t.tenantId;
    const name = t.orgName || t.name || '';
    if (id !== undefined && id !== null && String(id) !== '' && name) dict[String(id)] = name;
  });
  TENANT_DICT = dict;
  return dict;
}

/** 当前字典（只读用途，便于测试与排查） */
export function getTenantDict() {
  return TENANT_DICT;
}

/**
 * 发送方租户展示文案。
 *
 * 刻意**没有兜底文案**：tenantId 为空/≤0（消息由平台自身发出）、或字典里查不到（租户已删、字典未到位）
 * 时一律返回空串，由调用方省略整段「发送方租户：…」，界面上不出现「未知租户」「租户 12」这类降级文案
 * ——平台视角下「没有租户」本身就是有效语义（平台内部消息）。
 */
export function tenantText(id) {
  if (id === null || id === undefined || id === '') return '';
  const n = Number(id);
  if (!isFinite(n) || n <= 0) return '';
  return TENANT_DICT[String(id)] || '';
}
