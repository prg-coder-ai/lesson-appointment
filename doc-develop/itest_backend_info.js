/**
 * 无浏览器集成测试：后台信息功能（真实 dist 脚本 + 真实后端 + 真实数据）
 *
 * 覆盖：
 *   1) platform-admin-backend-info.js  —— 平台管理端「系统维护 / 后台信息」TAB 全字段页
 *   2) admin-dataMaintainPage.js       —— admin「数据维护 / 后台信息」Tab（名称/版本/构建时间）
 *
 * 运行： node C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/doc-develop/itest_backend_info.js
 * 前置： 本地 dev 代理 :8080 已启动（dev-frontend-local.js），booking :8081 / message-service :8090 在线
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const BASE = process.env.ITEST_BASE || 'http://127.0.0.1:8080';
const DIST = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/dist';

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 等待渲染完成：predicate(el) 为真或超时 */
async function waitRendered(el, pred, timeout = 12000, interval = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (pred(el)) return true; } catch (_) {}
    await sleep(interval);
  }
  return false;
}

/* ==================== DOM 垫片 ==================== */
function makeEl(id) {
  const el = {
    id: id || '',
    _html: '',
    innerText: '',
    value: '',
    style: {},
    dataset: {},
    _listeners: {},
    _cls: new Set(),
    tagName: 'DIV',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.innerText = String(v).replace(/<[^>]*>/g, ' '); },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild() {},
    setAttribute(k, v) { this.dataset[k] = v; if (k === 'id') this.id = v; },
    getAttribute(k) { return this.dataset[k] !== undefined ? this.dataset[k] : (k === 'id' ? this.id : null); },
    querySelector() { return null; },
    // 与真实 DOM 一致：同一份 innerHTML 下多次查询返回同一批节点（否则后注册的 click 监听器会丢）
    querySelectorAll(sel) {
      this._qsaCache = this._qsaCache || {};
      const hit = this._qsaCache[sel];
      if (hit && hit.__html === this._html) return hit.els;
      const els = parseButtons(this._html, sel);
      this._qsaCache[sel] = { __html: this._html, els };
      return els;
    },
    focus() {}, click() { (this._listeners.click || []).forEach(fn => fn({ target: this })); },
  };
  el.classList = {
    add: (c) => el._cls.add(c),
    remove: (c) => el._cls.delete(c),
    contains: (c) => el._cls.has(c),
    toggle: (c, on) => { if (on === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else { on ? el._cls.add(c) : el._cls.delete(c); } },
  };
  return el;
}

/** 从 innerHTML 里解析出带指定 class 的按钮桩（支持 data-bi-key / data-term 等属性） */
function parseButtons(html, sel) {
  const cls = (sel.match(/\.([\w-]+)/) || [])[1];
  if (!cls) return [];
  const out = [];
  const re = new RegExp('<button[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>', 'g');
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const btn = makeEl();
    const keyM = tag.match(/data-[\w-]+="([^"]*)"/);
    if (keyM) {
      const attr = tag.match(/(data-[\w-]+)="([^"]*)"/);
      btn.setAttribute(attr[1], attr[2]);
    }
    const active = /class="[^"]*\bactive\b/.test(tag) || /class="[^"]*\bactive\b/.test(tag);
    if (active) btn._cls.add('active');
    out.push(btn);
  }
  return out;
}

function makeDocument() {
  const els = new Map();
  const doc = {
    head: { appendChild() {} },
    body: makeEl('body'),
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    createElement(tag) { const e = makeEl(); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    write() {},           // admin-dataMaintainPage.js 顶层用 document.write 引入分页脚本
    createTreeWalker() { return { nextNode() { return null; } }; },
  };
  doc.__els = els;
  doc.body.querySelectorAll = () => [];
  return doc;
}

/* ==================== 沙箱 ==================== */
function makeSandbox() {
  const document = makeDocument();
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document,
    navigator: { userAgent: 'node' },
    location: { href: BASE + '/', hostname: '127.0.0.1', origin: BASE },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    fetch: (u, o) => fetch(String(u).startsWith('http') ? u : BASE + u, o),
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    axios: undefined,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  // request 垫片：模拟 utility_request.js 的 axios 封装（normalizeUrl 补 /api/v1 + 剥信封交给调用方）
  function normalizeUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('/api/v1') === 0) return BASE + url;
    if (url.indexOf('/api/') === 0) return BASE + '/api/v1' + url.slice(4);
    if (url.charAt(0) === '/') return BASE + '/api/v1' + url;
    return url;
  }
  sandbox.request = {
    async get(url) {
      const res = await fetch(normalizeUrl(url));
      const json = await res.json();
      return { status: res.status, data: json };
    },
    async post(url, body) {
      const res = await fetch(normalizeUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const json = await res.json();
      return { status: res.status, data: json };
    },
  };
  sandbox.window.request = sandbox.request;
  return sandbox;
}

function loadFile(sandbox, rel) {
  const code = fs.readFileSync(DIST + '/' + rel, 'utf8');
  vm.runInContext(code, vm.createContext(sandbox), { filename: rel });
}

/* ==================== 测试 ==================== */
(async function main() {
  console.log('目标站点：' + BASE + '（本地 dev 代理，/api/v1/message* 分流至 8090）');

  /* ---------- 1. 平台管理端「后台信息」全字段页 ---------- */
  {
    const sb = makeSandbox();
    loadFile(sb, 'js/platform-admin-backend-info.js');
    check('platform-admin-backend-info.js 暴露 renderBackendInfoPage', typeof sb.renderBackendInfoPage === 'function');

    const host = sb.document.getElementById('dynamic-content-center');
    sb.renderBackendInfoPage(host);

    const okTabs = /bi-tab-btn/.test(host.innerHTML) && /booking_api/.test(host.innerHTML) && /message-service/.test(host.innerHTML);
    check('页面渲染出两个 TAB 按钮（booking_api / message-service）', okTabs, host.innerHTML.slice(0, 200));

    const bodyEl = sb.document.getElementById('bi-body');
    let ok1 = await waitRendered(bodyEl, (el) => /booking_api/.test(el.innerHTML) && /Asia/.test(el.innerHTML));
    check('默认 TAB 加载 booking_api 全字段（含版本/构建时间/时区）',
      ok1 && /2\.0\.0/.test(bodyEl.innerHTML) && /构建时间/.test(bodyEl.innerHTML) && /uptimeMillis/.test(bodyEl.innerHTML),
      bodyEl.innerHTML.slice(0, 300));
    check('booking TAB 未混入 message-service 数据', !/message-service/.test(bodyEl.innerHTML));

    // 点击第二个 TAB（message-service）
    const tabs = host.querySelectorAll('.bi-tab-btn');
    check('解析到 2 个 TAB 元素', tabs.length === 2, '实际 ' + tabs.length);
    if (tabs.length === 2) {
      tabs[1].click();
      // 注意：loading 文案里也含 "message-service"，必须等真正的表格渲染完（或失败提示）再断言
      const ok2 = await waitRendered(bodyEl, (el) =>
        (/<\/table>/.test(el.innerHTML) && /message-service/.test(el.innerHTML)) || /获取失败/.test(el.innerHTML));
      check('切换 TAB 后加载 message-service 全字段',
        ok2 && /1\.0\.0/.test(bodyEl.innerHTML) && /构建时间/.test(bodyEl.innerHTML),
        bodyEl.innerHTML.slice(0, 300));
      check('message TAB 未混入 booking 数据', !/booking_api/.test(bodyEl.innerHTML));
      check('接口走 /api/v1/message/system/info 分流前缀',
        /message\/system\/info/.test(fs.readFileSync(DIST + '/js/platform-admin-backend-info.js', 'utf8')));
    }
  }

  /* ---------- 2. admin 数据维护「后台信息」Tab ---------- */
  {
    const sb = makeSandbox();
    sb.setTimeout = () => {};   // 跳过文件末尾的自动选中模板 Tab（依赖分页组件）
    loadFile(sb, 'js/admin-dataMaintainPage.js');
    check('admin-dataMaintainPage.js 暴露 renderBackendBriefInfo', typeof sb.renderBackendBriefInfo === 'function');
    check('admin-dataMaintainPage.js 暴露 selectMaintainTab', typeof sb.selectMaintainTab === 'function');

    const container = sb.document.getElementById('maintain-content');
    sb.renderBackendBriefInfo(container);

    const box = sb.document.getElementById('backend-brief-box');
    const ok3 = await waitRendered(box, (el) => /<\/table>/.test(el.innerHTML));
    const html = box.innerHTML;
    check('后台信息 Tab 渲染出表格', ok3, html.slice(0, 200));
    check('表格含 booking_api 一行（名称/版本/构建时间）',
      /booking_api/.test(html) && /2\.0\.0/.test(html) && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(html),
      html.slice(0, 400));
    check('表格含 message-service 一行（经 /api/v1/message 分流）',
      /message-service/.test(html) && /1\.0\.0/.test(html),
      html.slice(0, 400));
    check('两行均无“获取失败”', !/获取失败/.test(html), html.slice(0, 300));
    check('表头为 程序/名称/版本/构建时间', /<th>程序<\/th>/.test(html) && /<th>版本<\/th>/.test(html) && /<th>构建时间<\/th>/.test(html));
  }

  console.log('\n==== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL ====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(1); });
