/**
 * 字段级集成测试：后台信息页 —— 校验「后端返回字段」与「页面渲染内容」逐一对应
 *
 * 与 itest_backend_info.js（结构冒烟）的区别：
 *   本脚本做 **数据传递正确性** 验证 —— 不只检查字段有没有出现，而是检查
 *   每个字段「后端的值」是否真的、且正确地渲染到了页面上，并识别动态字段。
 *
 * 覆盖：
 *   A. 平台管理端「系统维护 / 后台信息」TAB 全字段页（booking + message-service 两个 TAB）
 *   B. admin「数据维护 / 后台信息」Tab 简表（名称/版本/构建时间）
 *   C. 数据传递链路：经前端站点 :8080 的分流路径是否取到正确的服务
 *   D. 异常降级：后端不可达时是否显示「获取失败」而非白屏
 *
 * 字段分类：
 *   - 稳定字段（可精确比对）：service / appName / version / buildTime / startTime / status / description / timezone.*
 *   - 动态字段（每次请求都变，只能验格式与自洽）：serverTime / uptime / uptimeMillis
 *
 * 运行： node doc-develop/itest_backend_info_fields.js
 * 前置： 本地 dev 代理 :8080（dev-frontend-local.js）、booking :8081、message-service :8090
 */
'use strict';
const fs = require('fs');
const vm = require('vm');

const BASE = process.env.ITEST_BASE || 'http://127.0.0.1:8080';
const DIST = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/dist';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else {
    fail++; failures.push(name + (extra ? ' | ' + extra : ''));
    console.log('  FAIL  ' + name + (extra ? '\n        -> ' + extra : ''));
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitRendered(el, pred, timeout = 15000, interval = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (pred(el)) return true; } catch (_) {}
    await sleep(interval);
  }
  return false;
}

/* ==================== DOM 垫片（与 itest_backend_info.js 一致） ==================== */
function makeEl(id) {
  const el = {
    id: id || '', _html: '', innerText: '', value: '', style: {}, dataset: {},
    _listeners: {}, _cls: new Set(), tagName: 'DIV',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.innerText = String(v).replace(/<[^>]*>/g, ' '); },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {}, appendChild() {},
    setAttribute(k, v) { this.dataset[k] = v; if (k === 'id') this.id = v; },
    getAttribute(k) { return this.dataset[k] !== undefined ? this.dataset[k] : (k === 'id' ? this.id : null); },
    querySelector() { return null; },
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
    add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c),
    contains: (c) => el._cls.has(c),
    toggle: (c, on) => { if (on === undefined) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); } else { on ? el._cls.add(c) : el._cls.delete(c); } },
  };
  return el;
}
function parseButtons(html, sel) {
  const cls = (sel.match(/\.([\w-]+)/) || [])[1];
  if (!cls) return [];
  const out = [];
  const re = new RegExp('<button[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>', 'g');
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const btn = makeEl();
    const attr = tag.match(/(data-[\w-]+)="([^"]*)"/);
    if (attr) btn.setAttribute(attr[1], attr[2]);
    if (/class="[^"]*\bactive\b/.test(tag)) btn._cls.add('active');
    out.push(btn);
  }
  return out;
}
function makeDocument() {
  const els = new Map();
  const doc = {
    head: { appendChild() {} }, body: makeEl('body'),
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement(tag) { const e = makeEl(); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, write() {},
    createTreeWalker() { return { nextNode() { return null; } }; },
  };
  doc.__els = els;
  doc.body.querySelectorAll = () => [];
  return doc;
}
function makeSandbox(base) {
  const document = makeDocument();
  const store = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, document,
    navigator: { userAgent: 'node' },
    location: { href: base + '/', hostname: '127.0.0.1', origin: base },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k), clear: () => store.clear(),
    },
    fetch: (u, o) => fetch(String(u).startsWith('http') ? u : base + u, o),
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    axios: undefined,
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  function normalizeUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('/api/v1') === 0) return base + url;
    if (url.indexOf('/api/') === 0) return base + '/api/v1' + url.slice(4);
    if (url.charAt(0) === '/') return base + '/api/v1' + url;
    return url;
  }
  // 注意：这里必须显式走 sandbox.fetch（而非裸 fetch）——
  // 本函数是宿主函数，裸 fetch 会解析成 Node 全局 fetch，导致外部替换沙箱 fetch 无效（竞态用例会假阳性）。
  sandbox.request = {
    async get(url) {
      const res = await sandbox.fetch(normalizeUrl(url));
      const json = await res.json();
      return { status: res.status, data: json };
    },
    async post(url, body) {
      const res = await sandbox.fetch(normalizeUrl(url), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      const json = await res.json();
      return { status: res.status, data: json };
    },
  };
  sandbox.window.request = sandbox.request;
  return sandbox;
}
function loadFile(sandbox, rel) {
  vm.runInContext(fs.readFileSync(DIST + '/' + rel, 'utf8'), vm.createContext(sandbox), { filename: rel });
}

/* ==================== 取值工具 ==================== */
async function jget(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, json: await res.json() };
}
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 从渲染后的 HTML 中取出 <th>label</th><td>值</td> 的值部分 */
function cellValue(html, labelPart) {
  const re = new RegExp('<th>([^<]*' + labelPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*)</th><td>([\\s\\S]*?)</td>');
  const m = html.match(re);
  if (!m) return null;
  return m[2].replace(/<[^>]*>/g, '').trim();
}

/* ==================== 主流程 ==================== */
(async function main() {
  console.log('目标站点：' + BASE + '（前端站点；/api/v1/message* 分流至 :8090，其余 /api/v1 至 :8081）\n');

  /* ---------- 0. 数据传递链路：经 :8080 能否取到两个服务各自的真实数据 ---------- */
  console.log('【A】数据传递链路（经前端站点 :8080）');
  const bk = await jget('/api/v1/system/info');
  const ms = await jget('/api/v1/message/system/info');
  check('GET /api/v1/system/info 返回 200', bk.status === 200, 'HTTP ' + bk.status);
  check('GET /api/v1/message/system/info 返回 200', ms.status === 200, 'HTTP ' + ms.status);

  const bkData = (bk.json && bk.json.data) || {};
  const msData = (ms.json && ms.json.data) || {};
  check('booking 接口 data.service = booking_api', bkData.service === 'booking_api', JSON.stringify(bkData.service));
  check('message 接口 data.service = message-service（分流未串到 booking）',
    msData.service === 'message-service', JSON.stringify(msData.service));

  /* ---------- 1. 平台管理端全字段页 ---------- */
  console.log('\n【B】平台管理端「系统维护 / 后台信息」TAB 全字段页');
  const sb = makeSandbox(BASE);
  loadFile(sb, 'js/platform-admin-backend-info.js');
  const host = sb.document.getElementById('dynamic-content-center');
  sb.renderBackendInfoPage(host);
  const bodyEl = sb.document.getElementById('bi-body');

  const STABLE_FIELDS = [
    ['service', '服务标识'], ['appName', '程序名称'], ['version', '版本'],
    ['buildTime', '构建时间'], ['startTime', '启动时间'],
    ['status', '运行状态'], ['description', '服务说明'],
  ];
  const TZ_FIELDS = [['id', '时区 ID'], ['displayName', '时区名称'], ['utcOffset', 'UTC 偏移'], ['description', '完整描述']];

  async function verifyTab(serviceName, expectData, foreignService, foreignData) {
    console.log('  -- TAB: ' + serviceName + ' --');
    const ok = await waitRendered(bodyEl, (el) =>
      (/<\/table>/.test(el.innerHTML) && el.innerHTML.indexOf(expectData.service) >= 0) || /获取失败/.test(el.innerHTML));
    check('  渲染完成（出现表格且含本服务标识）', ok, bodyEl.innerHTML.slice(0, 200));

    const html = bodyEl.innerHTML;

    // 稳定字段：精确值比对
    for (const [key, label] of STABLE_FIELDS) {
      const expect = expectData[key];
      const actual = cellValue(html, label);
      if (key === 'status') {
        check('  字段 status 渲染正确（期望 ' + expect + '）', actual === String(expect), '实际=' + actual);
        continue;
      }
      check('  字段 ' + key + ' 渲染正确（期望 "' + expect + '"）',
        actual === String(expect), '实际=' + JSON.stringify(actual));
    }

    // 时区字段：精确值比对
    const tz = expectData.timezone || {};
    for (const [key, label] of TZ_FIELDS) {
      const actual = cellValue(html, 'timezone.' + key);
      check('  字段 timezone.' + key + ' 渲染正确（期望 "' + tz[key] + '"）',
        actual === String(tz[key]), '实际=' + JSON.stringify(actual));
    }

    // 动态字段：格式 + 自洽
    const stActual = cellValue(html, '服务器时间');
    check('  动态字段 serverTime 格式正确（yyyy-MM-dd HH:mm:ss）',
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stActual || ''), '实际=' + stActual);

    const upActual = cellValue(html, '已运行时长 uptime');   // 精确匹配带英文 key 的那行
    check('  动态字段 uptime 格式正确（N 天 N 小时 N 分 N 秒）',
      /^\d+ 天 \d+ 小时 \d+ 分 \d+ 秒$/.test(upActual || ''), '实际=' + upActual);

    const millisActual = cellValue(html, 'uptimeMillis');
    const millisNum = Number(String(millisActual || '').replace(/[^\d]/g, ''));
    check('  动态字段 uptimeMillis 为带千分位的毫秒数',
      /^[\d,]+ ms$/.test(millisActual || '') && millisNum > 0, '实际=' + millisActual);

    // 自洽：uptime 文案推算的秒数 与 uptimeMillis 应一致（允许 3 秒误差，两次请求间隔）
    if (upActual && millisNum > 0) {
      const m = upActual.match(/(\d+) 天 (\d+) 小时 (\d+) 分 (\d+) 秒/);
      if (m) {
        const sec = (+m[1]) * 86400 + (+m[2]) * 3600 + (+m[3]) * 60 + (+m[4]);
        const diff = Math.abs(sec * 1000 - millisNum);
        check('  uptime 与 uptimeMillis 自洽（误差 < 3s）', diff < 3000,
          'uptime=' + sec + 's, millis=' + millisNum + 'ms, 差=' + diff + 'ms');
      }
    }

    // 交叉污染：不能出现对方服务的独有值
    check('  未混入 ' + foreignService + ' 的服务标识', html.indexOf(foreignData.service) < 0);
    check('  未混入 ' + foreignService + ' 的版本号', html.indexOf('>' + foreignData.version + '<') < 0);
    check('  未混入 ' + foreignService + ' 的构建时间', html.indexOf(foreignData.buildTime) < 0);
    check('  未混入 ' + foreignService + ' 的服务说明', html.indexOf(foreignData.description) < 0);
  }

  await verifyTab('booking_api', bkData, 'message-service', msData);

  const tabs = host.querySelectorAll('.bi-tab-btn');
  check('解析到 2 个 TAB 按钮', tabs.length === 2, '实际 ' + tabs.length);
  if (tabs.length === 2) {
    tabs[1].click();
    await verifyTab('message-service', msData, 'booking_api', bkData);
  }

  /* ---------- 2. admin 数据维护简表 ---------- */
  console.log('\n【C】admin「数据维护 / 后台信息」Tab 简表');
  {
    const sb2 = makeSandbox(BASE);
    sb2.setTimeout = () => {};
    loadFile(sb2, 'js/admin-dataMaintainPage.js');
    const container = sb2.document.getElementById('maintain-content');
    sb2.renderBackendBriefInfo(container);
    const box = sb2.document.getElementById('backend-brief-box');
    const ok = await waitRendered(box, (el) => /<\/table>/.test(el.innerHTML));
    const html = box.innerHTML;
    check('简表渲染完成', ok, html.slice(0, 200));

    // 逐行取值：解析 <tr><td>..</td><td>..</td><td>..</td><td>..</td><td>..</td></tr>
    const rows = [];
    const trRe = /<tr>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = trRe.exec(html))) {
      const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]*>/g, '').trim());
      if (tds.length >= 4) rows.push(tds);
    }
    check('简表解析出 2 行数据（booking + message-service）', rows.length === 2, '实际 ' + rows.length + ' 行: ' + JSON.stringify(rows));

    if (rows.length === 2) {
      const [r1, r2] = rows;
      check('第1行 程序 = booking_api', r1[0] === 'booking_api', JSON.stringify(r1));
      check('第1行 名称 = ' + bkData.appName, r1[1] === bkData.appName, '实际=' + r1[1]);
      check('第1行 版本 = ' + bkData.version, r1[2] === bkData.version, '实际=' + r1[2]);
      check('第1行 构建时间 = ' + bkData.buildTime, r1[3] === bkData.buildTime, '实际=' + r1[3]);

      const expectedMsgName = msData.appName;
      const r2ok = (r2[0] === 'message-service' || r2[0] === expectedMsgName);
      check('第2行 程序 = message-service', r2ok, JSON.stringify(r2));
      check('第2行 名称 = ' + expectedMsgName, r2[1] === expectedMsgName, '实际=' + r2[1]);
      check('第2行 版本 = ' + msData.version, r2[2] === msData.version, '实际=' + r2[2]);
      check('第2行 构建时间 = ' + msData.buildTime, r2[3] === msData.buildTime, '实际=' + r2[3]);
      check('两行构建时间不同（确实来自两个不同服务）', r1[3] !== r2[3], r1[3] + ' vs ' + r2[3]);
    }
    check('简表无“获取失败”', !/获取失败/.test(html), html.slice(0, 300));
  }

  /* ---------- 3. 异常降级：后端不可达 ---------- */
  console.log('\n【D】异常场景：后端不可达时的降级');
  {
    const DEAD = 'http://127.0.0.1:59999';   // 必然无监听
    const sb3 = makeSandbox(DEAD);
    loadFile(sb3, 'js/platform-admin-backend-info.js');
    const h3 = sb3.document.getElementById('dynamic-content-center');
    sb3.renderBackendInfoPage(h3);
    const b3 = sb3.document.getElementById('bi-body');
    const ok = await waitRendered(b3, (el) => /获取失败/.test(el.innerHTML), 20000);
    check('后端不可达时显示“获取失败”而非白屏', ok, b3.innerHTML.slice(0, 200));
    check('失败提示中给出了接口路径', /\/system\/info/.test(b3.innerHTML), b3.innerHTML.slice(0, 250));
    check('失败提示未把异常抛成未捕获错误（页面骨架仍在）', /bi-card/.test(h3.innerHTML));
  }

  /* ---------- 4. 字段覆盖率：后端返回的字段是否都被前端展示（防遗漏） ---------- */
  console.log('\n【E】字段覆盖率（后端字段 -> 页面是否有对应展示行）');
  {
    const sb5 = makeSandbox(BASE);
    loadFile(sb5, 'js/platform-admin-backend-info.js');
    const h5 = sb5.document.getElementById('dynamic-content-center');
    sb5.renderBackendInfoPage(h5);
    const b5 = sb5.document.getElementById('bi-body');
    await waitRendered(b5, (el) => /<\/table>/.test(el.innerHTML) || /获取失败/.test(el.innerHTML));
    const html5 = b5.innerHTML;

    function flatten(obj, prefix, out) {
      out = out || [];
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        const p = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
        else out.push(p);
      }
      return out;
    }
    const backendFields = flatten(bkData);
    const missing = [];
    for (const f of backendFields) {
      // 展示行的 <th> 文案里带有英文字段名（如 "服务标识 service"、"时区 ID timezone.id"）
      const re = new RegExp('<th>[^<]*' + f.replace(/\./g, '\\.') + '[^<]*</th>');
      if (!re.test(html5)) missing.push(f);
    }
    check('后端 ' + backendFields.length + ' 个字段全部有展示行（无遗漏）',
      missing.length === 0, '遗漏: ' + missing.join(', '));

    // 反向：页面展示行是否都对应后端真实字段（防前端写死不存在的字段）
    const thKeys = [...html5.matchAll(/<th>([^<]*?([a-zA-Z][a-zA-Z0-9.]*))\s*<\/th>/g)]
      .map(m => m[2]).filter(Boolean);
    const orphan = [...new Set(thKeys)].filter(k => backendFields.indexOf(k) < 0);
    check('页面展示行不存在后端没有的“孤儿字段”', orphan.length === 0, '孤儿字段: ' + orphan.join(', '));
  }

  /* ---------- 5. 快速切换 TAB 的响应竞态 ---------- */
  console.log('\n【F】快速切换 TAB 的响应竞态（旧响应是否覆盖新 TAB）');
  {
    const sb6 = makeSandbox(BASE);
    loadFile(sb6, 'js/platform-admin-backend-info.js');
    const origFetch = sb6.fetch;
    let slowFired = 0;   // 记录“慢响应”是否真的被制造出来（防止测试假阳性）
    // 人为让 booking 的响应慢 1.2s，message 立即返回 —— 放大竞态窗口
    sb6.fetch = async (u, o) => {
      const url = typeof u === 'string' ? u : (u && u.url) || '';
      if (/\/api\/v1\/system\/info/.test(url) && !/\/api\/v1\/message\//.test(url)) {
        slowFired++;
        if (process.env.DEBUG_RACE) console.log('        [调试] 已为 booking 请求注入 1200ms 延迟（第 ' + slowFired + ' 次）');
        await sleep(1200);
      }
      return origFetch(u, o);
    };
    sb6.window.fetch = sb6.fetch;

    const h6 = sb6.document.getElementById('dynamic-content-center');
    sb6.renderBackendInfoPage(h6);          // 默认触发 booking（慢）
    const b6 = sb6.document.getElementById('bi-body');
    const tabs6 = h6.querySelectorAll('.bi-tab-btn');
    if (tabs6.length === 2) tabs6[1].click(); // 立刻切到 message（快）

    await waitRendered(b6, (el) => /<\/table>/.test(el.innerHTML) || /获取失败/.test(el.innerHTML), 20000);
    await sleep(2000);   // 等慢响应回来，看它是否把内容覆盖掉

    // 前置条件自检：延迟确实注入了，否则本用例无意义（假阳性防护）
    check('竞态用例有效性：慢响应延迟确实被注入', slowFired > 0, 'slowFired=' + slowFired + '（若为 0，说明 fetch 替换未生效，本用例无效）');

    const finalHtml = b6.innerHTML;
    const showsMessage = /message-service/.test(finalHtml) && !/booking_api/.test(finalHtml);
    check('慢响应返回后，页面仍显示最后点击的 TAB（message-service）',
      showsMessage, '实际内容片段: ' + finalHtml.slice(0, 160));
  }

  /* ---------- 汇总 ---------- */
  console.log('\n================ 测试结果 ================');
  console.log(pass + ' PASS / ' + fail + ' FAIL');
  if (fail) {
    console.log('\n失败项：');
    failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  }
  console.log('==========================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试异常：', e); process.exit(1); });
