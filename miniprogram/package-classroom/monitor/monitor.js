// 管理端「课堂监视」（2026-11-21）
//
// 对标 Web 的课堂运营台「实时监控」页签（frontend/classroom-ops.html + js/classroom/ops.js），
// 但**不含「进入课堂」** —— 小程序不承载课堂本体（它依赖 getUserMedia / RTCPeerConnection）。
// 保留的处置动作：复制学生链接、发通知、强制下课。
//
// 数据源（全部为既有接口，未改后端）：
//   GET /api/v1/admin/monitor/overview   → 卡片四数 + activeClasses[]
//   GET /api/v1/admin/monitor/alerts     → 卡在 LIVE 未下课 + 未处置对账差异
//   GET /api/v1/user/briefs?ids=         → 教师姓名（课堂侧存的是密文，见 ops.js 注释）
//
// 鉴权：课堂服务 AdminMonitorController 用 AuthContext.isManager()（= admin / platform_admin），
// 且非平台管理员只能看本租户（第 87-88 行按 tenantId 过滤）—— 租户管理员直接用，无需后端改动。
//
// 字段口径提醒：classroom.startTime 是「本地墙钟裸串」（预约侧推送时已是本地时间），
// 渲染时**按本地解析**，不要再套 utcToZoned，否则整体偏 8 小时。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';
import { classroomStateText, classroomStateTone } from '../../shared/domain/classroom.js';
import { classroomVisible, ensureClassroomConfig, classroomUrl, copyText } from '../../core/classroom.js';

/** 与 ops.js#fmtTime 逐字同口径：无时区后缀按本地解析，输出 YYYY-MM-DD HH:mm */
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
    loading: false,
    loaded: false,
    cards: { todayClasses: 0, liveClasses: 0, onlineUsers: 0, openDiffs: 0 },
    serverTimeText: '',
    rows: [],
    staleLive: [],
    staleLiveCount: 0,
    openDiffCount: 0,
    diffs: [],
    hasFatal: ''          // 致命错误（接口不通/权限不足），与"无数据"区分开
  },

  onLoad() {
    if (!requireAuth()) return;
    // 课堂未开通时不静默白屏：先给一次提示，再决定是否退回。
    // 与 Web guardClassroom 同口径 —— 只有后端**明确** enabled!==true 才拦，
    // 取不到配置（网络抖动）不据此踢人。
    if (!classroomVisible()) {
      wx.showToast({ title: '本租户未开通在线课堂', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
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
      this.load();
    });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (this.data.loading) return;
    this.setData({ loading: true, hasFatal: '' });
    try {
      const [ov, al] = await Promise.all([
        request({ url: ENDPOINTS.CLASSROOM_ADMIN_MONITOR_OVERVIEW, method: 'GET' }).catch((e) => ({ __err: e })),
        // 告警失败不打扰主流程（Web 同口径：catch 后什么都不做）
        request({ url: ENDPOINTS.CLASSROOM_ADMIN_MONITOR_ALERTS, method: 'GET', customErrorMsg: false })
          .catch(() => ({}))
      ]);

      if (ov && ov.__err) {
        this.setData({
          loading: false,
          loaded: true,
          hasFatal: this.errText(ov.__err)
        });
        return;
      }

      const active = (ov && ov.activeClasses) || [];
      const briefs = await this.userBriefs(active.map((c) => c.teacherId));

      const rows = active.map((c) => {
        const b = briefs[c.teacherId] || {};
        // 教师名优先账号（唯一可辨识），其次姓名，最后库里的 teacherName（可能是密文，不原样展示）
        const teacher = b.account || b.name
          || (this.looksEncrypted(c.teacherName) ? '未知用户' : (c.teacherName || c.teacherId || '-'));
        const ratio = c.memberCount ? (c.onlineCount + '/' + c.memberCount) : (c.onlineCount + '/-');
        return {
          scheduleId: c.scheduleId || '',
          courseName: c.courseName || '（未命名课堂）',
          teacher,
          startText: fmtTime(c.startTime),
          stateText: classroomStateText(c.status),
          tone: classroomStateTone(c.status),
          ratio,
          canEnd: c.status === 'LIVE' || c.status === 'PAUSED'
        };
      });

      const staleLive = ((al && al.staleLive) || []).map((c) => {
        let over = '';
        if (c.endTime) {
          const mins = Math.floor((Date.now() - new Date(c.endTime).getTime()) / 60000);
          if (mins > 0) over = '已超期 ' + this.fmtSpan(mins);
        }
        return {
          scheduleId: c.scheduleId || '',
          title: c.courseName || ('课堂 ' + String(c.scheduleId || '').slice(0, 8)),
          endText: fmtTime(c.endTime),
          over
        };
      });

      this.setData({
        loading: false,
        loaded: true,
        cards: {
          todayClasses: (ov && ov.todayClasses) || 0,
          liveClasses: (ov && ov.liveClasses) || 0,
          onlineUsers: (ov && ov.onlineUsers) || 0,
          openDiffs: (ov && ov.openDiffs) || 0
        },
        serverTimeText: fmtTime(ov && ov.serverTime),
        rows,
        staleLive,
        staleLiveCount: (al && al.staleLiveCount) || 0,
        openDiffCount: (al && al.openDiffCount) || 0,
        diffs: ((al && al.diffs) || []).slice(0, 8).map((d) => ({
          text: (d.diffType || '') + ' · ' + (d.detail || '')
        }))
      });
    } catch (e) {
      this.setData({ loading: false, loaded: true, hasFatal: this.errText(e) });
    }
  },

  /** 批量把 userId 换成 {name, account}；失败返回空 map 不影响主流程 */
  userBriefs(ids) {
    const uniq = [];
    (ids || []).forEach((id) => { if (id && uniq.indexOf(id) < 0) uniq.push(id); });
    if (!uniq.length || !ENDPOINTS.USER_BRIEFS) return Promise.resolve({});
    return request({ url: ENDPOINTS.USER_BRIEFS(uniq), method: 'GET', customErrorMsg: false })
      .then((list) => {
        const map = {};
        (list || []).forEach((b) => { if (b && b.userId) map[b.userId] = b; });
        return map;
      })
      .catch(() => ({}));
  },

  /**
   * 密文判定：主库 user.name 入库即加密（形如 "ivHex:cipherBase64"）。
   * 反查失败时绝不能把密文摆到界面上——它看着像 id，用户根本认不出是谁。
   * 与 ops.js#looksEncrypted 同一口径。
   */
  looksEncrypted(s) {
    const v = s == null ? '' : String(s);
    if (v.length <= 24) return false;
    if (!/[\u4e00-\u9fa5\s]/.test(v) && v.indexOf(':') > 8) return true;
    return /^[0-9a-f]{32,}$/i.test(v);
  },

  fmtSpan(mins) {
    if (mins < 60) return mins + ' 分钟';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
  },

  errText(e) {
    if (!e) return '加载失败';
    if (e.__err) return e.__err.message || '加载失败';
    const code = e.code || e.statusCode;
    if (code === 403) return '没有权限查看课堂监视（需要管理员角色，且课堂服务需可从手机访问）';
    if (code === 404) return '课堂监视接口不存在，请确认 classroomBase 是否指向课堂服务（8092）';
    return e.message || e.bodyMsg || ('加载失败' + (code ? '（' + code + '）' : ''));
  },

  // ---------------- 操作 ----------------

  /** 复制学生入口链接（Web 课堂页，带 tCode） */
  onCopyLink(e) {
    const sid = e.currentTarget.dataset.sid;
    const url = classroomUrl(sid);
    if (!url) {
      wx.showModal({
        title: '课堂链接未配置',
        content: '当前环境没有前端站点地址（webBase），无法生成课堂链接。请联系管理员检查小程序环境配置。',
        showCancel: false
      });
      return;
    }
    copyText(url, '学生链接已复制');
  },

  /** 跳到「课堂链接分发」并预选该课堂 */
  onNotice(e) {
    const sid = e.currentTarget.dataset.sid;
    wx.navigateTo({ url: '/package-classroom/distribute/distribute?scheduleId=' + encodeURIComponent(sid) });
  },

  /** 强制下课：端点 /admin/classrooms/{sid}/end → endClass（正常结束，出勤/课时照常结算） */
  onEnd(e) {
    const sid = e.currentTarget.dataset.sid;
    wx.showModal({
      title: '强制下课',
      content: '将结束该课堂并结算出勤与课时（与教师点「下课」口径一致，不是作废）。继续？',
      confirmText: '结束课堂',
      confirmColor: '#d92d20',
      success: (res) => {
        if (!res.confirm) return;
        request({ url: ENDPOINTS.CLASSROOM_ADMIN_END(sid), method: 'POST' })
          .then(() => {
            wx.showToast({ title: '已结束', icon: 'success' });
            this.load();
          })
          .catch((err) => wx.showToast({ title: this.errText(err), icon: 'none' }));
      }
    });
  },

  onRefresh() { this.load(); },

  /** 进入课堂分发页（不选具体课堂，进去自己挑） */
  goDistribute() {
    wx.navigateTo({ url: '/package-classroom/distribute/distribute' });
  }
}));
