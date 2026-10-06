// 学生端「教师主页」（已发布的职业信息）
//
// 入参二选一：
//   pid / id → publishedProfileId（「浏览教师」列表点击带入）
//   tid      → teacherId（课程/排期页「查看主页」带入）
//
// 数据源与「浏览教师」同一个公开白名单接口：
//   GET /teacher/published/public-list?tenantCode=xxx → Result<List<TeacherPublishedProfileCardVO>>
//   裁剪 VO 只有 { publishedProfileId, teacherId, name, title, summary, coverUrl } 五个字段。
// 历史版本兜底：public-list 只列「最新已发布」的记录；带 pid 但不在列表里时
//   （例如分享的是已被新版本归档的旧链接），改用 GET /teacher/published/public-get?id= 取标题。
//
// 原实现读的是 p.intro / p.bio / p.highlights —— 这些字段在 VO 上都不存在，所以整页只有标题、
// 正文恒显示"尚未填写"。这里改为严格按上面的字段名取值。

import { requireAuth, getBoundTenantCode } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

const DEFAULT_COVER = 'background:linear-gradient(135deg,#4e6ef2,#7a8cff);';

function pickRows(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.rows || res.records || res.list || [];
}

Page(withTerms({
  data: { profile: {}, loading: false, notFound: false },

  onLoad(options) {
    const u = requireAuth();
    if (!u) return;
    this.tCode = u.tenantCode || getBoundTenantCode() || '';
    const pid = options.pid || options.id || '';
    const tid = options.tid || '';
    if (!pid && !tid) {
      this.setData({ notFound: true });
      wx.showToast({ title: '缺少' + this.tr('teacher', '教师') + '参数', icon: 'none' });
      return;
    }
    this.load(pid, tid);
  },

  tr(key, fb) { const t = this.data.terms || {}; return t[key] || fb; },

  async load(pid, tid) {
    this.setData({ loading: true, notFound: false });
    try {
      let hit = null;
      if (this.tCode) {
        try {
          const res = await request({
            url: ENDPOINTS.TEACHER_PUBLIC_LIST(this.tCode),
            method: 'GET', tokenOnly: true, customErrorMsg: false
          });
          const rows = pickRows(res);
          if (pid) hit = rows.find(x => String(x.publishedProfileId) === String(pid)) || null;
          if (!hit && tid) hit = rows.find(x => String(x.teacherId) === String(tid)) || null;
        } catch (e) { /* 公开列表失败：下面还有 public-get 兜底 */ }
      }

      if (hit) {
        this.setData({ profile: this.normalize(hit) });
        return;
      }

      // 兜底：按 publishedProfileId 精确取该版本（含已被新版本覆盖的历史链接）
      if (pid) {
        const p = await request({
          url: ENDPOINTS.TEACHER_PUBLIC_GET(pid), method: 'GET', tokenOnly: true, customErrorMsg: false
        });
        if (p && (p.publishedProfileId || p.title)) {
          this.setData({
            profile: {
              name: this.tr('teacher', '教师'),
              initial: (this.tr('teacher', '教师')).charAt(0),
              title: p.title || '',
              summary: '',
              coverStyle: DEFAULT_COVER,
              publishedAt: p.publishedAt || '',
              teacherId: p.teacherId || ''
            }
          });
          return;
        }
      }
      this.setData({ notFound: true });
    } catch (e) {
      this.setData({ notFound: true });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },

  normalize(it) {
    const name = it.name || this.tr('teacher', '教师');
    const cover = it.coverUrl || '';
    return {
      pid: it.publishedProfileId || '',
      teacherId: it.teacherId || '',
      name: name,
      initial: (name || '?').charAt(0),
      title: it.title || '',
      summary: it.summary || '',
      coverStyle: cover ? ('background:' + cover + ';') : DEFAULT_COVER
    };
  },

  // 看该教师的可预订课程：带上 tid 跳「课程预订」，由该页按 teacherId 过滤课程列表
  viewCourses() {
    const tid = this.data.profile.teacherId;
    if (!tid) { wx.showToast({ title: '该记录未关联' + this.tr('teacher', '教师') + '账号', icon: 'none' }); return; }
    wx.navigateTo({ url: '/package-student/booking/booking?tid=' + encodeURIComponent(tid) });
  },

  goBack() { wx.navigateBack(); }
}));
