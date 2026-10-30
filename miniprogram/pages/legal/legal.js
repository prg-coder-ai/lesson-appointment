// 协议 / 隐私政策阅读页（Phase 2）：免登录读 GET /api/v1/legal/doc，rich-text 渲染正文。
// 默认同时展示《用户协议》《隐私政策》；可通过 ?type= 指定单篇。
// 租户上下文从 ?tenant= 或当前登录会话取，使"租户级覆盖"文档优先于平台级。

import { request } from '../../core/request.js';
import { ENDPOINTS } from '../../shared/apiPaths.js';
import { getSession } from '../../core/storage.js';

Page({
  data: {
    loading: true,
    docs: [],          // [{ docType, title, version, language, content }]
    error: ''
  },

  onLoad(options) {
    const type = (options && options.type) || '';
    const tenant = (options && options.tenant) || '';
    const session = getSession();
    const t = tenant || (session && session.tenantCode) || '';
    this.loadDocs(type, t);
  },

  async loadDocs(type, tenant) {
    const types = type ? [type] : ['user_agreement', 'privacy_policy'];
    const docs = [];
    for (const dt of types) {
      try {
        // 公开端点：tokenOnly 避免 401 触发 request 层的清场踢人
        const info = await request({
          url: ENDPOINTS.LEGAL_DOC(dt, 'zh', tenant),
          method: 'GET',
          tokenOnly: true,
          customErrorMsg: false
        });
        if (info) docs.push(info);
      } catch (e) {
        // 该文档未配置（resolve 返回 null → 后端 404）：跳过，不阻断另一篇
      }
    }
    this.setData({ docs, loading: false });
    if (docs.length === 0) this.setData({ error: '暂无协议内容（平台尚未配置）' });
  }
});
