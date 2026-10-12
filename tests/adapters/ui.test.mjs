// shared/adapters/ui.js 单测：验证 alert/confirm/prompt 在「小程序 / Web」两套运行时下的行为收敛。
import assert from 'node:assert';
import { alert, confirm, prompt, setPromptResolver } from '../../shared/adapters/ui.js';

let pass = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓', name); pass++; }

// ---- 小程序运行时 ----
async function runMp() {
  const calls = [];
  globalThis.wx = {
    showModal(opts) { calls.push(opts); return { confirm: opts.__confirm !== false }; }
  };
  delete globalThis.window;

  await alert('hi', { title: 'T' });
  ok('mp: alert 走 showModal(showCancel:false)', calls.length === 1 && calls[0].showCancel === false && calls[0].content === 'hi');

  const c1 = await confirm('sure?');
  ok('mp: confirm 默认返回 boolean(true)', c1 === true && calls[calls.length - 1].showCancel === true);

  // prompt 默认无解析器 → reject
  let rejected = false;
  try { await prompt('name?'); } catch (e) { rejected = true; }
  ok('mp: prompt 无解析器时 reject', rejected === true);

  // 注入解析器 → 走自定义输入流
  setPromptResolver((msg, def) => Promise.resolve(def || 'typed'));
  const p1 = await prompt('name?', 'typed');
  ok('mp: prompt 注入解析器后返回值', p1 === 'typed');
  setPromptResolver(null);
}

// ---- Web 运行时 ----
async function runWeb() {
  const log = {};
  globalThis.window = {
    alert: (m) => { log.alert = m; },
    confirm: (m) => { log.confirm = m; return m === 'yes'; },
    prompt: (m, d) => { log.prompt = [m, d]; return 'web-val'; }
  };
  delete globalThis.wx;

  await alert('hi');
  ok('web: alert 调 window.alert', log.alert === 'hi');

  const c1 = await confirm('yes');
  ok('web: confirm 透传 window.confirm 返回值', c1 === true);
  const c2 = await confirm('no');
  ok('web: confirm 透传 false', c2 === false);

  const p1 = await prompt('name?', 'def');
  ok('web: prompt 透传 window.prompt 返回值', p1 === 'web-val');
}

(async () => {
  await runMp();
  await runWeb();
  console.log('\nui adapter: ' + pass + ' assertions passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
