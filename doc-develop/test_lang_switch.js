/**
 * 语言切换功能无浏览器集成测试
 * 加载真实的 frontend/js/public/terms.js + termsFunction.js，
 * 用 jsdom 构造 DOM，并 mock 后端 /term/map，验证：
 *   1) 下拉菜单注入到退出按钮(<i class="fa fa-sign-out-alt">)左侧
 *   2) 点击 zh/en/fr 触发 setLang -> fetch /term/map -> applyTerms
 *   3) data-term 文本 / data-term-placeholder 占位提示按语言切换
 *   4) 当前语言高亮 + 下拉展开/收起
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const FRONTEND = 'C:/Users/Administrator/WorkBuddy/2026-08-30-17-19-24/frontend/js/public';
const termsJs = fs.readFileSync(path.join(FRONTEND, 'terms.js'), 'utf8');
const termsFnJs = fs.readFileSync(path.join(FRONTEND, 'termsFunction.js'), 'utf8');

// 不同语言的合并词表（模拟服务端 /term/map 返回）
const MAPS = {
  zh: { course: '课程', teacher: '教师', courseSearch: '请输入课程名称' },
  en: { course: 'Course', teacher: 'Teacher', courseSearch: 'Search courses' },
  fr: { course: 'Cours', teacher: 'Professeur', courseSearch: 'Rechercher un cours' }
};

function makeDom(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  // mock 后端 /term/map：按 lang 参数返回对应词表
  w.fetch = async (url) => {
    const m = String(url).match(/[?&]lang=([a-z]+)/);
    const lang = (m && m[1]) || 'zh';
    return { json: async () => ({ code: 200, data: MAPS[lang] || MAPS.zh }) };
  };
  // 注入真实源码（同一作用域拼接，保证 const/fn 互相可见）
  w.eval(termsJs + '\n' + termsFnJs + '\nwindow.__injectLangSwitch = injectLangSwitch;');
  // 模拟已登录 token，使 loadTermMapFromServer 走到 fetch 分支
  w.localStorage.setItem('token', 'dummy-token');
  w.__injectLangSwitch();
  return dom;
}

const ROLE_HTML = `<!DOCTYPE html><html><body>
<header class="header">
  <div class="logo"><span id="brand-title">语言教学预约系统</span></div>
  <div class="header-actions">
    <div class="user-info" id="user_info"><span class="user-name">张三</span></div>
    <button class="logout-btn" onclick="handleLogout()"><i class="fa fa-sign-out-alt"></i> 退出登录</button>
  </div>
</header>
<main>
  <span data-term="course">课程</span>
  <span data-term="teacher">教师</span>
  <input id="q" data-term-placeholder="courseSearch">
</main>
</body></html>`;

const LOGIN_HTML = `<!DOCTYPE html><html><body>
<div class="login-container">
  <h2>统一登录入口</h2>
</div>
</body></html>`;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

(async () => {
  console.log('=== 场景1：角色页（student/admin/teacher 同结构）===');
  const dom = makeDom(ROLE_HTML);
  const w = dom.window, d = w.document;

  const dropdown = d.getElementById('lang-switch-dropdown');
  const logoutBtn = d.querySelector('.logout-btn');
  check('下拉菜单已注入', !!dropdown);
  check('下拉位于退出按钮左侧（previousElementSibling）', dropdown === logoutBtn.previousElementSibling);
  check('默认语言标签为 中文', d.querySelector('.lang-switch-current').textContent === '中文');
  check('默认 data-term=course 文本=课程（锚点词）', d.querySelector('[data-term="course"]').textContent === '课程');

  // 点击 English
  d.querySelector('.lang-switch-menu li[data-lang="en"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  check('点击 en 后 localStorage.lang=en', w.localStorage.getItem('lang') === 'en');
  check('en 选项高亮 active', d.querySelector('.lang-switch-menu li[data-lang="en"]').classList.contains('active'));
  check('data-term=course 文本切换为 Course', d.querySelector('[data-term="course"]').textContent === 'Course');
  check('data-term=teacher 文本切换为 Teacher', d.querySelector('[data-term="teacher"]').textContent === 'Teacher');
  check('data-term-placeholder 切换为 Search courses',
        d.getElementById('q').placeholder === 'Search courses');
  check('当前语言标签刷新为 English', d.querySelector('.lang-switch-current').textContent === 'English');

  // 点击 Français
  d.querySelector('.lang-switch-menu li[data-lang="fr"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  check('点击 fr 后 data-term=course 文本切换为 Cours',
        d.querySelector('[data-term="course"]').textContent === 'Cours');
  check('fr 选项高亮 active', d.querySelector('.lang-switch-menu li[data-lang="fr"]').classList.contains('active'));

  // 下拉展开/收起
  const toggle = d.querySelector('.lang-switch-toggle');
  toggle.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('点击 toggle 后菜单展开(open)', dropdown.classList.contains('open'));
  toggle.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('再次点击 toggle 后菜单收起', !dropdown.classList.contains('open'));

  console.log('=== 场景2：登录页（无 header / 无退出按钮）回退 ===');
  const dom2 = makeDom(LOGIN_HTML);
  const d2 = dom2.window.document;
  const dd2 = d2.getElementById('lang-switch-dropdown');
  check('登录页下拉已注入', !!dd2);
  check('登录页回退为右上角固定(floating)', dd2.classList.contains('floating'));
  check('登录页无退出图标时未报错', !d2.querySelector('.fa-sign-out-alt'));

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
