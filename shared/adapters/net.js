// 网络适配层（单一权威源，零平台特定副作用）。
// 运行时自动探测：小程序用 wx.request；Web 用 fetch。
// 仅暴露「可移植的传输原语」transport —— 401 刷新 / Bearer 注入 / 解包 / 错误 toast
// 等「应用级」逻辑由各端 core 层（mp core/request.js、Web utility_request.js）在其上叠加，
// 不塞进共享层，避免平台耦合。
//
// transport(config) -> Promise<{ statusCode, data, header }>
//   config: { url, method, data, header }
// 约定：统一返回 statusCode（mp 原生 statusCode / Web fetch res.status），
//       使调用方（core/request.js）无需区分两端。

function isMp() {
  return typeof wx !== 'undefined' && typeof wx.request === 'function';
}
function getWin() {
  return (typeof window !== 'undefined') ? window : null;
}

function mpRequest(config) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.url,
      method: (config.method || 'GET').toUpperCase(),
      data: config.data,
      header: config.header || {},
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data, header: res.header || {} }),
      fail: (err) => reject(err)
    });
  });
}

async function webRequest(config) {
  const w = getWin();
  if (!w || typeof w.fetch !== 'function') throw new Error('no transport available (need wx.request or fetch)');
  const method = (config.method || 'GET').toUpperCase();
  const init = { method, headers: config.header || {} };
  if (config.data !== undefined && config.data !== null && method !== 'GET' && method !== 'HEAD') {
    init.body = (typeof config.data === 'string') ? config.data : JSON.stringify(config.data);
  }
  const res = await w.fetch(config.url, init);
  let data = null;
  try {
    const ct = (res.headers && typeof res.headers.get === 'function') ? (res.headers.get('content-type') || '') : '';
    data = ct.indexOf('application/json') >= 0 ? await res.json() : await res.text();
  } catch (e) {
    try { data = await res.text(); } catch (_) { /* ignore */ }
  }
  return { statusCode: res.status, data, header: {} };
}

export function transport(config) {
  if (isMp()) return mpRequest(config);
  return webRequest(config);
}

export default { transport };
