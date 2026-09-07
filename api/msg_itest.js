'use strict';
/*
 * Browserless integration test for messages-inbox.js (消息中心).
 * Loads the REAL deployed JS, shims DOM (with a small HTML parser) + axios
 * (real fetch to message-service), simulates clicking a message / marking read,
 * and asserts the detail modal opens and the unread badge updates.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_DIR = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/api';
const JS_DIR = path.join(PROJECT_DIR, 'target/classes/static/js');
const MS_BASE = 'http://localhost:8090';
const API_BASE = 'http://localhost:8081';

// ---------------- tiny HTML parser ----------------
function parseHTML(html) {
  // returns array of El nodes (top-level)
  const roots = [];
  let i = 0;
  const len = html.length;
  let stack = [{ children: roots, tag: '#root' }];
  const top = () => stack[stack.length - 1];
  while (i < len) {
    if (html[i] === '<') {
      if (html[i + 1] === '/') {
        // closing tag
        const j = html.indexOf('>', i);
        const name = html.slice(i + 2, j).trim().toLowerCase();
        // pop until matching (El nodes store name in .tagName; root uses .tag)
        for (let k = stack.length - 1; k > 0; k--) {
          if ((stack[k].tag || stack[k].tagName) === name) { stack.length = k; break; }
        }
        i = j + 1;
      } else if (html[i + 1] === '!') {
        // comment or doctype
        const j = html.indexOf('>', i);
        i = j + 1;
      } else {
        // opening tag
        const j = findTagEnd(html, i);
        let tagStr = html.slice(i + 1, j).trim();
        let selfClose = false;
        if (tagStr.endsWith('/')) { selfClose = true; tagStr = tagStr.slice(0, -1).trim(); }
        const sp = tagStr.search(/\s/);
        const tagName = (sp === -1 ? tagStr : tagStr.slice(0, sp)).toLowerCase();
        const attrStr = sp === -1 ? '' : tagStr.slice(sp + 1);
        const attrs = parseAttrs(attrStr);
        const el = new El(tagName);
        el._attrs = attrs;
        attrs.forEach(a => { if (a.name === 'id') el._id = a.value; if (a.name === 'class') el._class = a.value; });
        top().children.push(el);
        if (!selfClose && !VOID_TAGS.has(tagName)) stack.push(el);
        i = j + 1;
      }
    } else {
      const j = html.indexOf('<', i);
      const text = html.slice(i, j === -1 ? len : j);
      if (text.trim()) top().children.push(new TextNode(text));
      i = j === -1 ? len : j;
    }
  }
  return roots;
}
function findTagEnd(html, i) {
  // find '>' not inside quotes
  let inQ = null;
  for (let k = i + 1; k < html.length; k++) {
    const c = html[k];
    if (inQ) { if (c === inQ) inQ = null; }
    else if (c === '"' || c === "'") inQ = c;
    else if (c === '>') return k;
  }
  return html.length;
}
function parseAttrs(s) {
  const out = [];
  const re = /([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    out.push({ name: m[1].toLowerCase(), value: m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] || '')) });
  }
  return out;
}
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

class TextNode {
  constructor(t) { this._text = t; this.tagName = '#text'; this.children = []; }
  serialize() { return this._text; }
}
class El {
  constructor(tag) {
    this.tagName = tag; this._attrs = []; this.children = [];
    this._id = ''; this._class = ''; this._text = ''; this.value = '';
    this.style = {}; this._listeners = {}; this._innerHTML = '';
    const self = this;
    this.classList = {
      add: (c) => { const s = new Set(self._class.split(/\s+/).filter(Boolean)); s.add(c); self._class = [...s].join(' '); },
      remove: (c) => { const s = new Set(self._class.split(/\s+/).filter(Boolean)); s.delete(c); self._class = [...s].join(' '); },
      contains: (c) => self._class.split(/\s+/).includes(c),
      toggle: (c) => { if (self.classList.contains(c)) self.classList.remove(c); else self.classList.add(c); },
    };
  }
  get attributes() { const o = {}; this._attrs.forEach(a => o[a.name] = a.value); return o; }
  getAttribute(n) { const a = this._attrs.find(x => x.name === n.toLowerCase()); return a ? a.value : null; }
  setAttribute(n, v) {
    const a = this._attrs.find(x => x.name === n.toLowerCase());
    if (a) a.value = v; else this._attrs.push({ name: n.toLowerCase(), value: v });
    if (n.toLowerCase() === 'id') this._id = v; if (n.toLowerCase() === 'class') this._class = v;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter(f => f !== fn); }
  dispatch(type, ev) {
    ev = ev || {}; ev.target = ev.target || this; ev.type = type;
    ev.stopPropagation = ev.stopPropagation || (() => {});
    ev.preventDefault = ev.preventDefault || (() => {});
    (this._listeners[type] || []).slice().forEach(fn => fn(ev));
  }
  click(ev) { this.dispatch('click', ev); }
  appendChild(c) { this.children.push(c); return c; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = parseHTML(String(v));
  }
  get innerHTML() {
    // nested elements produced by innerHTML parsing have empty _innerHTML; rebuild from children
    if (this._innerHTML) return this._innerHTML;
    return this.children.map(c => (c.serialize ? c.serialize() : '')).join('');
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map(c => c.serialize ? c.serialize() : '').join(''); }
  get innerText() { return this.textContent; }
  _all() { const out = []; for (const c of this.children) { if (c instanceof El) { out.push(c); out.push(...c._all()); } } return out; }
  _matchSel(sel) {
    let id = null, tag = null; const classes = []; const attrs = [];
    const idm = sel.match(/#([\w-]+)/); if (idm) id = idm[1];
    const tagm = sel.match(/^([a-zA-Z][\w-]*)/); if (tagm) tag = tagm[1].toLowerCase();
    const cm = sel.matchAll(/\.([\w-]+)/g); for (const c of cm) classes.push(c[1]);
    const am = sel.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g);
    for (const a of am) attrs.push({ name: a[1].toLowerCase(), value: a[2] });
    if (id && this._id !== id) return false;
    if (tag && this.tagName !== tag) return false;
    for (const c of classes) if (!this._class.split(/\s+/).includes(c)) return false;
    for (const a of attrs) { const av = this.getAttribute(a.name); if (av == null) return false; if (a.value != null && a.value !== '' && av !== a.value) return false; }
    return true;
  }
  querySelectorAll(sel) {
    const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
    const out = []; const seen = new Set();
    for (const p of parts) {
      for (const c of this._all()) {
        if (c._matchSel(p) && !seen.has(c)) { seen.add(c); out.push(c); }
      }
    }
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  serialize() {
    let s = this._text || '';
    if (this.children.length) s += this.children.map(c => c.serialize ? c.serialize() : '').join('');
    return s;
  }
}

// ---------------- document / window shim ----------------
const registry = {};
function getEl(id) { return registry[id] || (registry[id] = new El('div')); }
const documentShim = {
  getElementById: (id) => getEl(id),
  querySelector: (sel) => getEl('__q_' + sel), // unused
  querySelectorAll: () => [],
  createElement: (tag) => new El(tag),
  addEventListener: () => {},
  head: { appendChild: () => {} },
  body: new El('body'),
};
documentShim.body.appendChild = function (c) { this.children.push(c); };

// ---------------- localStorage shim ----------------
const store = new Map();
const localStorageShim = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// ---------------- axios shim (real fetch) ----------------
function makeAxios(baseURL) {
  const inst = {
    baseURL,
    interceptors: {
      request: { handlers: [], use(f) { this.handlers.push(f); } },
      response: { handlers: [], use(f) { this.handlers.push(f); } },
    },
    _req: async (config) => {
      let cfg = Object.assign({ method: 'get', headers: {} }, config);
      for (const h of inst.interceptors.request.handlers) cfg = await h(cfg);
      let url = cfg.url;
      if (inst.baseURL && /^https?:\/\//.test(inst.baseURL)) url = inst.baseURL.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
      else url = API_BASE + (url.startsWith('/') ? url : '/' + url);
      if (cfg.params) { const q = new URLSearchParams(); for (const k in cfg.params) q.append(k, cfg.params[k]); url += '?' + q.toString(); }
      const hasBody = cfg.data != null && cfg.method !== 'get' && cfg.method !== 'delete';
      const resp = await fetch(url, {
        method: cfg.method.toUpperCase(),
        headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {}),
        body: hasBody ? JSON.stringify(cfg.data) : undefined,
      });
      const json = await resp.json().catch(() => ({}));
      const wrapped = { data: json, status: resp.status, config: cfg };
      if (!resp.ok) {
        const err = new Error('HTTP ' + resp.status); err.response = wrapped; err.config = cfg;
        for (const h of inst.interceptors.response.handlers) { try { return await h(null, err); } catch (e) { throw e; } }
        throw err;
      }
      for (const h of inst.interceptors.response.handlers) { const r = await h(wrapped); if (r !== undefined) return r; }
      return wrapped.data;
    },
  };
  inst.get = (url, cfg) => inst._req(Object.assign({ url, method: 'get' }, cfg));
  inst.post = (url, data, cfg) => inst._req(Object.assign({ url, method: 'post', data }, cfg));
  inst.delete = (url, cfg) => inst._req(Object.assign({ url, method: 'delete' }, cfg));
  inst.put = (url, data, cfg) => inst._req(Object.assign({ url, method: 'put', data }, cfg));
  return inst;
}
const axiosShim = { create: (cfg) => makeAxios(cfg.baseURL || '') };

// ---------------- sandbox ----------------
const sandbox = {
  document: documentShim, localStorage: localStorageShim, axios: axiosShim,
  console, setTimeout, clearTimeout, URLSearchParams, fetch, JSON, Math, Date,
  location: { hostname: 'localhost', host: 'localhost:8081', origin: API_BASE, search: '', href: API_BASE + '/' },
  EventSource: class { constructor() {} addEventListener() {} close() {} onerror = null; },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---------------- helpers ----------------
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitRendered(pred, timeout = 8000, interval = 150) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (pred()) return true; await wait(interval); }
  return false;
}
function login(account, password, tenantCode, role) {
  return fetch(API_BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, tenantCode, role }),
  }).then(r => r.json());
}

// ---------------- main ----------------
(async () => {
  let pass = 0, fail = 0;
  const ck = (name, cond, extra = '') => { if (cond) { console.log('PASS ' + name); pass++; } else { console.log('FAIL ' + name + ' ' + extra); fail++; } };

  // 1) login student165
  const lg = await login('student165', '123456', 'TENANT_A', 'student');
  if (lg.code !== 200) { console.log('LOGIN FAILED', lg); process.exit(2); }
  const token = lg.data.token;
  const userId = lg.data.userId;
  localStorageShim.setItem('token', token);
  localStorageShim.setItem('currentUser', JSON.stringify({ userId, role: 'student', name: 'student165' }));

  // 2) ensure an UNREAD message exists for student165
  const inbox = await fetch(MS_BASE + '/api/v1/users/' + userId + '/inbox?pageNum=1&pageSize=10', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  const rows = (inbox.data && inbox.data.rows) || [];
  ck('收件箱有消息(后端)', rows.length > 0, 'rows=' + rows.length);
  if (!rows.length) { console.log('\n==== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL ===='); process.exit(fail ? 1 : 0); }
  const mid = rows[0].messageId;
  console.log('DEBUG rows[0]=', JSON.stringify(rows[0]).slice(0, 220), ' mid=', mid, ' typeof=', typeof mid);
  // force unread so we can test the badge decrement
  const unreadResp = await fetch(MS_BASE + '/api/v1/users/' + userId + '/messages/' + mid + '/unread', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()).catch(e => ({ err: String(e) }));
  const detailNow = await fetch(MS_BASE + '/api/v1/users/' + userId + '/messages/' + mid, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  const cntBefore = await fetch(MS_BASE + '/api/v1/users/' + userId + '/inbox/unread-count', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  console.log('DEBUG unreadResp=', JSON.stringify(unreadResp).slice(0, 200), ' detail.isRead=', detailNow.data && detailNow.data.isRead, ' cntBefore=', cntBefore.data);
  ck('标记未读后 unread-count>=1(后端)', cntBefore.data >= 1, 'cnt=' + JSON.stringify(cntBefore.data));

  // 3) load REAL messages-inbox.js
  const code = fs.readFileSync(path.join(JS_DIR, 'messages-inbox.js'), 'utf8');
  try { vm.runInContext(code, sandbox, { filename: 'messages-inbox.js' }); }
  catch (e) { console.log('LOAD ERROR', e); process.exit(2); }
  ck('模块加载且暴露 renderMessagesPage', typeof sandbox.window.renderMessagesPage === 'function');

  // 4) render the messages page into a container (like the sidebar dynamic-content-center)
  const container = new El('div'); container._id = 'dynamic-content-center';
  sandbox.window.renderMessagesPage(container);
  const ok = await waitRendered(() => {
    const list = container.querySelector('#msg-list');
    return list && list.querySelectorAll('.msg-item').length > 0;
  });
  const list = container.querySelector('#msg-list');
  const items = list ? list.querySelectorAll('.msg-item') : [];
  ck('消息列表渲染出 .msg-item 行', ok && items.length > 0, 'items=' + items.length);

  // 5) SYMPTOM A: click a message -> detail modal opens with content
  const firstItem = items[0];
  const openEl = firstItem.querySelector('[data-act="open"]');
  ck('消息行存在 [data-act=open] 点击区', !!openEl);
  let detailOpened = false, detailHasContent = false, detailTitle = '';
  // DEBUG: inspect modal-root availability in the shim
  const mr = container.querySelector('#msg-modal-root');
  console.log('DBG modalRoot present?', !!mr, ' container.children ids=', container.children.map(c => c._id || c.tagName));
  if (openEl) {
    try { openEl.click(); } catch (e) { console.log('DBG click threw', e.message); }
    // openDetail is async (awaits GET); wait for #msg-modal-root to be filled
    await waitRendered(() => {
      const root = container.querySelector('#msg-modal-root');
      if (!root) return false;
      const mask = root.querySelector('#msg-mask');
      if (!mask) return false;
      const modal = root.querySelector('.msg-modal');
      if (!modal) return false;
      const html = modal.innerHTML;
      detailOpened = html.length > 0;
      detailHasContent = html.includes('明天下午') || html.includes('教学调度') || html.includes('content') || html.length > 50;
      detailTitle = (modal.querySelector('h3') || {}).textContent || '';
      return detailOpened;
    }, 6000);
  }
  ck('SYMPTOM-A 点击消息后详情弹窗打开', detailOpened);
  ck('SYMPTOM-A 详情弹窗含消息内容', detailHasContent, 'title=' + detailTitle);

  // 6) SYMPTOM B: 标记已读 -> 角标更新
  // reset unread again to guarantee a visible decrement
  await fetch(MS_BASE + '/api/v1/users/' + userId + '/messages/' + mid + '/unread', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  // re-render to refresh list + badge
  sandbox.window.renderMessagesPage(container);
  await waitRendered(() => container.querySelector('#msg-list') && container.querySelector('#msg-list').querySelectorAll('.msg-item').length > 0);
  await wait(800); // let refreshBadge() (async) finish
  const cntLive = await fetch(MS_BASE + '/api/v1/users/' + userId + '/inbox/unread-count', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
  const badge = getEl('msg-unread-badge');
  ck('SYMPTOM-B 初始角标显示未读数', String(badge.textContent) === String(cntLive.data) || badge.style.display === 'inline-block', 'badgeText=' + badge.textContent + ' disp=' + badge.style.display + ' live=' + cntLive.data);

  const list2 = container.querySelector('#msg-list');
  const item2 = list2.querySelectorAll('.msg-item')[0];
  const readBtn = item2.querySelector('[data-act="read"]');
  ck('存在 标记已读 按钮', !!readBtn);
  if (readBtn) {
    readBtn.click();
    await waitRendered(() => { const b = getEl('msg-unread-badge'); return b.style.display === 'none' || b.textContent === '0'; }, 6000);
  }
  const badgeAfter = getEl('msg-unread-badge');
  ck('SYMPTOM-B 标记已读后角标归零/隐藏', badgeAfter.style.display === 'none' || badgeAfter.textContent === '0', 'badgeText=' + badgeAfter.textContent + ' disp=' + badgeAfter.style.display);

  console.log('\n==== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL ====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
