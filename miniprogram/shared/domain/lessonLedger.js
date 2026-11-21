// 课时账本展示映射（零 DOM、零小程序 API、纯函数）
//
// 背景（2026-10-28）：课时扣减落地后，账本里存的是**编码与原始数值**：
//   · source：classroom / leave / manual / grant（英文枚举）
//   · changeLessons：-1.00 / 2.00（BigDecimal 序列化，可能带多余小数位）
//   · remainingLessons：允许负数（欠课时）
// 界面上不允许出现 `classroom` 这类裸编码，也不适合直接显示 `-1.00`。
// 两端（Web 学生端「我的课时」、小程序）共用本模块，避免各写一套映射必然漂移。

/** 流水来源编码 → 文案 */
export const LESSON_FLOW_SOURCE_TEXT = {
  classroom: '课堂扣减',
  leave: '请假退回',
  manual: '人工调整',
  grant: '课时充值'
};

/** 来源文案（未知编码回退原值，便于发现后端新增了没登记的来源） */
export function lessonSourceText(source) {
  if (!source) return '课时变动';
  return LESSON_FLOW_SOURCE_TEXT[source] || String(source);
}

/**
 * 课时数值格式化：去掉无意义的尾随 0（1.00 → 1、0.50 → 0.5），保留小数最多 2 位。
 * 非数值一律返回 '0'——展示层不该因为一个脏值整页崩掉。
 */
export function formatLessonAmount(value) {
  const n = Number(value);
  if (!isFinite(n)) return '0';
  return String(parseFloat(n.toFixed(2)));
}

/**
 * 变动课时的带符号文案：消耗为负数，所以 `-1` → '-1'、`2` → '+2'。
 * 不用 Unicode 减号（−）：复制到 Excel/客服话术里会变成不可见字符。
 */
export function lessonChangeText(value) {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return '0';
  const s = formatLessonAmount(Math.abs(n));
  return n > 0 ? '+' + s : '-' + s;
}

/**
 * 流水行标题：优先「课程名 · 第N课次」，缺课程名时退回来源文案。
 *
 * 为什么可能缺课程名：courseName 要经 booking → course_schedule 反查，
 * 排期被删除或历史脏数据时 join 不到，此时不能显示 "undefined"。
 */
export function lessonRowTitle(flow) {
  const f = flow || {};
  const name = f.courseName ? String(f.courseName) : '';
  const idx = Number(f.classIndex);
  const idxText = isFinite(idx) && idx > 0 ? '第' + idx + '课次' : '';
  if (name && idxText) return name + ' · ' + idxText;
  if (name) return name;
  if (idxText) return idxText;
  return lessonSourceText(f.source);
}

/**
 * 课时账户色调：owed（欠课时）/ empty（已用完）/ normal（正常）。
 * 只返回语义，颜色交给各端 CSS——Web 深色主题与小程序主题取值不同。
 */
export function lessonBalanceTone(balance) {
  const b = balance || {};
  if (b.owed) return 'owed';
  const n = Number(b.remainingLessons);
  if (isFinite(n) && n === 0) return 'empty';
  return 'normal';
}
