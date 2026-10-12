// 租户管理端 · 审计日志（对应 admin.html "系统维护 → 审计日志"）
// 占位页：操作审计记录浏览能力待接入。

import { requireAuth } from '../../core/auth.js';

Page({
  data: {},
  onLoad() { if (!requireAuth()) return; }
});
