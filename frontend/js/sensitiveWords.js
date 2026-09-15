/**
 * 敏感词管理前端模块（平台管理员 / 租户管理员 共用）
 * 依赖：axios、localStorage.token / currentUser（含 role）
 * 跨端口调用 message-service：mreq 实例（Bearer + 响应解包，与 messages-inbox.js 同约定）
 *
 * 功能：
 *  - 分组(全平台/租户)：列表、新增、改默认处理(拒绝发送/掩码放行)、删除（系统预置组不可删）
 *  - 敏感词：按组列表、新增、改处理(继承/拒绝/掩码)、删除、搜索、分页
 *  - 检测预览：输入文本即时检测命中词、是否拒绝/掩码、掩码预览（不落库）
 *  - 缓存刷新：仅平台管理员
 * 权限边界由后端保证；前端仅按角色隐藏/禁用对应控件。
 */
(function () {
  'use strict';
  if (typeof axios === 'undefined') {
    console.error('sensitiveWords.js 依赖 axios，请先引入 axios');
    return;
  }

  const MSG_BASE = window.MESSAGE_API_BASE_URL || (window.API_BASE_URL || '');

  const esc = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function (s) {
        return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      };

  // message-service 独立 axios 实例（与 messages-inbox.js 同约定）
  const mreq = axios.create({ baseURL: MSG_BASE, timeout: 15000, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
  mreq.interceptors.request.use(function (config) {
    const t = localStorage.getItem('token');
    if (t) config.headers.Authorization = 'Bearer ' + t;
    return config;
  }, function (err) { return Promise.reject(err); });
  mreq.interceptors.response.use(function (resp) {
    const res = resp.data;
    if (res && res.code === 200) return res.data;
    const msg = (res && (res.message || res.msg)) || '操作失败';
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(res || new Error(msg));
  }, function (error) {
    let msg = '网络异常，请稍后重试';
    if (error.response) {
      const st = error.response.status;
      if (st === 401) { msg = '登录已过期，请重新登录'; cleanupAuth(); setTimeout(function () { location.href = ((typeof window.pageUrl === 'function') ? window.pageUrl('index.html') : './index.html'); }, 600); }
      else if (st === 403) { msg = '无权限访问该资源'; }
      else if (st === 404) { msg = '接口地址不存在'; }
      else if (st === 500) { msg = '服务器内部错误'; }
      else { msg = '请求错误：' + st; }
    } else if (error.code === 'ECONNABORTED') { msg = '请求超时，请稍后重试'; }
    if (typeof window.showApiError === 'function') window.showApiError(msg); else console.error(msg);
    return Promise.reject(error);
  });

  function cleanupAuth() {
    try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); localStorage.removeItem('currentUser'); } catch (e) {}
  }

  const state = {
    container: null,
    groups: [],
    selectedGroupId: null,
    pageNum: 1,
    pageSize: 10,
    total: 0,
    keyword: ''
  };

  function curRole() {
    try { return (JSON.parse(localStorage.getItem('currentUser') || '{}').role) || ''; } catch (e) { return ''; }
  }
  function isPlatformAdmin() { return curRole() === 'platform_admin'; }

  function ensureStyle() {
    if (document.getElementById('sw-style')) return;
    const css =
      '.sw-wrap{max-width:1080px;margin:0 auto;padding:8px 4px;}\n' +
      '.sw-card{background:#fff;border:1px solid #eee;border-radius:8px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.03);}\n' +
      '.sw-card-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f0f0f0;}\n' +
      '.sw-card-title{font-weight:600;font-size:15px;color:#333;}\n' +
      '.sw-hint{font-size:12px;color:#999;}\n' +
      '.sw-card-body{padding:14px 16px;}\n' +
      '.sw-table{width:100%;border-collapse:collapse;font-size:14px;}\n' +
      '.sw-table th,.sw-table td{padding:9px 10px;text-align:left;border-bottom:1px solid #f2f2f2;}\n' +
      '.sw-table th{color:#888;font-weight:600;background:#fafafa;}\n' +
      '.sw-table tr:hover td{background:#fcfcfc;}\n' +
      '.sw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}\n' +
      '.sw-input,.sw-select,.sw-textarea{height:34px;line-height:34px;padding:0 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box;}\n' +
      '.sw-textarea{width:100%;height:90px;line-height:1.5;padding:8px 10px;resize:vertical;}\n' +
      '.sw-select{height:34px;}\n' +
      '.sw-tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;}\n' +
      '.sw-tag-reject{background:#fff1f0;color:#cf1322;border:1px solid #ffccc7;}\n' +
      '.sw-tag-mask{background:#e6f7ff;color:#0958d9;border:1px solid #91caff;}\n' +
      '.sw-tag-inherit{background:#f6ffed;color:#389e0d;border:1px solid #b7eb8f;}\n' +
      '.sw-test-result{font-size:13px;}\n' +
      '.sw-test-detail{margin-top:10px;font-size:13px;}\n' +
      '.sw-match{display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:4px;background:#fff7e6;border:1px solid #ffe7ba;color:#ad6800;}\n' +
      '.sw-pager{margin-top:10px;display:flex;align-items:center;gap:6px;}\n' +
      '.sw-pager button{min-width:32px;height:30px;line-height:28px;}\n' +
      '.sw-empty{padding:18px;text-align:center;color:#999;}\n' +
      '.sw-modal-mask{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;}\n' +
      '.sw-modal{background:#fff;width:420px;max-width:92vw;border-radius:10px;padding:18px 20px;}\n' +
      '.sw-modal h3{margin:0 0 14px;font-size:16px;}\n' +
      '.sw-form-item{margin-bottom:12px;}\n' +
      '.sw-form-item label{display:block;font-size:13px;color:#666;margin-bottom:5px;}\n' +
      '.sw-form-item input,.sw-form-item select{width:100%;}\n' +
      '.sw-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;}\n' +
      '.sw-danger{color:#cf1322;}\n';
    const style = document.createElement('style');
    style.id = 'sw-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function actionTag(action, inherit) {
    if (inherit) return '<span class="sw-tag sw-tag-inherit">继承(' + (action === 'MASK' ? '掩码' : '拒绝') + ')</span>';
    if (action === 'MASK') return '<span class="sw-tag sw-tag-mask">掩码放行</span>';
    return '<span class="sw-tag sw-tag-reject">拒绝发送</span>';
  }

  // ===================== 渲染主框架 =====================
  window.renderSensitiveWordsPage = function (container) {
    if (!container) return;
    state.container = container;
    ensureStyle();
    const pa = isPlatformAdmin();
    container.innerHTML =
      '<div class="sw-wrap">' +
        '<div class="sw-card">' +
          '<div class="sw-card-head"><span class="sw-card-title">敏感词检测预览</span>' +
            (pa ? '<button class="btn btn-gray" id="sw-refresh-btn"><i class="fa fa-sync"></i> 刷新缓存</button>' : '<span class="sw-hint">发送前预览命中情况（不落库）</span>') +
          '</div>' +
          '<div class="sw-card-body">' +
            '<textarea id="sw-test-input" class="sw-textarea" placeholder="输入要检测的文本，例如：点击此处查看敏感词与违禁词示例"></textarea>' +
            '<div class="sw-row"><button class="btn btn-primary" id="sw-test-btn">检测</button><span id="sw-test-result" class="sw-test-result"></span></div>' +
            '<div id="sw-test-detail" class="sw-test-detail"></div>' +
          '</div>' +
        '</div>' +

        '<div class="sw-card">' +
          '<div class="sw-card-head"><span class="sw-card-title">敏感词组</span><button class="btn btn-primary" id="sw-add-group-btn">新增分组</button></div>' +
          '<div class="sw-card-body">' +
            '<table class="sw-table"><thead><tr><th>分组名称</th><th>默认处理</th><th>范围</th><th>操作</th></tr></thead>' +
            '<tbody id="sw-group-body"></tbody></table>' +
          '</div>' +
        '</div>' +

        '<div class="sw-card">' +
          '<div class="sw-card-head"><span class="sw-card-title">敏感词（<span id="sw-cur-group">未选择分组</span>）</span></div>' +
          '<div class="sw-card-body">' +
            '<div class="sw-row">' +
              '<input id="sw-word-input" class="sw-input" style="width:220px;" placeholder="新增敏感词">' +
              '<select id="sw-word-action" class="sw-select"><option value="">继承分组默认</option><option value="REJECT">拒绝发送</option><option value="MASK">掩码放行</option></select>' +
              '<button class="btn btn-primary" id="sw-add-word-btn">添加</button>' +
              '<input id="sw-word-search" class="sw-input" style="width:180px;" placeholder="搜索词">' +
              '<button class="btn btn-gray" id="sw-word-search-btn"><i class="fa fa-search"></i> 搜索</button>' +
            '</div>' +
            '<table class="sw-table"><thead><tr><th>敏感词</th><th>处理</th><th>操作</th></tr></thead>' +
            '<tbody id="sw-word-body"></tbody></table>' +
            '<div id="sw-word-pager" class="sw-pager"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // 事件绑定
    container.querySelector('#sw-test-btn').addEventListener('click', doTest);
    container.querySelector('#sw-add-group-btn').addEventListener('click', function () { openGroupModal(null); });
    container.querySelector('#sw-add-word-btn').addEventListener('click', addWord);
    container.querySelector('#sw-word-search-btn').addEventListener('click', function () {
      state.keyword = container.querySelector('#sw-word-search').value.trim();
      state.pageNum = 1; loadWords();
    });
    const refreshBtn = container.querySelector('#sw-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshCache);

    loadGroups();
  };

  // ===================== 分组 =====================
  function loadGroups() {
    mreq.get('/api/v1/sensitive/groups').then(function (list) {
      state.groups = list || [];
      renderGroups();
      // 默认选中第一个组
      if (!state.selectedGroupId && state.groups.length) {
        state.selectedGroupId = state.groups[0].groupId;
      }
      if (state.selectedGroupId) loadWords();
    }).catch(function () {});
  }

  function renderGroups() {
    const body = state.container.querySelector('#sw-group-body');
    if (!body) return;
    if (!state.groups.length) {
      body.innerHTML = '<tr><td colspan="4" class="sw-empty">暂无分组，点击「新增分组」创建。</td></tr>';
      return;
    }
    body.innerHTML = state.groups.map(function (g) {
      const range = (g.tenantId === 0 || g.tenantId == null) ? '全平台' : ('租户 ' + esc(g.tenantId));
      const sys = g.isSystemPredefined === 1;
      const sel = '<select class="sw-select sw-group-action" data-id="' + esc(g.groupId) + '">' +
        '<option value="REJECT"' + (g.defaultAction === 'REJECT' ? ' selected' : '') + '>拒绝发送</option>' +
        '<option value="MASK"' + (g.defaultAction === 'MASK' ? ' selected' : '') + '>掩码放行</option></select>';
      const del = sys ? '<span class="sw-hint">系统预置</span>'
        : '<button class="btn btn-gray sw-group-del" data-id="' + esc(g.groupId) + '">删除</button>';
      const rowCls = (state.selectedGroupId === g.groupId) ? ' style="background:#f0f7ff;"' : '';
      return '<tr' + rowCls + '>' +
        '<td><a href="javascript:;" class="sw-group-pick" data-id="' + esc(g.groupId) + '" style="color:#0958d9;">' + esc(g.groupName) + '</a></td>' +
        '<td>' + sel + '</td>' +
        '<td>' + range + '</td>' +
        '<td>' + del + '</td></tr>';
    }).join('');

    body.querySelectorAll('.sw-group-pick').forEach(function (a) {
      a.addEventListener('click', function () {
        state.selectedGroupId = a.getAttribute('data-id');
        state.pageNum = 1; state.keyword = '';
        const si = state.container.querySelector('#sw-word-search'); if (si) si.value = '';
        renderGroups(); loadWords();
      });
    });
    body.querySelectorAll('.sw-group-action').forEach(function (s) {
      s.addEventListener('change', function () {
        const id = s.getAttribute('data-id');
        const g = state.groups.find(function (x) { return String(x.groupId) === String(id); });
        mreq.put('/api/v1/sensitive/groups/' + id, { defaultAction: s.value }).then(function () {
          if (g) g.defaultAction = s.value;
        }).catch(function () {});
      });
    });
    body.querySelectorAll('.sw-group-del').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-id');
        if (!confirm('删除该分组将同时删除组内全部敏感词，确定？')) return;
        mreq.delete('/api/v1/sensitive/groups/' + id).then(function () {
          state.groups = state.groups.filter(function (x) { return String(x.groupId) !== String(id); });
          if (String(state.selectedGroupId) === String(id)) state.selectedGroupId = null;
          renderGroups();
        }).catch(function () {});
      });
    });
  }

  function openGroupModal(group) {
    const pa = isPlatformAdmin();
    const name = group ? group.groupName : '';
    const def = group ? group.defaultAction : 'REJECT';
    const tenantField = pa ?
      '<div class="sw-form-item"><label>租户ID（留空=全平台）</label><input id="sw-modal-tenant" class="sw-input" placeholder="如 2；平台管理员可指定"></div>' : '';
    const root = document.getElementById('sw-modal-root') || (function () {
      const d = document.createElement('div'); d.id = 'sw-modal-root'; document.body.appendChild(d); return d;
    })();
    root.innerHTML =
      '<div class="sw-modal-mask"><div class="sw-modal">' +
        '<h3>' + (group ? '编辑分组' : '新增分组') + '</h3>' +
        '<div class="sw-form-item"><label>分组名称</label><input id="sw-modal-name" class="sw-input" value="' + esc(name) + '"></div>' +
        '<div class="sw-form-item"><label>默认处理</label><select id="sw-modal-action" class="sw-select"><option value="REJECT"' + (def === 'REJECT' ? ' selected' : '') + '>拒绝发送</option><option value="MASK"' + (def === 'MASK' ? ' selected' : '') + '>掩码放行</option></select></div>' +
        tenantField +
        '<div class="sw-modal-foot"><button class="btn btn-gray" id="sw-modal-cancel">取消</button><button class="btn btn-primary" id="sw-modal-ok">保存</button></div>' +
      '</div></div>';
    root.querySelector('#sw-modal-cancel').addEventListener('click', function () { root.innerHTML = ''; });
    root.querySelector('#sw-modal-ok').addEventListener('click', function () {
      const payload = {
        groupName: root.querySelector('#sw-modal-name').value.trim(),
        defaultAction: root.querySelector('#sw-modal-action').value
      };
      if (!payload.groupName) { alert('请填写分组名称'); return; }
      if (pa) {
        const tv = root.querySelector('#sw-modal-tenant').value.trim();
        payload.tenantId = tv === '' ? 0 : Number(tv);
      }
      const op = group ? mreq.put('/api/v1/sensitive/groups/' + group.groupId, payload)
        : mreq.post('/api/v1/sensitive/groups', payload);
      op.then(function () { root.innerHTML = ''; loadGroups(); }).catch(function () {});
    });
  }

  // ===================== 敏感词 =====================
  function loadWords() {
    if (!state.selectedGroupId) {
      const cur = state.container.querySelector('#sw-cur-group');
      if (cur) cur.textContent = '未选择分组';
      const body = state.container.querySelector('#sw-word-body');
      if (body) body.innerHTML = '<tr><td colspan="3" class="sw-empty">请先在上方选择一个分组。</td></tr>';
      return;
    }
    const g = state.groups.find(function (x) { return String(x.groupId) === String(state.selectedGroupId); });
    const cur = state.container.querySelector('#sw-cur-group');
    if (cur) cur.textContent = g ? g.groupName : '未选择分组';
    mreq.get('/api/v1/sensitive/words', {
      params: { groupId: state.selectedGroupId, keyword: state.keyword, pageNum: state.pageNum, pageSize: state.pageSize }
    }).then(function (pr) {
      state.total = pr.total || 0;
      renderWords(pr.list || []);
      renderPager();
    }).catch(function () {});
  }

  function renderWords(list) {
    const body = state.container.querySelector('#sw-word-body');
    if (!body) return;
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="3" class="sw-empty">该分组暂无敏感词。</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (w) {
      const inherit = !w.action;
      const sel = '<select class="sw-select sw-word-action" data-id="' + esc(w.wordId) + '">' +
        '<option value=""' + (inherit ? ' selected' : '') + '>继承分组默认</option>' +
        '<option value="REJECT"' + (w.action === 'REJECT' ? ' selected' : '') + '>拒绝发送</option>' +
        '<option value="MASK"' + (w.action === 'MASK' ? ' selected' : '') + '>掩码放行</option></select>';
      return '<tr><td>' + esc(w.word) + '</td><td>' + sel + '</td>' +
        '<td><button class="btn btn-gray sw-word-del" data-id="' + esc(w.wordId) + '">删除</button></td></tr>';
    }).join('');

    body.querySelectorAll('.sw-word-action').forEach(function (s) {
      s.addEventListener('change', function () {
        const id = s.getAttribute('data-id');
        const action = s.value === '' ? null : s.value;
        mreq.put('/api/v1/sensitive/words/' + id, { action: action }).catch(function () {});
      });
    });
    body.querySelectorAll('.sw-word-del').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-id');
        if (!confirm('确定删除该敏感词？')) return;
        mreq.delete('/api/v1/sensitive/words/' + id).then(function () { loadWords(); }).catch(function () {});
      });
    });
  }

  function renderPager() {
    const box = state.container.querySelector('#sw-word-pager');
    if (!box) return;
    const total = state.total, ps = state.pageSize, cur = state.pageNum;
    const pages = Math.max(1, Math.ceil(total / ps));
    if (pages <= 1) { box.innerHTML = ''; return; }
    let html = '<button class="btn btn-gray" ' + (cur <= 1 ? 'disabled' : '') + ' data-p="' + (cur - 1) + '">上一页</button>';
    html += '<span style="font-size:13px;color:#666;">第 ' + cur + ' / ' + pages + ' 页（共 ' + total + ' 条）</span>';
    html += '<button class="btn btn-gray" ' + (cur >= pages ? 'disabled' : '') + ' data-p="' + (cur + 1) + '">下一页</button>';
    box.innerHTML = html;
    box.querySelectorAll('button[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.pageNum = Number(b.getAttribute('data-p'));
        loadWords();
      });
    });
  }

  function addWord() {
    if (!state.selectedGroupId) { alert('请先选择分组'); return; }
    const input = state.container.querySelector('#sw-word-input');
    const word = input.value.trim();
    if (!word) { alert('请填写敏感词'); return; }
    const actionSel = state.container.querySelector('#sw-word-action');
    const action = actionSel.value === '' ? null : actionSel.value;
    mreq.post('/api/v1/sensitive/words', { groupId: state.selectedGroupId, word: word, action: action })
      .then(function () { input.value = ''; state.pageNum = 1; loadWords(); })
      .catch(function () {});
  }

  // ===================== 检测预览 =====================
  function doTest() {
    const input = state.container.querySelector('#sw-test-input');
    const text = input.value;
    const resultEl = state.container.querySelector('#sw-test-result');
    const detailEl = state.container.querySelector('#sw-test-detail');
    if (!text.trim()) { resultEl.textContent = ''; detailEl.innerHTML = ''; return; }
    mreq.post('/api/v1/sensitive/test', { text: text }).then(function (d) {
      if (!d.hit) {
        resultEl.innerHTML = '<span style="color:#389e0d;">未命中敏感词</span>';
        detailEl.innerHTML = '';
        return;
      }
      let summary = '';
      if (d.rejected) summary += '<span class="sw-tag sw-tag-reject">命中拒绝词</span> ';
      if (d.masked) summary += '<span class="sw-tag sw-tag-mask">命中掩码词</span> ';
      resultEl.innerHTML = summary;
      const matches = (d.matches || []).map(function (m) {
        return '<span class="sw-match">' + esc(m.word) + ' · ' + (m.action === 'MASK' ? '掩码' : '拒绝') + '</span>';
      }).join('');
      detailEl.innerHTML = '<div style="margin-bottom:6px;">命中词：' + (matches || '无') + '</div>' +
        '<div>掩码预览：<code>' + esc(d.preview) + '</code></div>';
    }).catch(function () {});
  }

  function refreshCache() {
    mreq.post('/api/v1/sensitive/refresh', {}).then(function () {
      if (typeof window.showApiError === 'function') window.showApiError('敏感词缓存已刷新');
      else alert('敏感词缓存已刷新');
    }).catch(function () {});
  }

  // 注册进通用刷新：顶部「刷新」按钮优先调用
  if (typeof window.registerPageRefresh === 'function') {
    window.registerPageRefresh('sensitive_words', function () {
      const c = state.container || document.getElementById('dynamic-content-center');
      if (!c || !document.body.contains(c) || !c.querySelector('.sw-wrap')) return false;
      loadGroups();
      if (state.selectedGroupId) loadWords();
      return true;
    });
  }
})();
