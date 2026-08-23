
let domain_industry = "education";

// 对某个根节点（默认整个 body）执行一次术语替换
 function applyTerms(root = document.body) {
  const terms = TERM_DICT[getCurrentIndustry()] || TERM_DICT.education;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "OPTION"]);
  // 注意：input 的 value 不属于文本节点，单独处理

  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const tag = n.parentElement && n.parentElement.tagName;
    if (tag && skipTags.has(tag)) continue;
    if (n.nodeValue && TERM_KEYS.some(t => n.nodeValue.includes(t.anchor))) {
      nodes.push(n);
    }
  }
  nodes.forEach(n => {
    let s = n.nodeValue;
    TERM_KEYS.forEach(t => { s = s.split(t.anchor).join(terms[t.key]); });
    n.nodeValue = s;
  });

  // 同步处理 data-term 标记的元素（方案 A 的渐进入口）
  root.querySelectorAll("[data-term]").forEach(el => {
    const key = el.dataset.term;
    if (terms[key]) el.textContent = terms[key];
  });

  // placeholder / title 等 HTML 属性
  root.querySelectorAll("[data-term-placeholder]").forEach(el => {
    const key = el.dataset.termPlaceholder;
    if (terms[key]) el.placeholder = terms[key];
  });

  // <option> 文本已被 TreeWalker 排除的话取消 skipTags 中的 OPTION（见 3.5 注意事项）
}
 
// 把含行业词的字符串还原为锚点词字符串（纯字符串处理，不动 DOM）。
// 用途：菜单导航 switch 按文字匹配（如 case '课程排期'），
// 而 applyTerms 已把菜单文字换成行业词（如"咨询话题排期"），
// 匹配前先经此函数归一化，保证任何行业下导航逻辑都能命中。
function normalizeTermText(text) {
  if (!text || typeof text !== "string") return text;
  const industry = getCurrentIndustry();
  const terms = TERM_DICT[industry];
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
// 关键：只遍历文本节点改 nodeValue，绝不用 textContent 赋值（那会清空元素的全部子节点）
function restoreAnchorTerms(root = document.body) {
  const industry = getCurrentIndustry();
  const oldTerms = TERM_DICT[industry];
  if (!oldTerms || industry === "education") return; // education 的词本身就是锚点词，无需还原

  // 反向替换对：行业词 → 锚点词；必须长词在前
  // （如 legal 的 "咨询时间"/"咨询时长" 要先于 "咨询" 处理，否则 "咨询时长" 会被拆成 "上课时长"）
  const pairs = TERM_KEYS
    .filter(t => oldTerms[t.key] && oldTerms[t.key] !== t.anchor)
    .map(t => ({ from: oldTerms[t.key], to: t.anchor }))
    .sort((a, b) => b.from.length - a.from.length);

  // data-term 元素：文本即整词，直接置回锚点词
  root.querySelectorAll("[data-term]").forEach(el => {
    const t = TERM_KEYS.find(k => k.key === el.dataset.term);
    if (t) el.textContent = t.anchor;
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "OPTION"]);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    const tag = n.parentElement && n.parentElement.tagName;
    if (tag && skipTags.has(tag)) continue;
    if (n.nodeValue && pairs.some(p => n.nodeValue.includes(p.from))) nodes.push(n);
  }
  nodes.forEach(n => {
    let s = n.nodeValue;
    pairs.forEach(p => { s = s.split(p.from).join(p.to); });
    n.nodeValue = s;
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
  console.log("switchIndustry to",industry);
}

// 页面加载完成后，按已存行业对静态 HTML 应用一次术语替换
// （默认 education 时 DOM 本身就是锚点词，等于空操作；动态注入的内容由各渲染函数里的 applyTerms(container) 负责）
document.addEventListener("DOMContentLoaded", () => applyTerms());

// 测试入口：在浏览器控制台执行 switchIndustry("legal") / switchIndustry("education")
// switchIndustry("legal");//ceshi 法律行业