// shared/adapters/net.js 单测：验证 transport 在「小程序 / Web」两套运行时下正确探测与归一。
// 约定：统一返回 { statusCode, data }，使调用方无需区分两端。
import assert from 'node:assert';
import { transport } from '../../shared/adapters/net.js';

let pass = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓', name); pass++; }

// ---- 小程序运行时 ----
const mpStore = {};
globalThis.wx = {
  request(opts) {
    // 模拟一次成功响应：statusCode=200，data={code:200,data:'ok'}
    if (opts.url.includes('/fail')) {
      opts.fail({ errMsg: 'request:fail' });
      return;
    }
    opts.success({ statusCode: 200, data: { code: 200, data: 'ok' }, header: { 'x-t': '1' } });
  }
};
delete globalThis.window;

async function runMp() {
  const res = await transport({ url: 'https://x/api', method: 'GET' });
  ok('mp: 返回 statusCode=200', res.statusCode === 200);
  ok('mp: 返回 data 透传', res.data && res.data.data === 'ok');
  ok('mp: 返回 header', res.header && res.header['x-t'] === '1');

  let threw = false;
  try { await transport({ url: 'https://x/fail' }); } catch (e) { threw = true; }
  ok('mp: 网络失败 reject', threw === true);
}

// ---- Web 运行时 ----
function webStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { for (const k in m) delete m[k]; },
    _m: m
  };
}
async function runWeb() {
  const store = webStore();
  globalThis.window = {
    fetch(url, init) {
      const method = (init && init.method) || 'GET';
      let body = null;
      const ct = (init && init.headers && init.headers['Content-Type']) || '';
      if (init && init.body != null) body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      if (url.includes('/json')) return Promise.resolve({ status: 200, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ code: 200, data: 'web-ok' }), text: () => Promise.resolve('') });
      if (url.includes('/text')) return Promise.resolve({ status: 201, headers: { get: () => 'text/plain' }, json: () => Promise.reject(new Error('x')), text: () => Promise.resolve('plain') });
      if (url.includes('/neterr')) return Promise.reject(new Error('net down'));
      return Promise.resolve({ status: 200, headers: { get: () => '' }, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    },
    localStorage: store
  };
  delete globalThis.wx;

  const r1 = await transport({ url: 'https://x/json', method: 'POST', data: { a: 1 } });
  ok('web: statusCode=200', r1.statusCode === 200);
  ok('web: json 自动解析', r1.data && r1.data.data === 'web-ok');

  const r2 = await transport({ url: 'https://x/text', method: 'GET' });
  ok('web: 非 json 回退 text', r2.statusCode === 201 && r2.data === 'plain');

  let threw = false;
  try { await transport({ url: 'https://x/neterr' }); } catch (e) { threw = true; }
  ok('web: fetch 失败 reject', threw === true);
}

(async () => {
  await runMp();
  await runWeb();
  console.log('\nnet adapter: ' + pass + ' assertions passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
