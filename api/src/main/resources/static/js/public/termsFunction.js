
let domain_industry = "education";

// 服务端合并词表（登录后从 /term/map 拉取，key -> term_name）
// 优先级：租户词 > 行业词 > 平台词（后端已合并），覆盖本地 TERM_DICT
let SERVER_TERM_MAP = null;

// 取当前生效词表：本地行业字典为基底，服务端词表（若有）逐 key 覆盖
function getTerms() {
  const industry = getCurrentIndustry();
  const base = TERM_DICT[industry] || TERM_DICT.education;
  if (!SERVER_TERM_MAP) return base;
  return Object.assign({}, base, SERVER_TERM_MAP);
}

// 枚举型下拉选项取词（标签词 ↔ 选项词 关联方案 A）
// 关联规则：选项 key = 标签 key + "." + 选项编码（如 courseType.oneOnOne）
// 用法：给 <select> 传默认选项清单（value/code/defaultText），词表优先、缺词回退默认文案。
//      页面无需感知词表结构；未配置词条时行为与现状完全一致。
// @param tagKey          标签词 key，如 'courseType'（下拉框标题用 TERM_MAP[tagKey]）
// @param fallbackOptions 默认选项 [{ value, code, defaultText }]，code 用于拼词 key（缺省取 value），defaultText 为缺词回退文案
// @returns [{ value, text }] 可直接渲染为 <option>
function getOptions(tagKey, fallbackOptions) {
  const terms = getTerms();
  return (fallbackOptions || []).map(o => {
    const key = tagKey + '.' + (o.code != null ? o.code : o.value);
    return {
      value: o.value,
      text: (terms[key] != null && terms[key] !== '') ? terms[key] : (o.defaultText || o.value)
    };
  });
}

// 仅对显式标记 data-term / data-term-placeholder 的元素做整词替换（opt-in）。
// 不再做任何"全局文本子串替换"——否则会从数据库读出的数值（如课程名含"课程/上课"）
// 误替换成行业词，污染数据展示。所有需要本地化的标签/表头/标题，都应在 HTML/JS 里用
// <span data-term="key">锚点词</span> 显式标记（项目已标记 120+ 处）。
function applyTerms(root = document.body) {
  const terms = getTerms();

  // 显式标记的元素：文本即整词，直接置为行业词，无子串污染风险
  root.querySelectorAll("[data-term]").forEach(el => {
    const key = el.dataset.term;
    if (terms[key]) el.textContent = terms[key];
  });

  // placeholder 等 HTML 属性
  root.querySelectorAll("[data-term-placeholder]").forEach(el => {
    const key = el.dataset.termPlaceholder;
    if (terms[key]) el.placeholder = terms[key];
  });
}
 
// 把含行业词的字符串还原为锚点词字符串（纯字符串处理，不动 DOM）。
// 用途：菜单导航 switch 按文字匹配（如 case '课程排期'），
// 而 applyTerms 已把菜单文字换成行业词（如"咨询话题排期"），
// 匹配前先经此函数归一化，保证任何行业下导航逻辑都能命中。
function normalizeTermText(text) {
  if (!text || typeof text !== "string") return text;
  const industry = getCurrentIndustry();
  const terms = getTerms();
  if (!terms || industry === "education") return text;
  const pairs = TERM_KEYS
    .filter(t => terms[t.key] && terms[t.key] !== t.anchor)
    .map(t => ({ from: terms[t.key], to: t.anchor }))
    .sort((a, b) => b.from.length - a.from.length);
  pairs.forEach(p => { text = text.split(p.from).join(p.to); });
  return text;
}

function getCurrentIndustry() {
  return localStorage.getItem("industry") || domain_industry;
}

// 把当前行业词还原为锚点词（education 默认词）。
// 仅还原显式标记 data-term 的元素文本为锚点词（opt-in，与 applyTerms 一致）。
// 不再做全局文本反向替换，避免把数据库数值里的行业词错误还原成锚点词。
function restoreAnchorTerms(root = document.body) {
  const industry = getCurrentIndustry();
  if (industry === "education") return; // education 的词本身就是锚点词，无需还原

  // data-term 元素：文本即整词，直接置回锚点词
  root.querySelectorAll("[data-term]").forEach(el => {
    const t = TERM_KEYS.find(k => k.key === el.dataset.term);
    if (t) el.textContent = t.anchor;
  });
}

function switchIndustry(industry) {
  if (!TERM_DICT[industry]) { console.warn("switchIndustry: 未知行业", industry); return; }
  // 1. 当前行业词 → 锚点词（归一化，保证 A→B→A 来回切换不出错）
  restoreAnchorTerms();
  // 2. 记录新行业
  localStorage.setItem("industry", industry);
  // 3. 按新表替换（锚点词 → 新行业词）
  applyTerms();
  // 4. 通知后端（可选：行业偏好存到用户档案，下次登录直接生效）
  // fetch('/api/user/preferences', {method:'PUT', body: JSON.stringify({industry})});
}

// 登录后从服务端拉取合并词表（租户词 > 行业词 > 平台词），成功后刷新一次页面词。
// 语言：从 localStorage.lang 读取（缺省 zh），未来做界面语言切换时只需 setItem('lang','en')
async function loadTermMapFromServer() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const lang = localStorage.getItem('lang') || 'zh';
    // 后端 JwtAuthenticationFilter 只认 `Bearer <token>`；此前直接传裸 token 恒返回 401，
    // 导致服务端三级合并词表（租户词 > 行业词 > 平台词）从未生效，只剩本地兜底词表。
    const auth = token.startsWith('Bearer ') ? token : ('Bearer ' + token);
    const res = await fetch((window.API_BASE_URL || '') + '/term/map?lang=' + encodeURIComponent(lang), {
      headers: { 'Authorization': auth }
    });
    const json = await res.json();
    if (json && json.code === 200 && json.data) {
      SERVER_TERM_MAP = json.data;
      applyTerms();
    }
  } catch (e) {
    // 拉取失败保持本地兜底（未登录 / 服务未起 / 网络异常）
  }
}

// 按登录用户的 tenantCode 查询所属行业，并切换到对应行业词表。
// 链路：tenantCode -> /tenant/industry -> sys_industry.code -> switchIndustry(code)
//
// 两点容错（缺一即会导致词表错乱）：
//   1) 后端可能返回前端尚无词表的行业（历史上 exercise 就缺 TERM_DICT，现已补齐：
//      education / legal / counseling / exercise）。switchIndustry 遇到未知行业会 warn
//      并直接 return，等价于什么都不做 —— 故这里先校验 TERM_DICT[code]，
//      未知行业保持现状（默认 education），不让页面停在半截状态。
//   2) 行业未配置 / 平台租户 / 接口异常时一律保持现状，由本地兜底词表继续工作。
//
// @param tenantCode 登录时确定的租户编码（localStorage.currentUser.tenantCode）
// @returns Promise<string|null> 实际生效的行业 key，未切换返回 null
async function syncIndustryFromTenant(tenantCode) {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const qs = tenantCode ? ('?tenantCode=' + encodeURIComponent(tenantCode)) : '';
    // 后端 JwtAuthenticationFilter 只认 `Bearer <token>`，缺前缀会直接 401
    const auth = token.startsWith('Bearer ') ? token : ('Bearer ' + token);
    const res = await fetch((window.API_BASE_URL || '') + '/tenant/industry' + qs, {
      headers: { 'Authorization': auth }
    });
    const json = await res.json();
    const code = (json && json.code === 200 && json.data) ? json.data.industryCode : null;
    if (!code || !TERM_DICT[code]) return null;          // 无行业 / 未知行业 → 保持现状
    const current = localStorage.getItem('industry') || domain_industry;
    if (current === code) return code;                    // 已是目标行业，不重复刷 DOM
    switchIndustry(code);                                 // 内部：还原锚点词 -> 记录新行业 -> 重新替换
    return code;
  } catch (e) {
    // 服务未起 / 未登录 / 网络异常：保持本地兜底
    return null;
  }
}

// 页面加载完成后，按已存行业对静态 HTML 应用一次术语替换
// （默认 education 时 DOM 本身就是锚点词，等于空操作；动态注入的内容由各渲染函数里的 applyTerms(container) 负责）
document.addEventListener("DOMContentLoaded", () => { applyTerms(); loadTermMapFromServer(); });

// 测试入口：在浏览器控制台执行 switchIndustry("legal") / switchIndustry("education")
// switchIndustry("legal");//ceshi 法律行业