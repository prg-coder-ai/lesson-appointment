// 管理端「课堂链接分发」/ 发上课通知（2026-11-21）
//
// 对标 Web 课堂运营台「发上课通知」面板（frontend/classroom-ops.html#tab-monitor + ops.js#_sendNotice）。
//
// 为什么需要它：临时课堂没有排期、不进学生「我的课堂」；而课堂名单只有管理员看得见
// （学生端「我的课堂」是排期驱动的）。所以「把链接推给学生」这件事只能由管理员主动做。
//
// 链路（全部既有接口，未改后端）：
//   GET  /api/v1/classrooms/{key}/status    → 课堂信息（课程名/时间/租户）
//   GET  /api/v1/classrooms/{key}/members   → 名单（取 role=student 且未 kicked 的人）
//   POST /api/v1/messages/send              → 8090 消息中心，payload.url 会被收件箱渲染成「进入课堂」按钮
//
// 两个必须留意的点：
//   ① 名单为空时**不要**发送成功——那是最常见的一次性困惑（发出去了但没人收到）。
//      这里直接拦下并指路，与 Web 端文案一致。
//   ② 平台管理员代别家租户发通知时必须带 targetTenantId，否则消息落成平台租户(0)，
//      学生收件箱按 userId 能命中，但消息归属租户错，后续按租户检索就丢这条。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { getSession } from '../../core/storage.js';
import { classroomStateText, classroomStateTone } from '../../shared/domain/classroom.js';
import { classroomVisible, ensureClassroomConfig, classroomUrl, copyText } from '../../core/classroom.js';

function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 课堂候选的状态清单（与 ops.js#_loadClassrooms 一致；已结束的不在此列） */
const CANDIDATE_STATUSES = ['LIVE', 'SCHEDULED', 'READY', 'PAUSED'];
const STATUS_RANK = { LIVE: 0, PAUSED: 1, READY: 2, SCHEDULED: 3, CLOSED: 4 };

Page(withTerms({
  data: {
    loading: false,
    classrooms: [],          // [{value, label, sub, status}]
    labels: [],              // picker 展示用
    pickIndex: -1,
    selected: null,          // {scheduleId, courseName, status, stateText, tone, timeText}
    title: '',
    content: '',
    withLink: true,
    high: false,
    sending: false,
    result: null             // {count, names, link, withLink, messageId}
  },

  onLoad(options) {
    if (!requireAuth()) return;
    if (!classroomVisible()) {
      wx.showToast({ title: '本租户未开通在线课堂', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const preset = options && options.scheduleId ? decodeURIComponent(options.scheduleId) : '';
    ensureClassroomConfig().then((cfg) => {
      if (cfg && cfg.enabled !== true) {
        wx.showModal({
          title: '未开通在线课堂',
          content: '本租户未开通在线课堂，请联系平台管理员。',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      this.loadClassrooms(preset);
    });
  },

  /**
   * 拉课堂候选：并发按状态查，去重后按「进行中优先」排序。
   * 绕开全局 loading（并用 customErrorMsg:false）：候选加载不该弹错误打断操作。
   */
  async loadClassrooms(presetSid) {
    this.setData({ loading: true });
    try {
      const groups = await Promise.all(CANDIDATE_STATUSES.map((st) => request({
        url: ENDPOINTS.CLASSROOM_ADMIN_CLASSROOMS + '?status=' + encodeURIComponent(st),
        method: 'GET',
        customLoading: false,
        customErrorMsg: false
      }).catch(() => [])));

      const seen = {};
      const list = [];
      (groups || []).forEach((rows) => {
        (rows || []).forEach((c) => {
          if (!c || !c.scheduleId || seen[c.scheduleId]) return;
          seen[c.scheduleId] = 1;
          const name = c.courseName || '（未命名课堂）';
          const bits = [];
          if (c.startTime) bits.push(fmtTime(c.startTime));
          if (c.status) bits.push(classroomStateText(c.status));
          bits.push(String(c.scheduleId).slice(0, 8));
          list.push({
            value: c.scheduleId,
            label: name,
            sub: bits.filter(Boolean).join(' · '),
            status: c.status || '',
            courseName: name,
            startTime: c.startTime || '',
            endTime: c.endTime || ''
          });
        });
      });

      list.sort((a, b) => (STATUS_RANK[a.status] == null ? 9 : STATUS_RANK[a.status])
        - (STATUS_RANK[b.status] == null ? 9 : STATUS_RANK[b.status]));

      const labels = list.map((o) => o.label + ' · ' + o.sub);
      let pickIndex = -1;
      if (presetSid) {
        pickIndex = list.findIndex((o) => o.value === presetSid);
      }
      if (pickIndex < 0 && list.length === 1) pickIndex = 0;

      this.setData({ loading: false, classrooms: list, labels, pickIndex });
      if (pickIndex >= 0) this.applySelected(pickIndex);
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: this.errText(e), icon: 'none' });
    }
  },

  applySelected(i) {
    const o = this.data.classrooms[i];
    if (!o) return;
    const timeText = o.startTime
      ? (fmtTime(o.startTime) + (o.endTime ? ' ~ ' + fmtTime(o.endTime) : ''))
      : '按老师通知的时间';
    this.setData({
      pickIndex: i,
      selected: {
        scheduleId: o.value,
        courseName: o.courseName,
        status: o.status,
        stateText: classroomStateText(o.status),
        tone: classroomStateTone(o.status),
        timeText
      },
      result: null
    });
  },

  onPick(e) {
    const i = Number(e.detail.value);
    if (isNaN(i) || i < 0 || i >= this.data.classrooms.length) return;
    this.applySelected(i);
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onContent(e) { this.setData({ content: e.detail.value }); },
  onToggleLink(e) { this.setData({ withLink: e.detail.value }); },
  onToggleHigh(e) { this.setData({ high: e.detail.value }); },

  onRefresh() { this.loadClassrooms(this.data.selected && this.data.selected.scheduleId); },

  /** 发送：先取课堂 + 名单，再走消息中心 */
  async onSend() {
    const sel = this.data.selected;
    if (!sel) {
      wx.showToast({ title: '请先选择课堂', icon: 'none' });
      return;
    }
    if (this.data.sending) return;
    this.setData({ sending: true, result: null });

    const sid = sel.scheduleId;
    try {
      const [classroom, members] = await Promise.all([
        request({ url: ENDPOINTS.CLASSROOM_STATUS(sid), method: 'GET', customErrorMsg: false }).catch(() => ({})),
        request({ url: ENDPOINTS.CLASSROOM_MEMBERS(sid), method: 'GET', customErrorMsg: false }).catch(() => [])
      ]);

      const students = (members || []).filter((m) => m && m.userId && m.role === 'student' && !m.kicked);
      if (!students.length) {
        // 空名单是最常见的一次性困惑：通知发出去了但没人收到。必须说清原因。
        wx.showModal({
          title: '这间课堂还没有学生',
          content: '课堂名单在「首次进入课堂」时建立。请先让学生用课堂链接进入一次，或在电脑端「课堂运营台 → 给指定课堂加学员」把人加进来，再发通知。',
          showCancel: false
        });
        this.setData({ sending: false });
        return;
      }

      const c = classroom || {};
      const courseName = c.courseName || sel.courseName || ('课堂 ' + String(sid).slice(0, 8));
      const whenText = c.startTime
        ? (fmtTime(c.startTime) + (c.endTime ? ' ~ ' + fmtTime(c.endTime) : ''))
        : sel.timeText;

      // 链接先算好：正文默认文案要把完整地址写进去 —— 学生若在小程序里看消息，
      // 长按正文就能复制（小程序没有 href 概念，纯文本里的完整地址是唯一可靠兜底）。
      const link = classroomUrl(sid);

      const title = (this.data.title || '').trim() || ('上课通知：' + courseName);
      const content = (this.data.content || '').trim()
        || (courseName + ' 将于 ' + whenText + ' 开课。\n'
          + '课堂号：' + sid + '\n'
          + (link ? '课堂链接：' + link + '\n' : '')
          + '进入方式：点本消息里的按钮复制链接，在电脑浏览器粘贴打开（课堂需要摄像头与麦克风）。\n'
          + '请提前几分钟进入，确认设备可用。');

      const body = {
        title,
        content,
        recipientUserIds: students.map((m) => m.userId),
        // 上课通知要马上看：默认中优先级，管理员可显式提为 HIGH
        priority: this.data.high ? 'HIGH' : 'MEDIUM'
      };

      if (this.data.withLink && link) {
        body.payload = { type: 'classroom_join', scheduleId: sid, url: link };
      }

      // 平台管理员代别家租户发通知：不带 targetTenantId 会落成平台租户(0)
      const u = getSession() || {};
      if (u.role === 'platform_admin' && c.tenantId) body.targetTenantId = c.tenantId;

      const sent = await request({ url: ENDPOINTS.MSG_SEND, method: 'POST', data: body });

      const names = students.map((m) => m.displayName || m.userId).slice(0, 12).join('、')
        + (students.length > 12 ? ' 等 ' + students.length + ' 人' : '');

      this.setData({
        sending: false,
        result: {
          count: students.length,
          names,
          link,
          withLink: !!this.data.withLink && !!link,
          messageId: (sent && sent.messageId) || ''
        }
      });
      wx.showToast({ title: '已发送给 ' + students.length + ' 人', icon: 'success' });
    } catch (e) {
      this.setData({ sending: false });
      wx.showModal({
        title: '发送失败',
        content: this.errText(e),
        showCancel: false
      });
    }
  },

  onCopyResult() {
    const r = this.data.result;
    if (!r || !r.link) return;
    copyText(r.link, '课堂链接已复制');
  },

  errText(e) {
    if (!e) return '操作失败';
    const code = e.code || e.statusCode;
    if (code === 403) return '没有权限（需要管理员角色，或课堂服务不可达）';
    if (code === 404) return '接口不存在，请确认 classroomBase 指向课堂服务（8092）';
    if (code === 40301) return '你不在该课堂名单内';
    return e.message || e.bodyMsg || ('操作失败' + (code ? '（' + code + '）' : ''));
  }
}));
