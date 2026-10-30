// 租户管理端 · 课程模板（对应 admin.html 的"课程模板"）
// 列表来自 /course/template/list（自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { withTerms } from '../../core/term.js';

const FORM_TEXT = { '1p1': '一对一', '1pN': '小班课', '1p2N': '中班课' };

Page(withTerms({
  data: { list: [], loading: true },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({ url: ENDPOINTS.COURSE_TEMPLATE_LIST, method: 'GET', customErrorMsg: false }) || [];
      const rows = Array.isArray(res) ? res : (res && res.rows) || [];
      const list = rows.map(t => ({
        id: t.templateId,
        lang: t.languageType || '',
        level: t.difficultyLevel || '',
        form: FORM_TEXT[t.classForm] || t.classForm || '',
        duration: t.classDuration != null ? t.classDuration + '分钟' : '',
        fee: t.classFee != null ? t.classFee : ''
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  }
}));
