// 教师排期编辑：新增/编辑排期（create / update）。
// 字段对齐 ScheduleCreateDTO（repeatType: 0不重复/1每天/2每周/3每月）。
//
// 与后端的三个硬约束（都来自 course_schedule 表结构，漏一个就 500，故在客户端先拦）：
//   1. time_zone  varchar NOT NULL 且无默认值，而 insertSchedule 是显式列清单
//      （见 mybatis/mapper/courseScheduleMapper.xml）→ 不带时区直接报
//      "Column 'time_zone' cannot be null"；故新增时必须给值（优先继承该教师历史排期时区）。
//   2. name       varchar NOT NULL → 空名称不能再传 undefined（会显式写 NULL），
//      用「排在名称 > 课程名 > 行业词」逐级兜底。
//   3. CHECK (end_time > start_time) → 结束时间不晚于开始时间时先在前端拦下。
// 另：available_sites 是 tinyint(1)，取值 1..127，超出会被 MySQL 截断/报错。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { ROLES } from '../../shared/constants.js';

// 状态：与排期列表页 STATUS_TEXT 同口径（待发布/已发布/已冻结/已收回）。
// 原实现用 switch 当二值开关，只能表达 active/frozen —— 一个 pending 排期只要进编辑页保存一次，
// 就会被静默改写成 frozen（数据被改而用户没改过状态）。
const STATUS_OPTS = [
  { v: 'pending', label: '待发布' },
  { v: 'active', label: '已发布' },
  { v: 'frozen', label: '已冻结' },
  { v: 'inactive', label: '已收回' }
];

const REPEAT_OPTS = [
  { v: 0, label: '不重复' },
  { v: 1, label: '每天' },
  { v: 2, label: '每周' },
  { v: 3, label: '每月' }
];
const WEEK_DAYS = [
  { v: 1, label: '一' }, { v: 2, label: '二' }, { v: 3, label: '三' },
  { v: 4, label: '四' }, { v: 5, label: '五' }, { v: 6, label: '六' }, { v: 7, label: '日' }
];
// 每月：1..31。后端 repeat_days 在 repeat_type=3 时语义就是「当月的哪几天」，
// 且 ScheduleCreateDTO.repeatDays 是 List<Integer>、ScheduleGenerator 用 contains(dayOfMonth) 匹配，
// 所以这里也应该是多选（对齐 Web 端 teacher-courseAndScheduleBrowserCards.js 的 #monthDays 复选框）。
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// 选中态必须由 JS 预先算出并写进数组项（item.on），WXML 只做属性读取。
// 反面教材（原本就是这么写的、也正是「点了没反应」的根因）：
//   class="chip {{form.repeatDays.indexOf(item.v) >= 0 ? 'on' : ''}}"
// WXML 数据绑定只支持 三元/算数/逻辑/字符串拼接/属性与下标取值，**不支持函数调用**，
// indexOf(...) 在编译期就失败，整个插值静默渲染成空 → 'on' 永远加不上，
// 于是点击虽改到了 form.repeatDays，界面上却毫无变化。
const MONTH_DAY_OPTS = MONTH_DAYS.map(n => ({ v: n, label: String(n) }));

function withSel(list, selSet) {
  return list.map(d => ({ v: d.v, label: d.label, on: selSet.has(d.v) }));
}

const SITES_MIN = 1;
const SITES_MAX = 127;              // tinyint(1) 上限
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 99;
const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
const REPEAT_UNIT = { 1: '天', 2: '周', 3: '月' };

// PageResult 的字段名是 rows（不是 list / records）——取错会静默 fallback 成空数组。
function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

function toNum(v, dft) {
  const n = parseInt(v, 10);
  return isFinite(n) ? n : dft;
}
function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

Page(withTerms({
  data: {
    mode: 'add', id: '', teacherId: '', role: '',
    courses: [], courseIndex: -1, courseName: '', courseLabel: '',
    form: {
      courseId: '', name: '',
      startDate: '', startTime: '09:00', endDate: '', endTime: '10:00',
      // 重复：repeatType 0/1/2/3；repeatDays 既有「每周星期(1-7)」也有「每月日期(1-31)」两种语义，
      // 由 repeatType 决定，后端同列存储（repeat_days）
      repeatType: 0, repeatDays: [],
      // 数值输入统一用字符串承载：清空时不能反弹成 1，否则「删掉 15 想输 5」会变成 「1」+「5」=15
      intervalInput: '1', sitesInput: '1',
      timeZone: '', status: 'active'
    },
    // picker 的取值下标单独放页面层，form.status 才是提交口径
    statusIndex: 1,
    repeatOpts: REPEAT_OPTS, statusOpts: STATUS_OPTS,
    // 每项带 on 标记，供模板直接读（模板不能调 indexOf）
    weekDays: withSel(WEEK_DAYS, new Set()),
    monthDays: withSel(MONTH_DAY_OPTS, new Set()),
    repeatUnit: '天',
    sitesMin: SITES_MIN, sitesMax: SITES_MAX,
    submitting: false
  },

  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    const mode = options.mode === 'edit' ? 'edit' : 'add';
    this.setData({ mode, id: options.id || '', teacherId: u.userId, role: u.role || '' });
    this.applyTitle();
    // 课程带入：从「我的课程 → 该课程排期 → 新增」进来的 courseId/courseName
    const presetCourseId = options.courseId ? decodeURIComponent(options.courseId) : '';
    const presetCourseName = options.courseName ? decodeURIComponent(options.courseName) : '';
    this.boot(mode, options.id || '', presetCourseId, presetCourseName);
  },

  onShow() { this.applyTitle(); },

  // 导航栏标题走行业词（教育「排期」）；json 的 navigationBarTitleText 只作首帧兜底
  applyTitle() {
    const w = this.tr('schedule', '排期');
    wx.setNavigationBarTitle({ title: (this.data.mode === 'edit' ? '编辑' : '新建') + w });
  },

  tr(key, fb) { const t = this.data.terms || {}; return t[key] || fb; },

  // 由 form.repeatDays 派生两个多选网格的选中态；与 repeatDays 放在同一次 setData 里提交，
  // 避免「先渲染数据、再渲染高亮」的两帧闪烁，也保证两者永远同源不漂移。
  daySelPatch(days) {
    const set = new Set((days || []).map(Number));
    return { weekDays: withSel(WEEK_DAYS, set), monthDays: withSel(MONTH_DAY_OPTS, set) };
  },

  async boot(mode, id, presetCourseId, presetCourseName) {
    // 课程列表必须先就绪，编辑模式的课程回显才准：原实现 loadCourses() 与 loadDetail()
    // 并发发出，findIndex 常常跑在 courses 还是 [] 的时候 → courseIndex 恒为 -1 →
    // picker 显示「请选择课程」，看起来就像「课程没带入」。
    await this.loadCourses(presetCourseId, presetCourseName);
    if (mode === 'edit' && id) {
      await this.loadDetail(id);
    } else {
      if (presetCourseId) this.applyCourse(presetCourseId, presetCourseName);
      // 新增：给 time_zone 一个值（NOT NULL 无默认，必须带）
      await this.loadDefaultTimeZone();
    }
  },

  // 课程下拉数据源。与「我的课程」页同源（/course/page + teacherId），
  // 只列本人课程，避免教师在几百门课的全租户列表里翻找。
  async loadCourses(presetCourseId, presetCourseName) {
    let list = [];
    try {
      const params = { pageNum: 1, pageSize: 200 };
      // 仅教师按 teacherId 过滤；管理员进本页时不过滤（退回本租户全部课程）
      if (this.data.role === ROLES.TEACHER) params.teacherId = this.data.teacherId;
      const res = await request({ url: ENDPOINTS.COURSE_PAGE, method: 'GET', params, customErrorMsg: false });
      list = pickRows(res).map(x => ({
        courseId: x.courseId,
        courseName: x.courseName || x.title || x.courseId
      }));
    } catch (e) {
      // 分页接口异常时退回 /course/list（Result<List<Course>>），不阻断表单
      try {
        const c = await request({ url: ENDPOINTS.COURSE_LIST, method: 'GET', customErrorMsg: false });
        list = pickRows(c).map(x => ({
          courseId: x.courseId,
          courseName: x.courseName || x.title || x.courseId
        }));
      } catch (e2) { list = []; }
    }
    // 带入的课程可能不在当前页/不在上面的结果里（分页只取前 N 条，或课程刚新建）。
    // 不补进列表的话 picker 选不中它，courseIndex=-1，带入等于没带。
    if (presetCourseId && !list.some(c => String(c.courseId) === String(presetCourseId))) {
      const extra = await this.fetchCourseBrief(presetCourseId, presetCourseName);
      if (extra) list = [extra].concat(list);
    }
    this.setData({ courses: list });
  },

  async fetchCourseBrief(courseId, courseName) {
    try {
      const c = await request({ url: ENDPOINTS.COURSE_DETAIL(courseId), method: 'GET', customErrorMsg: false });
      if (c) {
        return { courseId, courseName: c.courseName || c.title || courseName || courseId };
      }
    } catch (e) { /* 详情取不到就用带入的名称兜底 */ }
    return courseName ? { courseId, courseName } : null;
  },

  // 选中课程：同步 courseIndex（picker 回显）+ form.courseId，
  // 并在「排期名称」为空时用课程名做默认值（空名称会被后端写成 'noname'，不可读）
  applyCourse(courseId, courseName) {
    const i = this.data.courses.findIndex(c => String(c.courseId) === String(courseId));
    const c = i >= 0 ? this.data.courses[i] : null;
    const name = (c && c.courseName) || courseName || '';
    const form = this.data.form;
    const keepOld = form.name && form.name !== this.data.courseName;
    this.setData({
      courseIndex: i,
      courseName: name,
      courseLabel: (c && c.courseName) || name || '',
      form: Object.assign({}, form, { courseId, name: keepOld ? form.name : (name || form.name) })
    });
  },

  async loadDetail(id) {
    try {
      const s = await request({ url: ENDPOINTS.SCHEDULE_DETAIL(id), method: 'GET' });
      const startDate = (s.startTime || '').slice(0, 10);
      const startTime = (s.startTime || '').slice(11, 16);
      const endDate = (s.endTime || '').slice(0, 10);
      const endTime = (s.endTime || '').slice(11, 16);
      const days = s.repeatDays
        ? String(s.repeatDays).split(',').map(Number).filter(n => !isNaN(n))
        : [];
      const repeatType = toNum(s.repeatType, 0);
      const selDays = (repeatType === 2 || repeatType === 3) ? days : [];
      const status = s.status || 'active';
      const si = STATUS_OPTS.findIndex(o => o.v === status);
      // 该排期的课程也可能不在下拉列表里（课上超过一页、课程已下架、非本人课程）：
      // 不补进来的话 picker 只能显示裸 courseId，等于「课程没带入」。
      let ci = this.data.courses.findIndex(c => String(c.courseId) === String(s.courseId));
      if (ci < 0 && s.courseId) {
        const extra = await this.fetchCourseBrief(s.courseId, '');
        if (extra) {
          this.setData({ courses: [extra].concat(this.data.courses) });
          ci = 0;
        }
      }
      this.setData(Object.assign({
        courseIndex: ci,
        statusIndex: si >= 0 ? si : 1,
        courseName: (ci >= 0 && this.data.courses[ci].courseName) || s.courseId || '',
        courseLabel: (ci >= 0 && this.data.courses[ci].courseName) || s.courseId || '',
        repeatUnit: REPEAT_UNIT[repeatType] || '天',
        form: {
          courseId: s.courseId || '',
          name: s.name || '',
          startDate, startTime: startTime || '09:00', endDate, endTime: endTime || '10:00',
          repeatType,
          repeatDays: selDays,
          intervalInput: String(s.repeatInterval == null || s.repeatInterval < INTERVAL_MIN ? 1 : s.repeatInterval),
          sitesInput: String(s.availableSites == null || s.availableSites < SITES_MIN ? SITES_MIN : s.availableSites),
          // 编辑沿用库中时区，绝不在编辑时改写（时区一变，同一排期在不同人眼里就是不同时间）
          timeZone: s.timeZone || '',
          status
        }
      }, this.daySelPatch(selDays)));
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },

  // 新增时的时区来源：优先继承该教师已有排期的时区（同一教师口径一致），
  // 无历史排期才退回默认值。
  async loadDefaultTimeZone() {
    let tz = DEFAULT_TIME_ZONE;
    try {
      const rows = await request({
        url: ENDPOINTS.SCHEDULE_LIST_BY_TEACHER(this.data.teacherId),
        method: 'GET', customErrorMsg: false
      });
      const found = pickRows(rows).map(s => s && s.timeZone).find(Boolean);
      if (found) tz = found;
    } catch (e) { /* 取不到就用默认时区 */ }
    this.defaultTimeZone = tz;
    this.setData({ 'form.timeZone': this.data.form.timeZone || tz });
  },

  onCourse(e) {
    const c = this.data.courses[toNum(e.detail.value, -1)];
    if (!c) return;
    this.applyCourse(c.courseId, c.courseName);
  },
  onName(e) { this.setData({ 'form.name': e.detail.value }); },
  onStartDate(e) { this.setData({ 'form.startDate': e.detail.value }); },
  onStartTime(e) { this.setData({ 'form.startTime': e.detail.value }); },
  onEndDate(e) { this.setData({ 'form.endDate': e.detail.value }); },
  onEndTime(e) { this.setData({ 'form.endTime': e.detail.value }); },

  onRepeat(e) {
    const v = REPEAT_OPTS[toNum(e.detail.value, 0)].v;
    // 原实现把清理写到了 data.repeatDays / data.monthDay —— 页面顶层根本没有这两个字段，
    // form 里上一轮选中的星期/日期原样留着 → 从「每周」切到「每天/每月」后旧值仍会被提交。
    this.setData(Object.assign({
      'form.repeatType': v,
      'form.repeatDays': [],
      repeatUnit: REPEAT_UNIT[v] || '天'
    }, this.daySelPatch([])));
  },

  // 每周星期 与 每月日期 共用同一个多选处理器（都落在 form.repeatDays，语义由 repeatType 决定）
  onDayPick(e) {
    const v = toNum(e.currentTarget.dataset.v, 0);
    if (!v) return;
    const set = new Set((this.data.form.repeatDays || []).map(Number));
    if (set.has(v)) set.delete(v); else set.add(v);
    const next = Array.from(set).sort((a, b) => a - b);
    // 选中态与数据同一次 setData 提交：模板只读 item.on，不再在 WXML 里做任何计算
    this.setData(Object.assign({ 'form.repeatDays': next }, this.daySelPatch(next)));
  },

  onIntervalInput(e) {
    this.setData({ 'form.intervalInput': String(e.detail.value || '').replace(/[^\d]/g, '') });
  },
  onIntervalBlur() {
    const n = clamp(toNum(this.data.form.intervalInput, INTERVAL_MIN), INTERVAL_MIN, INTERVAL_MAX);
    this.setData({ 'form.intervalInput': String(n) });
  },

  onSitesInput(e) {
    // 只保留数字：中间态允许为空字符串，否则「清空重输」会被强制回填成 1
    this.setData({ 'form.sitesInput': String(e.detail.value || '').replace(/[^\d]/g, '') });
  },
  onSitesBlur() {
    const n = clamp(toNum(this.data.form.sitesInput, SITES_MIN), SITES_MIN, SITES_MAX);
    this.setData({ 'form.sitesInput': String(n) });
  },
  onSitesStep(e) {
    const d = toNum(e.currentTarget.dataset.d, 0);
    const cur = clamp(toNum(this.data.form.sitesInput, SITES_MIN), SITES_MIN, SITES_MAX);
    const next = clamp(cur + d, SITES_MIN, SITES_MAX);
    if (next === cur) {
      wx.showToast({ title: `名额范围 ${SITES_MIN}-${SITES_MAX}`, icon: 'none' });
      return;
    }
    this.setData({ 'form.sitesInput': String(next) });
  },

  onStatus(e) {
    const i = toNum(e.detail.value, 1);
    const opt = STATUS_OPTS[i] || STATUS_OPTS[1];
    this.setData({ statusIndex: STATUS_OPTS.indexOf(opt), 'form.status': opt.v });
  },

  async save() {
    const f = this.data.form;
    const courseWord = this.tr('course', '课程');
    const scheduleWord = this.tr('schedule', '排期');
    if (!f.courseId) { wx.showToast({ title: `请选择${courseWord}`, icon: 'none' }); return; }
    if (!f.startDate || !f.startTime || !f.endTime) { wx.showToast({ title: '请填写日期与时段', icon: 'none' }); return; }
    // 结束时间必须晚于开始时间（course_schedule 有 CHECK(end_time > start_time)，先拦下避免 500）
    const endDate = f.endDate || f.startDate;
    if (!(endDate + ' ' + f.endTime > f.startDate + ' ' + f.startTime)) {
      wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' }); return;
    }
    // 重复排期必须有结束日期；否则后端 ScheduleGenerator 会按「开始 +30 天」静默展开，
    // 与用户在界面上看到的（空 = 不重复可留空）不一致
    if (f.repeatType > 0 && !f.endDate) { wx.showToast({ title: `${scheduleWord}结束日期不能为空`, icon: 'none' }); return; }
    if (f.repeatType === 2 && f.repeatDays.length === 0) { wx.showToast({ title: '请选择每周星期', icon: 'none' }); return; }
    if (f.repeatType === 3 && f.repeatDays.length === 0) { wx.showToast({ title: '请选择每月日期', icon: 'none' }); return; }

    const sites = clamp(toNum(f.sitesInput, SITES_MIN), SITES_MIN, SITES_MAX);
    const interval = clamp(toNum(f.intervalInput, INTERVAL_MIN), INTERVAL_MIN, INTERVAL_MAX);
    const name = (f.name || '').trim() || this.data.courseName || courseWord;
    const dto = {
      courseId: f.courseId,
      name,                                   // NOT NULL：必须给值
      startDate: f.startDate, startTime: f.startTime,
      endDate, endTime: f.endTime,
      repeatType: f.repeatType,
      repeatInterval: f.repeatType === 0 ? 1 : interval,
      repeatDays: f.repeatType === 0 ? [] : f.repeatDays,
      availableSites: sites,
      status: f.status
    };
    // NOT NULL 且无默认值：新增取默认/继承时区，编辑沿用库中值
    dto.timeZone = f.timeZone || this.defaultTimeZone || DEFAULT_TIME_ZONE;

    this.setData({ submitting: true, 'form.sitesInput': String(sites), 'form.intervalInput': String(interval) });
    try {
      if (this.data.mode === 'edit') {
        dto.scheduleId = this.data.id;
        await request({ url: ENDPOINTS.SCHEDULE_UPDATE, method: 'POST', data: dto });
      } else {
        await request({ url: ENDPOINTS.SCHEDULE_CREATE, method: 'POST', data: dto });
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '保存失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
}));
