// 小程序端：列表富化助手 —— 把 booking / appointment 行补出课程名、学生名、教师名、上课时间。
//
// 为什么必须有它（真实缺陷，不是优化项）：
//   后端 booking 分页走 BookingMapper.selectListPage = `SELECT b.*`（resultType = Booking 实体），
//   返回体**不含** courseName / studentName / teacherName / 上课时间；
//   appointment 类分页返回 Appointment 实体，也只有 { id, bookingId, classIndex,
//   appointmentDatetime, status }。页面若直接读 b.courseName 恒 undefined
//   → 卡片「课程」落占位、「时间」恒 '-'、「学生」落到 ID。
//
// 依赖链（与 frontend/js/public/appointmentNotes.js 的 teacher 分支、
// miniprogram/package-teacher/appointment/appointment.js 的 enrich() 完全一致，
// 本模块即那两处的抽取收口）：
//   appointment → booking（studentId / teacherId / scheduleId）
//              → schedule（courseId / timeZone / name）→ course（courseName）
//              + 学生/教师姓名经 /user/name/{id}
//
// 反 N+1：所有请求按「id → Promise」memo 缓存，同一 id 在一次富化批次内只发一次请求；
//   批次内并发（Promise.all），不串行 await；同批多行引用同一排期/课程/用户时自动复用。
//
// 容错口径：富化是「锦上添花」，任何一环失败都只让该字段为空，
//   绝不让整页崩、也不刷屏 toast（全部 customErrorMsg: false）。
//
// 用法：
//   import { createEnricher } from '../../core/enrich.js';
//   const en = createEnricher();
//   const list = await en.many(rows);      // rows 为 appointment 或 booking 行
//   const one  = await en.one(row);

import { request } from './request.js';
import { ENDPOINTS } from '../shared/apiPaths.js';
import { formatDateTime } from '../shared/domain/datetime.js';

// 单条 GET：失败一律返回 null（不外抛），由调用方按空值渲染。
function safeGet(url) {
  return request({ url, method: 'GET', customErrorMsg: false }).catch(() => null);
}

// 幂等 memo：同一 key 只加载一次，多个调用方共享同一个 Promise。
// key 为空 → 立即返回 null（不发请求，也避免 /user/name/ 这类空路径打到后端）。
function memo(map, key, loader) {
  if (key === null || key === undefined || key === '') return Promise.resolve(null);
  if (!Object.prototype.hasOwnProperty.call(map, key)) {
    map[key] = loader().catch(() => null);
  }
  return map[key];
}

// 富化结果的空壳（字段集恒定，避免 WXML 读到 undefined 触发未定义分支）
function emptyEnrich() {
  return {
    bookingId: '', scheduleId: '', courseId: '', courseName: '', scheduleName: '',
    scheduleStart: '', scheduleEnd: '', repeatType: null, repeatInterval: null, repeatDays: '',
    studentId: '', studentName: '', teacherId: '', teacherName: '',
    timeZone: '', bookingStatus: '', rawTime: '', time: ''
  };
}

/**
 * 创建一个带缓存的富化器。
 * 每个页面每次 load 建一个（缓存随页面数据刷新一起换代，避免拿到过期课程名/姓名）。
 */
export function createEnricher() {
  const bkCache = {};   // bookingId  → Booking
  const scCache = {};   // scheduleId → CourseSchedule
  const csCache = {};   // courseId   → Course
  const usCache = {};   // userId     → 姓名（字符串）

  const bookingOf = (id) => memo(bkCache, id, () => safeGet(ENDPOINTS.BOOKING_DETAIL(id)));
  const scheduleOf = (id) => memo(scCache, id, () => safeGet(ENDPOINTS.SCHEDULE_DETAIL(id)));
  const courseOf = (id) => memo(csCache, id, () => safeGet(ENDPOINTS.COURSE_DETAIL(id)));

  // 姓名解析：后端查不到时返回字符串 'N/A'（UserController#getUserById），按空处理
  async function nameOf(id) {
    const n = await memo(usCache, id, () => safeGet(ENDPOINTS.USER_NAME(id)));
    return (typeof n === 'string' && n && n !== 'N/A') ? n : '';
  }

  async function enrichOne(row) {
    const r = row || {};
    const bookingId = r.bookingId || r.booking_id || '';

    // 行本身就是 booking（selectListPage 直接返回 Booking 实体：带 scheduleId + 学生/教师）
    // → 不必再回查一次 /course/booking/{id}，省一次必然重复的请求。
    const isBookingRow = !!(r.scheduleId && (r.studentId || r.teacherId));
    const booking = isBookingRow ? r : (bookingId ? await bookingOf(bookingId) : null);

    const scheduleId = (booking && booking.scheduleId) || r.scheduleId || '';
    const schedule = scheduleId ? await scheduleOf(scheduleId) : null;
    const courseId = (schedule && schedule.courseId) || '';
    const course = courseId ? await courseOf(courseId) : null;

    const studentId = (booking && booking.studentId) || r.studentId || '';
    const teacherId = (booking && booking.teacherId) || r.teacherId || '';
    // 两个姓名并发取（memo 保证同一人只请求一次）
    const names = await Promise.all([
      studentId ? nameOf(studentId) : Promise.resolve(''),
      teacherId ? nameOf(teacherId) : Promise.resolve('')
    ]);

    // 课次时间：只有 appointment 行有；booking 行没有时间列（时间在排期上），留空由调用方处置。
    const rawTime = r.appointmentDatetime || '';

    return {
      bookingId: bookingId,
      scheduleId: scheduleId,
      courseId: courseId,
      courseName: (course && (course.courseName || course.title)) || '',
      scheduleName: (schedule && schedule.name) || '',
      // 排期时间：排期存的是**本地墙钟**（不走 UTC 化）+ time_zone，故原样透出不做换算；
      // startTime 暗含起始日期，endTime 暗含重复结束日期。
      scheduleStart: (schedule && schedule.startTime) || '',
      scheduleEnd: (schedule && schedule.endTime) || '',
      repeatType: schedule && schedule.repeatType != null ? schedule.repeatType : null,
      repeatInterval: schedule && schedule.repeatInterval != null ? schedule.repeatInterval : null,
      repeatDays: (schedule && schedule.repeatDays) || '',
      studentId: studentId,
      studentName: names[0],
      teacherId: teacherId,
      teacherName: names[1],
      timeZone: (schedule && schedule.timeZone) || '',
      // 预约(booking)状态：booking 行取自身 status；appointment 行的 r.status 是**课次**状态，
      // 不能被当成预约状态（两者语义不同），只能取回查到的 booking.status。
      bookingStatus: isBookingRow ? (r.status || '') : ((booking && booking.status) || ''),
      rawTime: rawTime,
      time: rawTime ? formatDateTime(rawTime, false) : ''
    };
  }

  return {
    bookingOf, scheduleOf, courseOf, nameOf,
    /** 单行富化（永不 reject） */
    async one(row) {
      try { return await enrichOne(row); } catch (e) { return emptyEnrich(); }
    },
    /** 批量富化：并发 + memo 去重；返回与入参等长、同序的数组 */
    async many(rows) {
      const arr = Array.isArray(rows) ? rows : [];
      // 刻意用局部函数而非 this.one：调用方可能解构（const { many } = en），
      // 那时 this 为 undefined，this.one 会直接抛错。
      return Promise.all(arr.map((r) => one(r)));
    }
  };

  // 独立函数体（见上：不依赖 this）
  async function one(row) {
    try { return await enrichOne(row); } catch (e) { return emptyEnrich(); }
  }
}

/**
 * 一次性富化（不需要复用缓存时的便捷写法）。
 * 注意：每次都新建缓存 ⇒ 跨页/跨次刷新不复用，适合只调一次的场景。
 */
export function enrichRows(rows) {
  return createEnricher().many(rows);
}
