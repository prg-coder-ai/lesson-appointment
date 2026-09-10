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
      .bi-endpoint-bar { padding: 12px 20px; background: #faf8ff; border-bottom: 1px solid #f0f0f0; }
      .bi-endpoint-item { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; padding: 3px 0; }
      .bi-endpoint-name { min-width: 130px; color: #555; font-weight: 600; }
      .bi-endpoint-name i { color: #722ed1; margin-right: 5px; }
      .bi-endpoint-url { font-family: Consolas, Monaco, monospace; color: #2c3e50; background: #fff; border: 1px solid #ececec; border-radius: 3px; padding: 1px 7px; }
      .bi-endpoint-desc { color: #999; }
      .bi-group-title { font-size: 13px; font-weight: 600; color: #722ed1; margin: 18px 0 6px; display: flex; align-items: center; gap: 6px; }
      .bi-loading { padding: 40px 0; text-align: center; color: #999; font-size: 14px; }
      .bi-error { padding: 40px 0; text-align: center; color: #f5222d; font-size: 14px; }
      .bi-ok-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #52c41a; margin-right: 6px; }
      .bi-bad-down { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #f5222d; margin-right: 6px; }
      .bi-frontend-build { padding: 12px 20px; background: #f7faff; border-bottom: 1px solid #f0f0f0; }
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
      url: '/system/info',
      prefix: '/api/v1'            // 前端站点转发前缀：拼到站点 origin 后即前端实际请求地址
    },
    {
      key: 'message',
      label: 'message-service',
      desc: '消息中心微服务（:8090）',
      icon: 'fa-comments',
      url: '/message/system/info',
      prefix: '/api/v1/message'    // 带 /message 前缀才会被前端站点分流到 :8090
    }
  ];

  /** 当前前端所在站点地址（origin），如 http://152.136.254.127 或 http://localhost:8080 */
  function siteOrigin() {
    try {
      if (window.location && window.location.origin && window.location.origin !== 'null') {
        return window.location.origin;
      }
      if (window.location) {
        return window.location.protocol + '//' + window.location.host;
      }
    } catch (e) { /* 非浏览器环境，走兜底 */ }
    return '';
  }

  /** 前端实际请求该服务的地址（站点 origin + 转发前缀） */
  function endpointOf(svc) {
    return siteOrigin() + (svc && svc.prefix ? svc.prefix : '');
  }

  /**
   * 服务实际监听地址：优先取 connection.listenAddress:listenPort（本进程真实绑定的网卡与端口，
   * 0.0.0.0 表示监听全部网卡）；接口未返回 connection 时回退 hostAddress:port（主机网卡 IP）。
   */
  function listenAddressOf(info) {
    var conn = (info && info.connection) ? info.connection : null;
    if (conn) {
      var la = conn.listenAddress, lp = conn.listenPort;
      if (la) return (lp ? (la + ':' + lp) : la);
    }
    var host = (info && info.hostAddress) ? info.hostAddress : '';
    var port = (info && info.port) ? info.port : '';
    if (!host) return '';
    return port ? (host + ':' + port) : host;
  }

  /**
   * 实际连过去的服务器 IP（请求侧）：后端把浏览器访问的 Host 头做 DNS 解析后的结果。
   * 没有解析结果时回退 Host 头本身。
   */
  function connectedIpOf(info) {
    var conn = (info && info.connection) ? info.connection : null;
    if (!conn) return '';
    return conn.requestHostIp || conn.requestHost || '';
  }

  /* 连接信息字段标签（三层：请求侧 / 转发侧 / 服务侧） */
  var CONNECTION_LABELS = [
    { key: 'scheme',        label: '请求协议 scheme' },
    { key: 'requestHost',   label: '浏览器访问地址 Host' },
    { key: 'requestHostIp', label: '域名解析 IP（实际连过去）' },
    { key: 'clientIp',      label: '真实客户端 IP' },
    { key: 'forwardedFor',  label: 'X-Forwarded-For' },
    { key: 'remoteAddress', label: '连接对端 IP（与本服务握手方）' },
    { key: 'remotePort',    label: '连接对端端口' },
    { key: 'viaProxy',      label: '经由反向代理' },
    { key: 'listenAddress', label: '本服务监听地址' },
    { key: 'listenPort',    label: '本服务监听端口' }
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

  /**
   * 统一解包 —— 必须兼容三种形态，否则会出现"接口有数据、页面却空白"：
   *   ① window.request（utility_request.js）的响应拦截器在 code=200 时**已经把 data 解包返回**，
   *      此时 payload 就是 ServiceInfo 本体（没有 code/data 外壳）——浏览器里真实走的正是这条；
   *   ② 原始 axios 响应：{ status, config, data: { code, message, data } }；
   *   ③ 裸 Result 体：{ code, message, data }。
   * 旧实现固定先取 res.data 再取 .data，在形态①下会得到空对象 {} —— 页面于是空白且不报错。
   */
  function unwrapPayload(payload) {
    var p = payload;
    // ① 剥掉原始 axios 响应外壳（只有带 status/config 的才是响应对象，ServiceInfo 没有这些字段）
    if (p && p.data && typeof p.data === 'object' && (p.status !== undefined || p.config)) {
      p = p.data;
    }
    // ② 若仍是 Result 体，校验 code 后取 data
    if (p && typeof p === 'object' && p.code !== undefined && ('data' in p)) {
      if (p.code !== 200) {
        throw new Error(p.message || p.msg || ('接口返回 code=' + p.code));
      }
      return p.data || {};
    }
    // ③ 拦截器已解包：payload 本身就是业务数据
    return p || {};
  }

  async function fetchApiInfo(url) {
    var http = (typeof window.request !== 'undefined') ? window.request : window.axios;
    if (!http) throw new Error('请求工具未加载（缺少 request / axios）');
    try {
      var res = await http.get(url, { timeout: 15000 });
      var info = unwrapPayload(res);
      // 解包后必须有内容：宁可显式报错，也不要渲染一张空表让人以为"接口没数据"
      if (!info || typeof info !== 'object' || Object.keys(info).length === 0) {
        throw new Error('接口未返回数据（解包后为空）');
      }
      return info;
    } catch (e) {
      throw new Error('请求失败：' + (e && e.message ? e.message : String(e)));
    }
  }

  function esc(v) {
    if (v === null || v === undefined || v === '') return '<span style="color:#bbb;">—</span>';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 渲染「前端构建信息」块：优先读 window.__BUILD_INFO__（由 build.js 烤进 index.html），
   *  缺失时回退 fetch 同目录 build-info.json；都拿不到则提示不可用。 */
  function renderFrontendBuildInfo(el) {
    function fill(info) {
      if (!info || (!info.buildTime && !info.gitCommit)) {
        el.innerHTML = '<span style="color:#999;">前端构建信息不可用（dist 未含 build-info.json）</span>';
        return;
      }
      var rows = [
        ['打包时间 buildTime', info.buildTime],
        ['Git 提交 gitCommit', info.gitCommit],
        ['Git 分支 gitBranch', info.gitBranch],
        ['工作区是否脏 gitDirty', info.gitDirty ? '是（构建时存在未提交改动）' : '否']
      ];
      el.innerHTML =
        '<div class="bi-group-title" style="margin:0 0 6px;"><i class="fa fa-cube"></i> 前端构建信息（本静态包）</div>' +
        '<table class="bi-info-table"><tbody>' +
        rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }
    if (window.__BUILD_INFO__) { fill(window.__BUILD_INFO__); return; }
    try {
      fetch('build-info.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (info) { fill(info); })
        .catch(function () { fill(null); });
    } catch (e) { fill(null); }
  }

  /* ==================== 渲染 ==================== */
  function renderInfoTable(info, svc) {
    var conn = (info && info.connection) ? info.connection : null;

    // 连接信息置顶：调用地址（URL 前缀）、实际解析 IP、握手对端、本服务监听、链路摘要
    var connRows = '<tr><th>前端调用地址 endpoint（URL 前缀）</th><td>' + esc(endpointOf(svc)) + '</td></tr>';
    connRows += '<tr><th>实际连接 IP（Host 解析结果）</th><td>' + esc(connectedIpOf(info)) + '</td></tr>';
    CONNECTION_LABELS.forEach(function (f) {
      var val = conn ? conn[f.key] : null;
      if (f.key === 'viaProxy') {
        val = (val === true || String(val) === 'true') ? '是（经 Nginx 等反代转发）' : '否（客户端直连本服务）';
      }
      connRows += '<tr><th>' + f.label + ' connection.' + f.key + '</th><td>' + esc(val) + '</td></tr>';
    });
    connRows += '<tr><th>本服务监听 listenAddress:listenPort</th><td>' + esc(listenAddressOf(info)) + '</td></tr>';
    // 主机网卡 IP：与「监听地址」区分开（多网卡/容器场景下两者不同，排查时很有用）
    connRows += '<tr><th>主机网卡 IP hostAddress</th><td>' + esc(info && info.hostAddress) + '</td></tr>';
    connRows += '<tr><th>服务端口 port</th><td>' + esc(info && info.port) + '</td></tr>';
    if (conn && conn.summary) {
      connRows += '<tr><th>链路摘要 connection.summary</th><td>' + esc(conn.summary) + '</td></tr>';
    }

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
      '<div class="bi-group-title"><i class="fa fa-plug"></i> 连接信息（三层地址）</div>' +
      '<table class="bi-info-table"><tbody>' + connRows + '</tbody></table>' +
      '<div class="bi-group-title"><i class="fa fa-info-circle"></i> 基本信息</div>' +
      '<table class="bi-info-table"><tbody>' + rows + '</tbody></table>' +
      '<div class="bi-group-title"><i class="fa fa-globe"></i> 时区信息</div>' +
      '<table class="bi-info-table"><tbody>' + tzRows + '</tbody></table>'
    );
  }

  /** 顶部总览条回写「实际连接 IP」（由后端解析 Host 头得到） */
  function updateEndpointIp(key, info) {
    var el = document.getElementById('bi-endpoint-ip-' + key);
    if (!el) return;
    var ip = connectedIpOf(info);
    el.textContent = ip ? ('实际连接 IP：' + ip) : '';
  }

  async function loadServiceInfo(service, bodyEl, seq) {
    bodyEl.innerHTML = '<div class="bi-loading"><i class="fa fa-spinner fa-spin"></i> 正在获取 ' + service.label + ' 的运行信息...</div>';
    try {
      var info = await fetchApiInfo(service.url);
      if (seq !== loadSeq) return;   // 已被更新的请求取代，丢弃本次结果
      window.__backendInfoCache = window.__backendInfoCache || {};
      window.__backendInfoCache[service.key] = info;
      updateEndpointIp(service.key, info);
      bodyEl.innerHTML = renderInfoTable(info, service);
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
        <div class="bi-endpoint-bar" id="bi-endpoint-bar">
          ${BACKEND_SERVICES.map(function (s) {
            return `<div class="bi-endpoint-item">
                      <span class="bi-endpoint-name"><i class="fa ${s.icon}"></i> ${s.label}</span>
                      <code class="bi-endpoint-url" data-endpoint-key="${s.key}">${endpointOf(s)}</code>
                      <span class="bi-endpoint-desc">${s.desc}</span>
                      <span class="bi-endpoint-ip" id="bi-endpoint-ip-${s.key}"></span>
                    </div>`;
          }).join('')}
        </div>
        <div class="bi-frontend-build" id="bi-frontend-build"></div>
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
    renderFrontendBuildInfo(document.getElementById('bi-frontend-build'));
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
