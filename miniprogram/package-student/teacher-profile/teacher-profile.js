import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { profile: {}, loading: false },
  onLoad(query) {
    const u = requireAuth();
    if (!u) return;
    this.tenantCode = u.tenantCode || '';
    if (query.id) { this.loadById(query.id); }
    else if (query.tid) { this.loadByTeacher(query.tid); }
    else { wx.showToast({ title: '缺少教师参数', icon: 'none' }); }
  },
  async loadById(id) {
    this.setData({ loading: true });
    try {
      const p = await request({ url: ENDPOINTS.TEACHER_PUBLIC_GET(id), method: 'GET', tokenOnly: true }) || {};
      this.setData({ profile: this.normalize(p) });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  async loadByTeacher(tid) {
    this.setData({ loading: true });
    try {
      const res = await request({ url: ENDPOINTS.TEACHER_PUBLIC_LIST(this.tenantCode), method: 'GET', tokenOnly: true }) || {};
      const rows = (res && (res.list || res)) || [];
      const hit = rows.find(p => String(p.teacherId) === String(tid)) || rows[0];
      if (!hit || !hit.id) { wx.showToast({ title: '未找到该教师主页', icon: 'none' }); return; }
      const p = await request({ url: ENDPOINTS.TEACHER_PUBLIC_GET(hit.id), method: 'GET', tokenOnly: true }) || {};
      this.setData({ profile: this.normalize(p) });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally { this.setData({ loading: false }); }
  },
  normalize(p) {
    return {
      title: p.title || p.name || '教师主页',
      headline: p.headline || '',
      intro: p.intro || p.bio || '尚未填写',
      highlights: p.highlights || ''
    };
  },
  onTabChange(e) { wx.redirectTo({ url: e.detail.page }); }
});
