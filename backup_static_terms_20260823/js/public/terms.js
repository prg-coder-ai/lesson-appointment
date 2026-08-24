//行业术语汇总
//```js
// static/js/public/terms.js
const domain_industry = "education";
const TERM_DICT = {
  // 教育行业（默认）
  education: {
    course:   "课程",
    teacher:  "教师",
    student:  "学生",
    booking:  "预订",
    schedule: "排期",
    appoimtnment: "预约",
    lessonTime: "上课时间",
    lessonUnit: "课时长",
    classForm: "课程形式",
    lessonType: "课程类型",
    p11: "一对一",
    p1N: "小班课",
    p2N: "中班课",
    teaching: "教学",
    startTeaching: "开课",
    endTeaching: "结课",
    lesson: "课程",
    lessonRoom: "教室",//或线上链接地址
    classFee: "课时费",
    // 按需扩展：booking=预约, schedule=排期, ...
  },
  // 法律咨询
  legal: {
    course:   "咨询话题",
    teacher:  "律师",
    student:  "咨询者",
    booking:  "预订",
    schedule: "档期",
    appoimtnment: "预约",
    lessonTime: "咨询时间",
    lessonUnit: "咨询时长",
    classForm: "咨询形式",
    lessonType: "咨询类型",
    p11: "一对一",
    p1N: "小咨询课",
    p2N: "中咨询课",
    teaching: "咨询",
    startTeaching: "开始咨询",
    endTeaching: "结束咨询",
    lesson: "咨询",
    lessonRoom: "会客室",
    classFee: "咨询费",

  },
  // 心理咨询 / 健身私教 / 家教 ... 后续按行业追加
  counseling: {
    course:  "咨询项目",
    teacher: "咨询师",
    student: "来访者",
    booking:  "预订",
    schedule: "档期",
    appoimtnment: "预约",
    lessonTime: "咨询时间",
    lessonUnit: "咨询时长",
    classForm: "咨询形式",
    lessonType: "咨询类型",
    p11: "一对一",
    p1N: "小咨询课",
    p2N: "中咨询课",
    teaching: "咨询",
    startTeaching: "开始咨询",
    endTeaching: "结束咨询",
    lesson: "咨询",
    lessonRoom: "会客室",
    classFee: "咨询费",
  },
};

// 正反向索引：中文关键词 → 术语 key（遍历替换用）
// 关键：以默认行业（education）的词为"锚点词"，
// 任何行业之间切换都以锚点词归一化，避免 A→B→C 连锁替换出错
const TERM_KEYS = [
  { key: "course",  anchor: "课程" },
  { key: "teacher", anchor: "教师" },
  { key: "student", anchor: "学生" },
  { key: "booking", anchor: "预订" },
  { key: "schedule", anchor: "排期" },
  { key: "appoimtnment", anchor: "预约" },
  { key: "lessonTime", anchor: "课程时间" },
  { key: "lessonUnit", anchor: "课程时长" },
  { key: "classForm", anchor: "课程形式" },
  { key: "lessonType", anchor: "课程类型" },
  { key: "p11", anchor: "一对一" },
  { key: "p1N", anchor: "小班课" },
  { key: "p2N", anchor: "中班课" },
  { key: "teaching", anchor: "教学" },
  { key: "startTeaching", anchor: "上课" },
  { key: "endTeaching", anchor: "结课" },
  { key: "lesson", anchor: "课程" },
  { key: "lessonRoom", anchor: "教室" },
  { key: "classFee", anchor: "课时费" },
 ];
//```

const PROTECTED_WORDS = ["王老师", "刘老师"];
 
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
