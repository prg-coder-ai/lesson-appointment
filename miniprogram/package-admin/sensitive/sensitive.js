// 租户管理端 · 敏感词管理（对应 admin.html 的"敏感词管理"）
// 列表来自 /sensitive/words；检测调用 /sensitive/test（均自动按当前租户隔离）。

import { requireAuth } from '../../core/auth.js';
import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';

Page({
  data: { list: [], loading: true, testText: '', testResult: '', testing: false },
  onLoad() {
    const u = requireAuth();
    if (!u) return;
    this.load();
  },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },
  async load() {
    this.setData({ loading: true });
    try {
      const res = await request({ url: ENDPOINTS.SENSITIVE_WORDS, method: 'GET', customErrorMsg: false }) || [];
      const rows = Array.isArray(res) ? res : (res && res.rows) || [];
      const list = rows.map(w => ({ word: w.word || w.name || '', group: w.groupName || w.group || '' }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false, list: [] });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    }
  },
  onInput(e) { this.setData({ testText: e.detail.value }); },
  async onTest() {
    const text = this.data.testText.trim();
    if (!text) { wx.showToast({ title: '请输入检测内容', icon: 'none' }); return; }
    this.setData({ testing: true, testResult: '' });
    try {
      const res = await request({ url: ENDPOINTS.SENSITIVE_TEST, method: 'POST', customErrorMsg: false, data: { text } });
      const hits = (res && (res.hitWords || res.words || (Array.isArray(res) ? res : []))) || [];
      this.setData({ testing: false, testResult: hits.length ? ('命中敏感词：' + hits.join('、')) : '未命中敏感词' });
    } catch (e) {
      this.setData({ testing: false, testResult: (e && e.message) || '检测失败' });
    }
  }
});
