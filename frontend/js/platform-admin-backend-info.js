/**
 * 平台管理端 —— 系统维护 / 后台信息
 *
 * 功能：以 TAB button 切换，分别展示 booking_api 与 message-service 的
 *      GET /api/v1/system/info（getApiInfo）返回的**全部字段**。
 *
 * 接口路径说明（关键）：
 *   - booking_api      ：/system/info            -> /api/v1/system/info
 *   - message-service  ：/message/system/info    -> /api/v1/message/system/info
 *     后者带 /api/v1/message 前缀，才能被前端站点（Nginx / 本地开发代理）的
 *     分流规则转发到 8090；否则 /api/v1/system/info 会被当成 booking 的接口。
 *
 * 两个接口均为匿名可访问（后端已放行），无需 token。
 */
(function () {
  'use strict';

  /* ==================== 样式（内联注入，不依赖外部 CSS） ==================== */
  function injectBackendInfoStyles() {
    if (document.getElementById('backendInfo-style')) return;
    var style = document.createElement('style');
    style.id = 'backendInfo-style';
    style.innerHTML = `
      .bi-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.06); overflow: hidden; }
      .bi-card-header { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; }
      .bi-card-title { font-size: 16px; font-weight: 600; color: #333; display: flex; align-items: center; gap: 8px; }
      .bi-card-title i { color: #722ed1; }
      .bi-tab-bar { display: flex; gap: 12px; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
      .bi-tab-btn { padding: 8px 20px; background: #fff; color: #555; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; transition: all .2s; }
      .bi-tab-btn:hover { border-color: #722ed1; color: #722ed1; background: #f9f0ff; }
      .bi-tab-btn.active { background: #722ed1; color: #fff; border-color: #722ed1; box-shadow: 0 2px 6px rgba(114,46,209,.25); }
      .bi-body { padding: 4px 20px 20px; }
      .bi-info-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
      .bi-info-table th, .bi-info-table td { padding: 10px 14px; border-bottom: 1px solid #f0f0f0; text-align: left; vertical-align: top; }
      .bi-info-table th { width: 200px; color: #7f8c8d; font-weight: 500; background: #fafafa; white-space: nowrap; }
      .bi-info-table td { color: #2c3e50; font-family: Consolas, Monaco, monospace; word-break: break-all; }
      .bi-info-table tr:hover td { background: #fcfcfc; }
      .bi-group-title { font-size: 13px; font-weight: 600; color: #722ed1; margin: 18px 0 6px; display: flex; align-items: center; gap: 6px; }
      .bi-loading { padding: 40px 0; text-align: center; color: #999; font-size: 14px; }
      .bi-error { padding: 40px 0; text-align: center; color: #f5222d; font-size: 14px; }
      .bi-ok-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #52c41a; margin-right: 6px; }
      .bi-bad-down { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f5222d; margin-right: 6px; }
    `;
    document.head.appendChild(style);
  }

  /* ==================== 数据源定义 ==================== */
  var BACKEND_SERVICES = [
    {
      key: 'booking',
      label: 'booking_api',
      desc: '预约系统业务后台（:8081）',
      icon: 'fa-database',
      url: '/system/info'
    },
    {
      key: 'message',
      label: 'message-service',
      desc: '消息中心微服务（:8090）',
      icon: 'fa-comments',
      url: '/message/system/info'
    }
  ];

  /**
   * 加载序号：用于丢弃「已被取代的旧响应」。
   *
   * 场景：快速连续切换 TAB（或连点刷新）时，先发出的请求可能后返回，
   *       若不校验就会把上一个 TAB 的数据覆盖到当前 TAB 上，造成
   *       「点了 message-service 却显示 booking_api」的错乱。
   * 做法：每次 activate 递增序号，异步返回后比对，不一致则丢弃。
   */
  var loadSeq = 0;

  /* 字段中文标签（按后端 ServiceInfo 字段顺序） */
  var FIELD_LABELS = [
    { key: 'service',        label: '服务标识 service' },
    { key: 'appName',        label: '程序名称 appName' },
    { key: 'version',        label: '版本 version' },
    { key: 'buildTime',      label: '构建时间 buildTime' },
    { key: 'serverTime',     label: '服务器时间 serverTime' },
    { key: 'startTime',      label: '启动时间 startTime' },
    { key: 'uptime',         label: '已运行时长 uptime' },
    { key: 'uptimeMillis',   label: '已运行时长(毫秒) uptimeMillis' },
    { key: 'status',         label: '运行状态 status' },
    { key: 'description',    label: '服务说明 description' }
  ];

  var TIMEZONE_LABELS = [
    { key: 'id',          label: '时区 ID' },
    { key: 'displayName', label: '时区名称' },
    { key: 'utcOffset',   label: 'UTC 偏移' },
    { key: 'description', label: '完整描述' }
  ];

  /* ==================== 请求 ==================== */
  async function fetchApiInfo(url) {
    var http = (typeof window.request !== 'undefined') ? window.request : window.axios;
    if (!http) throw new Error('请求工具未加载（缺少 request / axios）');
    var res = await http.get(url, { timeout: 15000 });
    // 兼容两种返回：拦截器返回 data，或原始 response
    var body = (res && res.data) ? res.data : res;
    if (!body) throw new Error('返回为空');
    if (body.code !== undefined && body.code !== 200) {
      throw new Error((body.message || ('接口返回 code=' + body.code)));
    }
    return body.data || {};
  }

  function esc(v) {
    if (v === null || v === undefined || v === '') return '<span style="color:#bbb;">—</span>';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ==================== 渲染 ==================== */
  function renderInfoTable(info) {
    var rows = '';
    FIELD_LABELS.forEach(function (f) {
      var val = info[f.key];
      if (f.key === 'status') {
        var up = (String(val).toUpperCase() === 'UP');
        val = '<span class="' + (up ? 'bi-ok-dot' : 'bi-bad-down') + '"></span>' + esc(val);
      } else if (f.key === 'uptimeMillis' && typeof val === 'number') {
        val = esc(val.toLocaleString()) + ' ms';
      } else {
        val = esc(val);
      }
      rows += '<tr><th>' + f.label + '</th><td>' + val + '</td></tr>';
    });

    var tz = info.timezone || {};
    var tzRows = '';
    TIMEZONE_LABELS.forEach(function (f) {
      tzRows += '<tr><th>' + f.label + ' timezone.' + f.key + '</th><td>' + esc(tz[f.key]) + '</td></tr>';
    });

    return (
      '<div class="bi-group-title"><i class="fa fa-info-circle"></i> 基本信息</div>' +
      '<table class="bi-info-table"><tbody>' + rows + '</tbody></table>' +
      '<div class="bi-group-title"><i class="fa fa-globe"></i> 时区信息</div>' +
      '<table class="bi-info-table"><tbody>' + tzRows + '</tbody></table>'
    );
  }

  async function loadServiceInfo(service, bodyEl, seq) {
    bodyEl.innerHTML = '<div class="bi-loading"><i class="fa fa-spinner fa-spin"></i> 正在获取 ' + service.label + ' 的运行信息...</div>';
    try {
      var info = await fetchApiInfo(service.url);
      if (seq !== loadSeq) return;   // 已被更新的请求取代，丢弃本次结果
      window.__backendInfoCache = window.__backendInfoCache || {};
      window.__backendInfoCache[service.key] = info;
      bodyEl.innerHTML = renderInfoTable(info);
    } catch (e) {
      if (seq !== loadSeq) return;   // 同上：失败提示也不应覆盖当前 TAB
      bodyEl.innerHTML =
        '<div class="bi-error"><i class="fa fa-exclamation-circle"></i> 获取失败：' + esc(e && e.message ? e.message : String(e)) +
        '<div style="margin-top:10px;color:#999;font-size:12px;">接口：' + esc(service.url) + '（' + esc(service.desc) + '）</div></div>';
    }
  }

  /**
   * 页面入口：平台管理端「系统维护 → 后台信息」
   * @param {HTMLElement} container 动态内容容器（dynamic-content-center）
   */
  window.renderBackendInfoPage = function (container) {
    injectBackendInfoStyles();
    var host = container || document.getElementById('dynamic-content-center');
    if (!host) return;

    host.innerHTML = `
      <div class="bi-card">
        <div class="bi-card-header">
          <div class="bi-card-title"><i class="fa fa-server"></i> 后台信息</div>
          <button class="btn btn-default btn-sm" id="bi-refresh-btn"><i class="fa fa-refresh"></i> 刷新</button>
        </div>
        <div class="bi-tab-bar">
          ${BACKEND_SERVICES.map(function (s, i) {
            return `<button class="bi-tab-btn ${i === 0 ? 'active' : ''}" data-bi-key="${s.key}">
                      <i class="fa ${s.icon}"></i> ${s.label}
                    </button>`;
          }).join('')}
        </div>
        <div class="bi-body" id="bi-body"></div>
      </div>`;

    var bodyEl = document.getElementById('bi-body');
    var tabs = host.querySelectorAll('.bi-tab-btn');

    function activate(key) {
      tabs.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-bi-key') === key);
      });
      var svc = BACKEND_SERVICES.filter(function (s) { return s.key === key; })[0] || BACKEND_SERVICES[0];
      loadServiceInfo(svc, bodyEl, ++loadSeq);
    }

    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activate(btn.getAttribute('data-bi-key'));
      });
    });

    var refreshBtn = document.getElementById('bi-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        var active = host.querySelector('.bi-tab-btn.active');
        activate(active ? active.getAttribute('data-bi-key') : BACKEND_SERVICES[0].key);
      });
    }

    activate(BACKEND_SERVICES[0].key);
  };

  /* 供 admin.html「数据维护 → 后台信息」Tab 复用的简版取数方法 */
  window.fetchBackendApiInfo = fetchApiInfo;
  window.BACKEND_SERVICE_SOURCES = BACKEND_SERVICES;
})();
