// 租户管理端 · 数据维护（对应 admin.html "系统维护 → 数据维护"）
// 占位页：批量创建测试数据、数据清理等能力待接入。

import { requireAuth } from '../../core/auth.js';

Page({
  data: {},
  onLoad() { if (!requireAuth()) return; }
});
