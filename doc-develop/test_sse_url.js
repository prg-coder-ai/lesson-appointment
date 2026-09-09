// 回归测试：消息中心 SSE / mreq 基址默认同源（修复 ERR_CONNECTION_REFUSED 后）
// 加载真实 frontend/js/messages-inbox.js，stub EventSource 抓取 SSE URL，验证不再直连 :8090
const { JSDOM } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const fs = require('fs');

const SRC = fs.readFileSync('C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/messages-inbox.js', 'utf8');

const log = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; log.push('  ✓ ' + name); }
  else { fail++; log.push('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

// 造一个 jsdom 环境并加载真实脚本，返回抓取到的 SSE URL 与 mreq baseURL
function runScenario(opts) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="c"></div></body></html>', {
    url: 'http://localhost:8080/index.html?tCode=TENANT_A',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  // localStorage 当前用户 + token
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'U1', role: 'admin' }));
  w.localStorage.setItem('token', 'FAKE_TOKEN');

  // API_BASE_URL / MESSAGE_API_BASE_URL（可覆盖）
  if (opts.apiBaseUrl !== undefined) w.API_BASE_URL = opts.apiBaseUrl;
  if (opts.msgBaseUrl !== undefined) w.MESSAGE_API_BASE_URL = opts.msgBaseUrl;

  // 抓 SSE URL
  let sseUrl = null;
  w.EventSource = class {
    constructor(url) { sseUrl = url; this.url = url; }
    addEventListener() {}
    close() {}
  };

  // stub axios：create 返回假实例；记录首个 baseURL（mreq）
  const baseURLs = [];
  const fakeAxios = {
    create(cfg) {
      baseURLs.push(cfg.baseURL);
      const inst = { interceptors: { request: { use() {} }, response: { use() {} } } };
      const ok = (data) => Promise.resolve(data);
      inst.get = () => ok({ list: [], total: 0, data: [] });
      inst.post = () => ok({});
      inst.put = () => ok({});
      inst.delete = () => ok({});
      return inst;
    },
  };
  w.axios = fakeAxios;

  // 在 window 作用域执行真实源码（IIFE 会挂 window.renderMessagesPage 等）
  w.eval(SRC);

  const container = w.document.getElementById('c');
  w.renderMessagesPage(container); // 内部会调 connectSse() -> new EventSource(url)

  return { sseUrl, mreqBaseURL: baseURLs[0] };
}

console.log('=== 场景1：默认同源（localhost:8080 跑前端，不显式设覆盖） ===');
const r1 = runScenario({ apiBaseUrl: '', msgBaseUrl: undefined });
console.log('  捕获 SSE URL = ' + JSON.stringify(r1.sseUrl));
check('SSE URL 为同源相对路径 /api/v1/sse/connect', r1.sseUrl === '/api/v1/sse/connect?access_token=FAKE_TOKEN', r1.sseUrl);
check('SSE URL 不再直连 :8090（不含 :8090）', !/:8090/.test(r1.sseUrl), r1.sseUrl);
check('SSE URL 不再直连绝对地址（不以 http:// 开头）', !/^https?:\/\//.test(r1.sseUrl), r1.sseUrl);
check('mreq baseURL = 同源空串（走 Nginx/dev 代理分流到 8090）', r1.mreqBaseURL === '', JSON.stringify(r1.mreqBaseURL));

console.log('=== 场景2：显式跨域直连覆盖 window.MESSAGE_API_BASE_URL ===');
const r2 = runScenario({ apiBaseUrl: '', msgBaseUrl: 'http://msg.remote.com' });
console.log('  捕获 SSE URL = ' + JSON.stringify(r2.sseUrl));
check('覆盖位仍生效：SSE URL 用 MESSAGE_API_BASE_URL 前缀', r2.sseUrl === 'http://msg.remote.com/api/v1/sse/connect?access_token=FAKE_TOKEN', r2.sseUrl);

console.log('\n--- 结果 ---');
log.forEach(l => console.log(l));
console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
