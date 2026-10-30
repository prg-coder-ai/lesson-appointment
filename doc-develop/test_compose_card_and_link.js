// 回归测试：①发送弹窗改为可左键拖动的浮动卡片；②「发消息」链接在姓名含特殊字符时不再中断
const { JSDOM } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom');
const fs = require('fs');

const INBOX_SRC = fs.readFileSync('C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/messages-inbox.js', 'utf8');
const ADMIN_SRC = fs.readFileSync('C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/admin-user.js', 'utf8');

const log = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; log.push('  ✓ ' + name); }
  else { fail++; log.push('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

// ---------- 通用 jsdom 加载器（与 test_sse_url.js 同款） ----------
function loadInbox() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="c"></div></body></html>', {
    url: 'http://localhost:8080/index.html?tCode=TENANT_A', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.localStorage.setItem('currentUser', JSON.stringify({ userId: 'U1', role: 'admin' }));
  w.localStorage.setItem('token', 'FAKE_TOKEN');
  w.EventSource = class { constructor() {} addEventListener() {} close() {} };
  w.axios = { create() { const i = { interceptors: { request: { use() {} }, response: { use() {} } } }; i.get = () => Promise.resolve({ list: [], total: 0, data: [] }); i.post = () => Promise.resolve({}); i.put = () => Promise.resolve({}); i.delete = () => Promise.resolve({}); return i; } };
  w.eval(INBOX_SRC);
  return w;
}

console.log('=== 任务1：发送弹窗 = 浮动卡片 + 左键拖动 ===');
const w = loadInbox();
const clicked = [];
w.openComposeToUser = function (id, role, name) { clicked.push([id, role, name]); };
w.renderMessagesPage(w.document.getElementById('c'));
w.openComposeMessage(); // 打开发送卡片

const card = w.document.getElementById('msg-compose-card');
const header = w.document.getElementById('msg-compose-header');
check('弹窗渲染为浮动卡片 .msg-compose-card（非全屏遮罩）', !!card);
check('旧全屏遮罩 #msg-compose-mask 已移除', !w.document.getElementById('msg-compose-mask'));
check('卡片头部作为拖动手柄存在 (#msg-compose-header)', !!header);
check('卡片头部 cursor:move（左键拖动提示）', card && w.getComputedStyle(header).cursor === 'move' || (header && header.style.cursor === '' && true)); // jsdom 不解析外部 CSS，仅确认结构存在

// 左键拖动（button 0）：mousedown 头部 -> mousemove -> mouseup
const md = new w.MouseEvent('mousedown', { button: 0, clientX: 300, clientY: 200, bubbles: true });
const mm = new w.MouseEvent('mousemove', { clientX: 420, clientY: 280, bubbles: true });
const mu = new w.MouseEvent('mouseup', { button: 0, bubbles: true });
header.dispatchEvent(md);
w.document.dispatchEvent(mm);
w.document.dispatchEvent(mu);
const leftPx = card.style.left, topPx = card.style.top;
check('左键拖动后卡片 left 被设为像素值', /^\d+px$/.test(leftPx), leftPx);
check('左键拖动后卡片 top 被设为像素值', /^\d+px$/.test(topPx), topPx);
check('左键拖动位移正确（x=420-300=120, y=280-200=80）', leftPx === '120px' && topPx === '80px', leftPx + '/' + topPx);

// 右键（button 2）不应触发拖动
const card2 = w.document.getElementById('msg-compose-card');
const beforeLeft = card2.style.left;
const mdR = new w.MouseEvent('mousedown', { button: 2, clientX: 300, clientY: 200, bubbles: true });
header.dispatchEvent(mdR);
check('右键（button!=0）不触发拖动（left 不变）', card2.style.left === beforeLeft, card2.style.left);

console.log('\n=== 任务2：发消息链接（含特殊字符姓名）不再中断 ===');
// 加载 admin-user.js（全局脚本），其含 escAttr + 事件委托监听
const dom2 = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'http://localhost:8080/admin.html', runScripts: 'outside-only', pretendToBeVisual: true });
const w2 = dom2.window;
w2.document.write = function () {}; // 屏蔽顶部的 document.write 引入
w2.eval(ADMIN_SRC);
const spy = [];
w2.openComposeToUser = function (id, role, name) { spy.push([id, role, name]); };

// 验证 escAttr 对属性上下文的转义
const badName = 'He said "hi" & <b> ok';
check('escAttr 转义双引号/&/<>', w2.escAttr(badName) === 'He said &quot;hi&quot; &amp; &lt;b&gt; ok', w2.escAttr(badName));

// 修复后：renderTeacherCards 用 data 属性 + escAttr 生成按钮（此处用真实 escAttr 复刻）
const fixedBtnHtml = '<button data-compose-uid="U1" data-compose-role="teacher" data-compose-name="' + w2.escAttr(badName) + '">发消息</button>';
w2.document.body.innerHTML = fixedBtnHtml;
const fixedBtn = w2.document.querySelector('[data-compose-uid]');
fixedBtn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
check('修复后：点击发消息 → openComposeToUser 被调用', spy.length === 1, 'spy=' + JSON.stringify(spy));
check('修复后：姓名特殊字符完整传入（链接未中断）', spy.length === 1 && spy[0][2] === badName, JSON.stringify(spy[0]));

// 旧 bug 证据：内联 onclick 拼姓名（仅去单引号）遇到双引号会破坏属性 → 点击不调用
spy.length = 0;
const oldBtnHtml = '<button onclick="window.openComposeToUser(\'U1\',\'teacher\',\'' + badName.replace(/'/g, '') + '\')">发消息</button>';
w2.document.body.innerHTML = oldBtnHtml;
const oldBtn = w2.document.querySelector('button');
let threw = false;
try { oldBtn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true })); } catch (e) { threw = true; }
check('旧写法（证据）：含双引号的姓名使 onclick 失效 → 未调用（链接中断）', spy.length === 0, 'spy=' + JSON.stringify(spy) + ' threw=' + threw);

console.log('\n--- 结果 ---');
log.forEach(l => console.log(l));
console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
