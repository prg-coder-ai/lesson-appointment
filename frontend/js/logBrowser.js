/**
 * 日志浏览器（logBrowser.html）—— 按日期 / 级别 / 关键字查服务器日志。
 *
 * 依赖（均由页面先加载）：
 *   · window.request   utility_request.js 的 axios 实例（响应已解包为 data）
 *   · window.ApiPaths  shared-domain-bridge.js 桥接（LOGS_* 端点常量）
 *
 * ⚠️ 两条铁律，改本文件前先看：
 *   ① 全文包 IIFE。同页还加载 termsFunction.js，它已有顶层 `const EP`——
 *      本文件若在顶层再声明 const/let，会在**解析阶段**抛 SyntaxError
 *      （Identifier 'EP' has already been declared），整个文件一个函数都不注册。
 *      check:global-collide 会拦这类跨脚本碰撞。
 *   ② 页面用内联 `onclick="loadLogs()"`，所以对外入口必须在末尾显式挂到 window。
 *
 * ⚠️ 端点常量不能裸写 ENDPOINTS：shared-domain-bridge.js 是自动生成产物，全文在 IIFE 内，
 *   其顶层 `const ENDPOINTS` 属文件级作用域，不会挂 window、也不会被后续脚本看见。
 *   2026-11-22 就是这样踩的：loadDates/loadLogs 一进去就
 *   `ReferenceError: ENDPOINTS is not defined`，日志页永远空白，
 *   而 dist 里只报 `logBrowser.js:1:76`（压缩后），极难定位。
 *   check:bridge-exports 现在会扫描 frontend/js 里所有裸引 ENDPOINTS 的文件。
 */
(function () {
  'use strict';

  const EP = (window.ApiPaths && window.ApiPaths.ENDPOINTS) || {};
  if (!EP.LOGS_DATES) {
    console.error('[logBrowser] 端点常量未加载：window.ApiPaths.ENDPOINTS 缺失。'
      + '请确认 logBrowser.html 里 shared-domain-bridge.js 先于 logBrowser.js 加载。');
  }

  let autoRefreshTimer = null;

  /** 加载归档日期列表 */
  async function loadDates() {
    // 后端 LogController 的类级映射是 /api/v1/logs，必须带 /v1：
    //   axios 对以 / 开头的 url 会忽略 baseURL（utility_request.js:27），
    //   写成 /api/logs/* 不会自动补前缀，只会落到 nginx 的 location / → try_files → 404。
    if (!EP.LOGS_DATES) return;
    const res = await request(EP.LOGS_DATES);
    const select = document.getElementById('log-date');
    (res || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });
  }

  /** 查询日志 */
  async function loadLogs() {
    const dateEl = document.getElementById('log-date');
    const levelEl = document.getElementById('log-level');
    const keywordEl = document.getElementById('log-keyword');
    const date = dateEl ? dateEl.value : '';
    const level = levelEl ? levelEl.value : '';
    const keyword = keywordEl ? keywordEl.value.trim() : '';

    let url;
    if (keyword || level) {
      url = EP.LOGS_SEARCH(keyword, level, date, 500);
    } else {
      url = date ? EP.LOGS_BY_DATE(date, 1000) : EP.LOGS_TAIL(200);
    }

    const lines = await request(url) || [];
    const content = document.getElementById('log-content');
    content.innerHTML = lines.map(line => {
      const cls = line.includes(' ERROR ') ? 'log-line-ERROR'
        : line.includes(' WARN ') ? 'log-line-WARN'
          : 'log-line-INFO';
      return `<div class="${cls}">${escapeHtml(line)}</div>`;
    }).join('');
    content.scrollTop = content.scrollHeight;
  }

  // 自动刷新
  const autoRefresh = document.getElementById('log-autorefresh');
  if (autoRefresh) {
    autoRefresh.addEventListener('change', e => {
      if (e.target.checked) {
        autoRefreshTimer = setInterval(loadLogs, 3000);
      } else if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    });
  }

  // 内联 onclick 只用这两个入口，其余（autoRefreshTimer 等）不外泄
  window.loadDates = loadDates;
  window.loadLogs = loadLogs;

  // 初始化
  loadDates();
  loadLogs();
})();
