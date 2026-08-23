//行业术语汇总
// static/js/public/terms.js
// 锚点词与 data-term 标记一一对应；DOM 中永远存默认行业（education）的词。
// 2026-08-23：前端已完成 A/B 级术语 data-term 标记（约 120+ 处，备份在
// /backup_static_terms_20260823），key 清单见 TERM_KEYS。
const TERM_DICT = {
  // 教育行业（默认）
  education: {
    course:       "课程",
    teacher:      "教师",
    teacherAlt:   "老师",
    student:      "学生",
    lesson:       "上课",
    lessonTime:   "上课时间",
    lessonUnit:   "课时",
    teaching:     "授课",
    classForm:    "班级",
    classForm1p1: "一对一",
    classForm1pN: "小班课",
    classForm1p2N:"大班课",
  },
  // 法律咨询
  legal: {
    course:       "咨询话题",
    teacher:      "律师",
    teacherAlt:   "律师",
    student:      "咨询者",
    lesson:       "咨询",
    lessonTime:   "咨询时间",
    lessonUnit:   "咨询时长",
    teaching:     "执业",
    classForm:    "服务形式",
    classForm1p1: "个案咨询",
    classForm1pN: "小组咨询",
    classForm1p2N:"专题讲座",
  },
  // 心理咨询 / 健身私教 / 家教 ... 后续按行业追加
  counseling: {
    course:       "咨询项目",
    teacher:      "咨询师",
    teacherAlt:   "咨询师",
    student:      "来访者",
    lesson:       "咨询",
    lessonTime:   "咨询时间",
    lessonUnit:   "咨询次数",
    teaching:     "提供咨询",
    classForm:    "服务形式",
    classForm1p1: "一对一咨询",
    classForm1pN: "小组咨询",
    classForm1p2N:"团体咨询",
  },
};

// 正反向索引：中文关键词 → 术语 key（遍历替换用）
// 关键：以默认行业（education）的词为"锚点词"，
// 任何行业之间切换都以锚点词归一化，避免 A→B→C 连锁替换出错
// 注意处理顺序必须长词在前（上课时间 → 上课 → 课时），
// 且 teacherAlt(老师) 需先过 PROTECTED_WORDS 人名白名单
const TERM_KEYS = [
  { key: "lessonTime",   anchor: "上课时间" },
  { key: "lesson",       anchor: "上课" },
  { key: "course",       anchor: "课程" },
  { key: "teacher",      anchor: "教师" },
  { key: "teacherAlt",   anchor: "老师" },
  { key: "student",      anchor: "学生" },
  { key: "lessonUnit",   anchor: "课时" },
  { key: "teaching",     anchor: "授课" },
  { key: "classForm",    anchor: "班级" },
  { key: "classForm1p1", anchor: "一对一" },
  { key: "classForm1pN", anchor: "小班课" },
  { key: "classForm1p2N",anchor: "大班课" },
];

// 保护词：包含这些词的文本节点不做 teacherAlt 替换（人名误伤防护）
const PROTECTED_WORDS = ["王老师", "李老师", "刘老师"]; 
