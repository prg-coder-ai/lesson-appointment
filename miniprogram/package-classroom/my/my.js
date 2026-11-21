// 学生/教师「我的课堂」（2026-11-21）
//
// 对标 Web 的「我的课堂」（frontend/js/student-myClassroom.js / teacher-myClassroom.js），
// 但**不承载课堂本体**：小程序没有 getUserMedia / RTCPeerConnection，
// 这里的「进入课堂」= 说明 + 复制链接（到电脑浏览器打开）。
//
// 数据链（全部既有接口）：
//   学生：POST /api/v1/course/booking/page              我的预约（userId + userRole 限定本人）
//         GET  /api/v1/schedule/class-instances/{sid}    课次（含 classroomKey / state / past）
//   教师：GET  /api/v1/schedule/listByTeacher?teacherId= 本人 active 排期
//         GET  /api/v1/schedule/class-instances/{sid}    同上
//   共用：GET  /api/v1/course/list                       课程字典（courseId → 课程名）
//         GET  /api/v1/schedule/detail/{sid}             排期（拿 courseId）
//         GET  /api/v1/recordings/{key}/playback         回放地址（8092，课后才用）
//
// 为什么课次维度而不是预约维度：多课次排期的一节课对应多条 appointment，
// 只有 class-instances 能给出**每个课次的 classroomKey**（第 1 课次裸 id，第 2 课次起 sid~N）。
// 用预约行拼键会让所有课次都指向第 1 课次 —— 表现为「明明上的是第 3 次课，进去却是第 1 次的课堂」。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import {
  classroomEntryActions, classroomStateText, classroomStateTone, CLASSROOM_PHASE
} from '../../shared/domain/classroom.js';
import {
  classroomVisible, ensureClassroomConfig, enterClassroomPrompt, classroomUrl, copyText
} from '../../core/classroom.js';

/** 最多展开多少个排期（每个排期一次 instances 请求；小程序并发太多会被限流） */
const MAX_SCHEDULES = 12;

/** 课次实例 side 的 state → 共享层的 phase（服务端已判过，比本地按时间算更可信） */
function phaseOfState(state, past) {
  if (past === true) return CLASSROOM_PHASE.PAST;
  const s = String(state || '').toLowerCase();
  if (s === 'finished' || s === 'closed' || s === 'ended') return CLASSROOM_PHASE.PAST;
  if (s === 'ongoing' || s === 'live') return CLASSROOM_PHASE.LIVE;
  if (!s) return CLASSROOM_PHASE.UNKNOWN;
  return CLASSROOM_PHASE.UPCOMING;
}

/** 无时区后缀的串按本地解析（与 ops.js#fmtTime 同口径） */
function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

Page(withTerms({
  data: {
    role: 'student',
    loading: false,
    loaded: false,
    groups: [],       // [{scheduleId, courseName, sub, instances:[{key, title, timeText, stateText, tone, actions}]}]
    enabled: false,
    fatal: ''
  },

  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.setData({ role: u.role || 'student' });
    if (!classroomVisible()) {
      wx.showToast({ title: '本租户未开通在线课堂', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    ensureClassroomConfig().then((cfg) => {
      if (cfg && cfg.enabled !== true) {
        wx.showModal({
          title: '未开通在线课堂',
          content: '本租户未开通在线课堂，请联系管理员。',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      this.setData({ enabled: true });
      this.load(u);
    });
  },

  onPullDownRefresh() {
    const u = requireAuth();
    if (u) this.load(u).then(() => wx.stopPullDownRefresh());
    else wx.stopPullDownRefresh();
  },

  async load(u) {
    if (this.data.loading) return;
    this.setData({ loading: true, fatal: '' });
    try {
      // ① 课程字典（一次拿全，后面只做映射；失败降级成「课堂 短id」）
      const courseDict = await this.loadCourseDict();

      // ② 排期清单
      const schedules = this.data.role === 'teacher'
        ? await this.teacherSchedules(u)
        : await this.studentSchedules(u);

      if (!schedules.length) {
        this.setData({ loading: false, loaded: true, groups: [] });
        return;
      }

      // ③ 并发取每个排期的课次
      const picked = schedules.slice(0, MAX_SCHEDULES);
      const groups = (await Promise.all(picked.map((s) => this.buildGroup(s, courseDict))))
        .filter(Boolean);

      this.setData({ loading: false, loaded: true, groups });
    } catch (e) {
      this.setData({ loading: false, loaded: true, fatal: this.errText(e) });
    }
  },

  loadCourseDict() {
    return request({ url: ENDPOINTS.COURSE_LIST, method: 'GET', customErrorMsg: false })
      .then((list) => {
        const map = {};
        (list || []).forEach((c) => {
          if (c && c.id) map[c.id] = c.name || c.courseName || '';
        });
        return map;
      })
      .catch(() => ({}));
  },

  /** 学生：我的预约 → 去重排期（排除已取消/候补/删除等不可上课状态） */
  async studentSchedules(u) {
    const res = await request({
      url: ENDPOINTS.BOOKING_PAGE,
      method: 'POST',
      // ⚠ 后端只按这两个字段做「只看本人」过滤，缺一项就会串到别人的数据
      data: { pageNum: 1, pageSize: 200, userId: u.userId, userRole: 'student' },
      customErrorMsg: false
    });
    const rows = (res && (res.rows || res.records)) || [];
    const seen = {};
    const out = [];
    rows.forEach((b) => {
      if (!b || !b.scheduleId || seen[b.scheduleId]) return;
      // 与共享层同一张黑名单：已取消/取消中/拒绝/冻结/候补/删除都不该给课堂入口
      if (!this.statusAllowed(b.status)) return;
      seen[b.scheduleId] = 1;
      out.push({ scheduleId: b.scheduleId, courseId: b.courseId || '' });
    });
    return out;
  },

  /** 教师：本人 active 排期 */
  async teacherSchedules(u) {
    const list = await request({
      url: ENDPOINTS.SCHEDULE_LIST_BY_TEACHER(u.userId), method: 'GET', customErrorMsg: false
    });
    return (list || []).map((s) => ({
      scheduleId: s.scheduleId || s.id || '',
      courseId: s.courseId || ''
    })).filter((s) => s.scheduleId);
  },

  statusAllowed(status) {
    if (!status) return true;
    const dead = {
      cancelled: 1, canceled: 1, cancelling: 1, canceling: 1,
      reject: 1, 'rej-booking': 1, delete: 1, deleted: 1, frozen: 1, waiting: 1,
      't-cancelled': 1, 't-reject': 1, 't-cancelling': 1
    };
    return !dead[String(status)];
  },

  /** 一个排期 → 一组课次行 */
  async buildGroup(sch, courseDict) {
    const sid = sch.scheduleId;
    let instances = null;
    try {
      instances = await request({
        url: ENDPOINTS.SCHEDULE_CLASS_INSTANCES(sid), method: 'GET', customErrorMsg: false
      });
    } catch (e) {
      return null;
    }
    if (!Array.isArray(instances) || !instances.length) return null;

    // 课程名：优先字典（靠 courseId），拿不到再问排期详情，最后降级成短 id
    let courseName = courseDict[sch.courseId] || '';
    if (!courseName) {
      try {
        const d = await request({ url: ENDPOINTS.SCHEDULE_DETAIL(sid), method: 'GET', customErrorMsg: false });
        const cid = (d && d.courseId) || sch.courseId;
        courseName = courseDict[cid] || '';
      } catch (e) { /* 降级 */ }
    }

    const rows = instances.map((ins) => {
      const key = ins.classroomKey || sid;   // 服务端下发优先，绝不自己拼
      const phase = phaseOfState(ins.state, ins.past);
      const actions = classroomEntryActions({
        phase,
        role: this.data.role,
        enabled: true,
        includePrep: false       // 小程序无设备检测，不给「课前准备」
      });
      return {
        key,
        title: '第 ' + (ins.classIndex || 1) + ' / ' + (ins.classCount || instances.length) + ' 次',
        timeText: fmtTime(ins.startTime) + (ins.endTime ? ' ~ ' + fmtTime(ins.endTime).slice(11) : ''),
        stateText: classroomStateText(ins.state),
        tone: classroomStateTone(ins.state),
        actions
      };
    }).filter((r) => r.actions.length > 0);   // 已取消等状态的课次不出按钮，也不需要占位行

    if (!rows.length) return null;
    return {
      scheduleId: sid,
      courseName: courseName || ('课堂 ' + String(sid).slice(0, 8)),
      sub: '共 ' + instances.length + ' 次',
      instances: rows
    };
  },

  // ---------------- 操作 ----------------

  onAction(e) {
    const { action, key, name } = e.currentTarget.dataset;
    if (!key) return;
    if (action === 'enter') {
      enterClassroomPrompt(key, name);
      return;
    }
    if (action === 'replay') {
      this.openReplay(key, name);
      return;
    }
  },

  /**
   * 回放：取签名 URL 后复制，提示到浏览器观看。
   *
   * 不内嵌 <video> 的原因：播放源是对象存储（OSS）域名，需要在微信后台
   * 「downloadFile 合法域名」里额外放行；没放行时 <video> 会静默黑屏，
   * 用户只会说「回放打不开」。复制链接的行为虽然朴素，但结果可预期。
   */
  async openReplay(key, name) {
    wx.showLoading({ title: '查询中…', mask: true });
    try {
      const res = await request({
        url: ENDPOINTS.CLASSROOM_PLAYBACK(key), method: 'GET', customErrorMsg: false
      });
      wx.hideLoading();
      const url = (res && (res.url || res.playbackUrl || res.signedUrl))
        || (typeof res === 'string' ? res : '');
      if (!url) {
        wx.showModal({
          title: '暂无回放',
          content: '该课次没有可用的录制文件。若课堂刚结束，录制转码可能需要几分钟。',
          showCancel: false
        });
        return;
      }
      wx.setClipboardData({
        data: url,
        success: () => wx.showModal({
          title: '回放地址已复制',
          content: (name ? name + '\n' : '') + '请在浏览器地址栏粘贴打开观看。',
          showCancel: false
        })
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: this.errText(e), icon: 'none' });
    }
  },

  /** 复制本课次课堂链接（不给按钮时也能用：长按课程名旁的「复制」） */
  onCopyLink(e) {
    const key = e.currentTarget.dataset.key;
    const url = classroomUrl(key);
    if (!url) {
      wx.showToast({ title: '未配置前端站点，无法生成链接', icon: 'none' });
      return;
    }
    copyText(url, '课堂链接已复制');
  },

  errText(e) {
    if (!e) return '加载失败';
    const code = e.code || e.statusCode;
    if (code === 403) return '没有权限查看课次';
    if (code === 404) return '课堂服务不可达，请稍后再试';
    return e.message || e.bodyMsg || ('加载失败' + (code ? '（' + code + '）' : ''));
  }
}));
