// 底部导航组件：按当前登录角色渲染对应导航项。
// 页面引入后传 active（当前页 key），监听 bind:change 用 redirectTo 跳转，避免页面栈堆积。

import { getSession } from '../../core/storage.js';
import { TAB_ITEMS, tabGroupForRole } from '../../shared/constants.js';

const GLYPH = {
  home: '🏠', calendar: '📅', list: '📋', user: '👤',
  book: '📚', friend: '👥', chart: '📊'
};

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
      const items = (TAB_ITEMS[group] || []).map(it => ({
        key: it.key, page: it.page, text: it.text, glyph: GLYPH[it.icon] || '•'
      }));
      this.setData({ items, role, group });
    }
  },
  methods: {
    onTap(e) {
      const { page, key } = e.currentTarget.dataset;
      if (key === this.data.active) return;
      this.triggerEvent('change', { page, key });
    }
  }
});
