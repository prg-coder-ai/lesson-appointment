// 跨端共享：行业术语词典与纯函数（无 DOM 依赖）
// 数据从 frontend/js/public/terms.js 与 enumTerms.js 迁移而来，作为唯一权威源。
// Web 端后续可经 build 桥接把本文件挂到 window；小程序端经 sync 拷贝后直接 import。

export const TERM_DICT = {
  // 教育行业（默认）
  education: {
    lessonSystem: "语言教学预约系统",
    course: "课程",
    schedule: "排期",
    teacher: "教师",
    teacherAlt: "老师",
    student: "学生",
    lesson: "上课",
    lessonTime: "上课时间",
    lessonUnit: "课时",
    teaching: "授课",
    lessonNumber: "课次",
    courseName: "课程名称",
    leave: "请假",
    lessonFee: "课时费",
    content: "教学内容",
    classForm: "班级形式",
    classForm1p1: "一对一",
    classForm1pN: "小班课",
    classForm1p2N: "大班课",
    classLevel: "难度等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",
    classType1: "法语",
    classType2: "英语",
    classType3: "汉语",
    classType4: "西语",
    classType: "语言类型",
    lessonDuration: "课时长度(分钟)",
    subject: "学科",
    teacherBio: "教师简介"
  },
  // 法律咨询
  legal: {
    lessonSystem: "法律咨询预约系统",
    course: "咨询话题",
    teacher: "律师",
    teacherAlt: "律师",
    student: "咨询者",
    lesson: "咨询",
    lessonTime: "咨询时间",
    lessonUnit: "咨询时长",
    teaching: "执业",
    lessonFee: "咨询费",
    content: "咨询内容",
    lessonNumber: "咨询次序",
    courseName: "咨询话题",
    leave: "改期",
    classForm: "服务形式",
    classForm1p1: "个案咨询",
    classForm1pN: "小组咨询",
    classForm1p2N: "专题讲座",
    classLevel: "咨询等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",
    classType1: "婚姻",
    classType2: "劳动",
    classType3: "刑事",
    classType4: "行政",
    classType: "咨询范畴",
    lessonDuration: "预约时长(分钟)",
    subject: "咨询范畴",
    teacherBio: "律师简介"
  },
  // 心理咨询
  counseling: {
    lessonSystem: "心理咨询预约系统",
    course: "咨询项目",
    teacher: "咨询师",
    teacherAlt: "咨询师",
    student: "来访者",
    lesson: "咨询",
    lessonTime: "咨询时间",
    lessonUnit: "咨询时长",
    teaching: "提供咨询",
    lessonFee: "咨询费",
    lessonNumber: "咨询次序",
    courseName: "咨询项目",
    leave: "改期",
    classForm: "服务形式",
    classForm1p1: "一对一咨询",
    classForm1pN: "小组咨询",
    classForm1p2N: "团体咨询",
    classLevel: "咨询等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",
    classType: "咨询类型",
    classType1: "婚姻",
    classType2: "情感",
    classType3: "成长",
    classType4: "育儿",
    content: "教学内容",
    serialNumber: "序号",
    lessonDuration: "预约时长(分钟)"
  },
  // 健身
  exercise: {
    lessonSystem: "健身教练预约系统",
    course: "健身科目",
    schedule: "排期",
    teacher: "教练",
    teacherAlt: "教练",
    student: "训练者",
    lesson: "训练课程",
    lessonTime: "预约时间",
    lessonUnit: "训练时长",
    teaching: "练习",
    lessonNumber: "课次",
    courseName: "科目名称",
    leave: "改期",
    lessonFee: "课时费用",
    content: "锻炼内容",
    classForm: "服务形式",
    classForm1p1: "1对1",
    classForm1pN: "小组陪练",
    classForm1p2N: "专题训练",
    classLevel: "难度等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",
    classType: "健身类型",
    classType1: "力量训练",
    classType2: "灵巧训练",
    classType3: "肌肉训练",
    classType4: "爆发力",
    serialNumber: "序号",
    lessonDuration: "预约时长(分钟)"
  }
};

export const TERM_KEYS = [
  { key: "lessonSystem", anchor: "语言教学预约系统" },
  { key: "lessonTime", anchor: "上课时间" },
  { key: "lesson", anchor: "上课" },
  { key: "course", anchor: "课程" },
  { key: "teacher", anchor: "教师" },
  { key: "teacherAlt", anchor: "老师" },
  { key: "lessonFee", anchor: "课时费" },
  { key: "student", anchor: "学生" },
  { key: "lessonUnit", anchor: "课时" },
  { key: "teaching", anchor: "授课" },
  { key: "classForm", anchor: "班级形式" },
  { key: "classForm1p1", anchor: "一对一" },
  { key: "classForm1pN", anchor: "小班课" },
  { key: "classForm1p2N", anchor: "大班课" },
  { key: "classLevel", anchor: "难度等级" },
  { key: "classLevelB1", anchor: "B1入门" },
  { key: "classLevelB2", anchor: "B2初级" },
  { key: "classLevelB3", anchor: "B3中级" },
  { key: "classLevelB4", anchor: "B4高级" },
  { key: "classType", anchor: "语言类型" },
  { key: "classType1", anchor: "法语" },
  { key: "classType2", anchor: "英语" },
  { key: "classType3", anchor: "汉语" },
  { key: "classType4", anchor: "西语" },
  { key: "leave", anchor: "请假" }
];

export const PROTECTED_WORDS = ["王老师", "李老师", "刘老师"];

// 行业中文展示名（仅中文；"只考虑中文"场景下 mine 页"行业"行用）
export const INDUSTRY_NAMES = {
  education: '教育',
  legal: '法律咨询',
  counseling: '心理咨询',
  exercise: '健身'
};

export const COURSE_TYPE_OPTIONS = [
  { value: 'french', termKey: 'classType1', anchor: '法语' },
  { value: 'english', termKey: 'classType2', anchor: '英语' },
  { value: 'chinese', termKey: 'classType3', anchor: '汉语' },
  { value: 'spanish', termKey: 'classType4', anchor: '西语' }
];

const COURSE_TYPE_ALIAS = {
  fr: 'french', french: 'french',
  en: 'english', english: 'english',
  zh: 'chinese', cn: 'chinese', chinese: 'chinese',
  es: 'spanish', sp: 'spanish', spanish: 'spanish',
  '法语': 'french', '英语': 'english', '英文': 'english',
  '汉语': 'chinese', '中文': 'chinese', '国语': 'chinese',
  '西语': 'spanish', '西班牙语': 'spanish'
};

// ctx: { industry, serverMap, lang }
export function getTerms(ctx) {
  const industry = (ctx && ctx.industry) || 'education';
  const base = TERM_DICT[industry] || TERM_DICT.education;
  if (!ctx || !ctx.serverMap) return base;
  return Object.assign({}, base, ctx.serverMap);
}

export function termText(key, ctx) {
  if (!key) return '';
  const terms = getTerms(ctx);
  if (terms[key] != null && terms[key] !== '') return terms[key];
  if (TERM_DICT.education[key] != null) return TERM_DICT.education[key];
  return String(key);
}

export function getOptions(tagKey, fallbackOptions, ctx) {
  const terms = getTerms(ctx);
  return (fallbackOptions || []).map(o => {
    const key = tagKey + '.' + (o.code != null ? o.code : o.value);
    return { value: o.value, text: (terms[key] != null && terms[key] !== '') ? terms[key] : (o.defaultText || o.value) };
  });
}

export function normalizeCourseType(code) {
  if (code === null || code === undefined) return '';
  const s = String(code).trim();
  if (!s) return '';
  const low = s.toLowerCase();
  return COURSE_TYPE_ALIAS[low] || COURSE_TYPE_ALIAS[s] || low;
}

export function courseTypeText(code, ctx) {
  const s = (code === null || code === undefined) ? '' : String(code).trim();
  if (!s) return '';
  const c = normalizeCourseType(s);
  const opt = COURSE_TYPE_OPTIONS.find(o => o.value === c);
  if (!opt) return s;
  return termText(opt.termKey, ctx);
}

export function enumTermText(prefix, code, ctx) {
  const s = (code === null || code === undefined) ? '' : String(code).trim();
  if (!s) return '';
  const t = getTerms(ctx)[prefix + s];
  return (t != null && t !== '') ? t : s;
}
