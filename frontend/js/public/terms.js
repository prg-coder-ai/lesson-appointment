//行业术语汇总
// static/js/public/terms.js
// 锚点词与 data-term 标记一一对应；DOM 中永远存默认行业（education）的词。
// 2026-08-23：前端已完成 A/B 级术语 data-term 标记（约 120+ 处，备份在
// /backup_static_terms_20260823），key 清单见 TERM_KEYS。
const TERM_DICT = {
  // 教育行业（默认）
  education: {
    lessonSystem: "语言教学预约系统",
    course:       "课程",
    schedule:     "排期",
    
    teacher:      "教师",
    teacherAlt:   "老师",
    student:      "学生",
    lesson:       "上课",
    lessonTime:   "上课时间",
    lessonUnit:   "课时",
    teaching:     "授课",
    lessonNumber: "课次",
    courseName:   "课程名称",
    leave:        "请假",
    lessonFee:    "课时费",

    content:      "教学内容",
    classForm:    "班级形式",
    classForm1p1: "一对一",
    classForm1pN: "小班课",
    classForm1p2N:"大班课",
    
      classLevel: "难度等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",

     classType1: "法语",
    classType2: "英语",
    classType3: "汉语",
    classType4: "西语",
    classType : "语言类型", 

    lessonDuration: "课时长度(分钟)"
  },
  // 法律咨询
  legal: {
    lessonSystem: "法律咨询预约系统",
    course:       "咨询话题",
    teacher:      "律师",
    teacherAlt:   "律师",
    student:      "咨询者",
    lesson:       "咨询",
    lessonTime:   "咨询时间",
    lessonUnit:   "咨询时长",
    teaching:     "执业",
    lessonFee:    "咨询费",
    content:      "咨询内容",
    lessonNumber: "咨询次序",
    courseName:   "咨询话题",
    leave:        "改期",
    
    classForm:    "服务形式",
    classForm1p1: "个案咨询",
    classForm1pN: "小组咨询",
    classForm1p2N:"专题讲座",
    
      classLevel: "咨询等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",
   
    classType1: "婚姻",
    classType2: "劳动",
    classType3: "刑事",
    classType4: "行政",
    classType : "咨询范畴",
    lessonDuration: "预约时长(分钟)"
  },
  // 心理咨询 / 健身私教 / 家教 ... 后续按行业追加
  counseling: {
    lessonSystem: "心理咨询预约系统",
    course:       "咨询项目",
    teacher:      "咨询师",
    teacherAlt:   "咨询师",
    student:      "来访者",
    lesson:       "咨询",
    lessonTime:   "咨询时间",
    lessonUnit:   "咨询时长",
    teaching:     "提供咨询",
    lessonFee:    "咨询费",

    lessonNumber: "咨询次序",
    courseName:   "咨询项目",
    leave:        "改期",
    
    classForm:    "服务形式",
    classForm1p1: "一对一咨询",
    classForm1pN: "小组咨询",
    classForm1p2N:"团体咨询",

    classLevel: "咨询等级", 
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",

    classType : "咨询类型",
    classType1: "婚姻",
    classType2: "情感",
    classType3: "成长",
    content:      "教学内容",
    classType4: "育儿",
    serialNumber: "序号",
    lessonDuration: "预约时长(分钟)"

    },
  // 健身行业（sys_industry.id=7, code=exercise；租户 ORG05 五人行健身俱乐部）
  // 词条取值与 sys_term(industry_id=7, language='zh') 保持一致 —— 服务端 /term/map
  // 三级合并（租户词 > 行业词 > 平台词）会逐 key 覆盖本地值，本地字典只承担两件事：
  //   1) 兜底：未登录 / 服务未起 / 接口异常时仍有完整词表可用；
  //   2) 开关：switchIndustry() 与 syncIndustryFromTenant() 都以 TERM_DICT[code] 存在为前提，
  //      缺这个词表时二者会直接 return，行业根本切不过来。
  // 服务端 industry_id=7 未配置的 schedule / classLevelB1~B4 / serialNumber 三项，
  // 沿用 education 的行业中性文案，避免落空后 UI 露出锚点词。
  exercise: {
    lessonSystem: "健身教练预约系统",
    course:       "健身科目",
    schedule:     "排期",

    teacher:      "教练",
    teacherAlt:   "教练",
    student:      "训练者",
    lesson:       "训练课程",
    lessonTime:   "预约时间",
    lessonUnit:   "训练时长",
    teaching:     "练习",
    lessonNumber: "课次",
    courseName:   "科目名称",
    leave:        "改期",
    lessonFee:    "课时费用",

    content:      "锻炼内容",
    classForm:    "服务形式",
    classForm1p1: "1对1",
    classForm1pN: "小组陪练",
    classForm1p2N:"专题训练",

    classLevel:   "难度等级",
    classLevelB1: "B1入门",
    classLevelB2: "B2初级",
    classLevelB3: "B3中级",
    classLevelB4: "B4高级",

    classType:    "健身类型",
    classType1:   "力量训练",
    classType2:   "灵巧训练",
    classType3:   "肌肉训练",
    classType4:   "爆发力",

    serialNumber: "序号",
    lessonDuration: "预约时长(分钟)"
  }
};

// 正反向索引：中文关键词 → 术语 key（遍历替换用）
// 关键：以默认行业（education）的词为"锚点词"，
// 任何行业之间切换都以锚点词归一化，避免 A→B→C 连锁替换出错
// 注意处理顺序必须长词在前（上课时间 → 上课 → 课时），
// 且 teacherAlt(老师) 需先过 PROTECTED_WORDS 人名白名单
const TERM_KEYS = [
  { key: "lessonSystem", anchor: "语言教学预约系统" },
  { key: "lessonTime",   anchor: "上课时间" },
  { key: "lesson",       anchor: "上课" },
  { key: "course",       anchor: "课程" },
  { key: "teacher",      anchor: "教师" },
  { key: "teacherAlt",   anchor: "老师" },
  { key: "lessonFee",    anchor: "课时费" },
  { key: "student",      anchor: "学生" },
  { key: "lessonUnit",   anchor: "课时" },
  { key: "teaching",     anchor: "授课" },

  { key: "classForm",    anchor: "班级形式" },
  { key: "classForm1p1", anchor: "一对一" },
  { key: "classForm1pN", anchor: "小班课" },
  { key: "classForm1p2N",anchor: "大班课" },
  
  { key: "classLevel", anchor: "难度等级" },
  { key: "classLevelB1", anchor: "B1入门" },
  { key: "classLevelB2", anchor: "B2初级" },
  { key: "classLevelB3", anchor: "B3中级" },
  { key: "classLevelB4", anchor: "B4高级" },

  { key: "classType", anchor: "语言类型" },
  { key: "classType1", anchor: "英语" },
  { key: "classType2", anchor: "法语" },
  { key: "classType3", anchor: "韩语" },
  { key: "classType4", anchor: "西语" },
  { key: "leave", anchor: "请假" },
];

// 保护词：包含这些词的文本节点不做 teacherAlt 替换（人名误伤防护）
const PROTECTED_WORDS = ["王老师", "李老师", "刘老师"]; 
