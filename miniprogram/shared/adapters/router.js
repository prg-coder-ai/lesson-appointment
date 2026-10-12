// 路由适配层（单一权威源，零平台特定副作用）。
// 统一接口：setRoutes / to / replace / back / current / parseQuery / openUrl
// 运行时自动探测：小程序用 wx.navigateTo/redirectTo/navigateBack；Web 用 location/history。
//
// 约定：
//   - 通过 setRoutes(name -> { web, mp }) 注册「命名路由」；to('login', {x:1}) 两端各走对应路径并拼参。
//   - 未注册的 name 原样当作路径（to('booking.html') 在 Web 即跳 booking.html，mp 即跳该页面路径）。
//   - openUrl(url) 直接吃一个已拼好的路径/URL，不做路由表解析（两端各自 navigateTo / location.href）。
// 视图层（具体哪个按钮跳哪页）属 Decision 3 允许不一致的范围；本层只收敛「跳转原语」接口。

function isMp() {
  return typeof wx !== 'undefined' && typeof wx.navigateTo === 'function';
}
function getWin() {
  return (typeof window !== 'undefined') ? window : null;
}

let routes = {};

export function setRoutes(map) {
  routes = map || {};
}

function buildUrl(target, params) {
  let url = target;
  const r = routes[target];
  if (r) {
    url = isMp() ? (r.mp || r.web) : (r.web || r.mp);
  }
  if (params && typeof params === 'object') {
    const qs = Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== null)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&');
    if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }
  return url;
}

export function to(name, params) {
  const url = buildUrl(name, params);
  if (isMp()) {
    return new Promise((resolve, reject) => {
      wx.navigateTo({ url, success: () => resolve(), fail: (e) => reject(e) });
    });
  }
  const w = getWin();
  if (w) { w.location.href = url; return Promise.resolve(); }
  return Promise.resolve();
}

export function replace(name, params) {
  const url = buildUrl(name, params);
  if (isMp()) {
    return new Promise((resolve, reject) => {
      wx.redirectTo({ url, success: () => resolve(), fail: (e) => reject(e) });
    });
  }
  const w = getWin();
  if (w) { w.location.replace(url); return Promise.resolve(); }
  return Promise.resolve();
}

export function back(delta) {
  if (isMp()) {
    try { wx.navigateBack({ delta: delta || 1 }); } catch (e) { /* ignore */ }
    return Promise.resolve();
  }
  const w = getWin();
  if (w && w.history) { w.history.back(); }
  return Promise.resolve();
}

export function current() {
  if (isMp()) {
    try {
      const pages = (typeof getCurrentPages === 'function') ? getCurrentPages() : [];
      const p = pages[pages.length - 1];
      return { path: p ? p.route : '', query: p ? (p.options || {}) : {}, platform: 'mp' };
    } catch (e) {
      return { path: '', query: {}, platform: 'mp' };
    }
  }
  const w = getWin();
  if (w && w.location) {
    return { path: w.location.pathname, query: parseQuery(w.location.search), platform: 'web' };
  }
  return { path: '', query: {}, platform: 'unknown' };
}

export function parseQuery(search) {
  const q = {};
  if (!search) return q;
  const s = String(search).replace(/^[?#]/, '');
  if (!s) return q;
  s.split('&').forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    const k = idx >= 0 ? pair.slice(0, idx) : pair;
    const v = idx >= 0 ? pair.slice(idx + 1) : '';
    try { q[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { q[k] = v; }
  });
  return q;
}

export function openUrl(url) {
  if (isMp()) {
    return new Promise((resolve, reject) => {
      wx.navigateTo({ url, success: () => resolve(), fail: (e) => reject(e) });
    });
  }
  const w = getWin();
  if (w) { w.location.href = url; return Promise.resolve(); }
  return Promise.resolve();
}

export default { setRoutes, to, replace, back, current, parseQuery, openUrl };
