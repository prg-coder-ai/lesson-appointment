// 底部导航组件：按当前登录角色渲染对应导航项。
// 页面引入后传 active（当前页 key），监听 bind:change 用 redirectTo 跳转，避免页面栈堆积。

import { getSession } from '../../core/storage.js';
import { TAB_ITEMS, tabGroupForRole } from '../../shared/constants.js';
import { term, registerTermUpdate, unregisterTermUpdate } from '../../core/term.js';

const GLYPH = {
  home: '🏠', calendar: '📅', list: '📋', user: '👤',
  book: '📚', friend: '👥', chart: '📊'
};

// 标签行业词转换：TAB_ITEMS 项可带 textTerm 模板（如 '我的{{course}}'），
// `{{key}}` 按 terms 字典取词 —— 教育「我的课程」/ 法律「我的咨询话题」/ 心理「我的咨询项目」。
// 未提供 textTerm 的项直接用 text（多数菜单名固定在行业间不变，不参与转换）。
function renderText(it) {
  if (!it.textTerm) return it.text;
  return it.textTerm.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = term(k);
    return v || m; // 词表缺该 key 时保留原占位符，便于暴露问题而非静默变空串
  });
}

Component({
  properties: {
    active: { type: String, value: '' }
  },
  data: { items: [], role: '', group: '' },
  lifetimes: {
    attached() {
      const u = getSession();
      const role = (u && u.role) || 'student';
      const group = tabGroupForRole(role);
      this.setData({ role, group, items: this.buildItems(group) });
      // 行业切换 / 服务端合并词表到达后重算标签：与页面 withTerms 共用同一套通知机制。
      // （首次渲染时词表可能还没拉到，这里兜住「后到的词表」）
      this.__termListener = () => this.setData({ items: this.buildItems(this.data.group) });
      registerTermUpdate(this.__termListener);
    },
    detached() {
      if (this.__termListener) {
        unregisterTermUpdate(this.__termListener);
        this.__termListener = null;
      }
    }
  },
  pageLifetimes: {
    // 从设置页切回来时行业可能已变（通知机制已覆盖，这里做兜底）
    show() { this.setData({ items: this.buildItems(this.data.group) }); }
  },
  methods: {
    buildItems(group) {
      return (TAB_ITEMS[group] || []).map(it => ({
        key: it.key, page: it.page, text: renderText(it), glyph: GLYPH[it.icon] || '•'
      }));
    },
    onTap(e) {
      const { page, key } = e.currentTarget.dataset;
      if (key === this.data.active) return;
      this.triggerEvent('change', { page, key });
    }
  }
});
