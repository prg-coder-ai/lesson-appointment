
// 对某个根节点（默认整个 body）执行一次术语替换
export function applyTerms(root = document.body) {
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
 
function getCurrentIndustry() {
  return localStorage.getItem("industry") || domain_industry;
}

function switchIndustry(industry) {
  // 1. 先把当前行业的词还原为锚点词（默认词）
  const oldTerms = TERM_DICT[getCurrentIndustry()];
  if (getCurrentIndustry() !== industry) {
    document.querySelectorAll("*").forEach(el => { /* 同 3.2 的遍历，反向替换 oldTerms → anchor */ 

        el.textContent = el.textContent.replace(oldTerms[t.key], t.anchor);
        }); 
  }
  // 2. 记录新行业
  localStorage.setItem("industry", industry);
  // 3. 按新表替换
  applyTerms();
  // 4. 通知后端（可选：行业偏好存到用户档案，下次登录直接生效）
  // fetch('/api/user/preferences', {method:'PUT', body: JSON.stringify({industry})});
}
 
switchIndustry("legal");//ceshi 法律行业