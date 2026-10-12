/**
 * 端到端（真实页面 + 真实脚本 + 真实后端）：student-landing.html?tCode=TENANT_A
 * 断言：① 不发生导航（不被踢回 login.html）② 教师风采有内容
 * 对照：admin.html 未登录应发生导航（证明检测手段有效）
 */
const { JSDOM, VirtualConsole } = require('jsdom');

function load(url, ms) {
  return new Promise((resolve) => {
    const navs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { if (/navigation/i.test(e.message)) navs.push(e.message); });
    vc.on('error', () => {});
    JSDOM.fromURL(url, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
    }).then((dom) => {
      setTimeout(() => resolve({ dom, navs }), ms);
    }).catch((e) => resolve({ dom: null, navs: navs, err: e }));
  });
}

(async () => {
  let pass = 0, fail = 0;
  const assert = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? '  :: ' + x : ''))); };

  console.log('\n=== E2E-1 landing 页（未登录）不得跳登录页 ===');
  const a = await load('http://127.0.0.1:8080/student-landing.html?tCode=TENANT_A', 9000);
  if (!a.dom) { assert('页面可加载', false, a.err && a.err.message); }
  else {
    assert('未发生导航', a.navs.length === 0, 'navs=' + a.navs.length);
    const doc = a.dom.window.document;
    assert('URL 仍停留在 landing 页', a.dom.window.location.pathname.indexOf('student-landing') >= 0, a.dom.window.location.pathname);
    const host = doc.getElementById('teacherCardCarousel');
    const cards = host ? host.querySelectorAll('.tc-card').length : -1;
    const txt = host ? host.textContent.trim() : '';
    console.log('    卡片数=' + cards + '  文本前60字=' + JSON.stringify(txt.slice(0, 60)));
    assert('教师风采区域已渲染', !!host && (cards > 0 || txt.length > 0), 'cards=' + cards);
  }

  console.log('\n=== E2E-2 对照：admin.html 未登录应被守卫跳到登录页 ===');
  const b = await load('http://127.0.0.1:8080/admin.html', 6000);
  if (b.dom) assert('确实发生导航（检测手段有效）', b.navs.length > 0, 'navs=' + b.navs.length);
  else assert('admin.html 可加载', false, b.err && b.err.message);

  console.log('\n----------------------------------------');
  console.log('结果: ' + pass + '/' + (pass + fail) + ' 通过, ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
