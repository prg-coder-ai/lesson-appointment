/**
 * 课堂独立 App · 网页自检面板逻辑（classic script，IIFE 自包含）
 * ==================================================================
 * 由 verify.html 加载。它读取真实构建产物（app-config.js / app-bridge.js /
 * role-router.js / app-permissions.js）并用 fetch 断言补丁标记，把结果
 * 渲染成绿/红清单。全部为只读检查，不修改任何产物文件。
 *
 * ★ 必须通过预览服务器打开（node scripts/serve.js），
 *   file:// 下 fetch 会被浏览器 CORS 拦截，补丁检查会失败（非代码问题）。
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  var results = [];
  function add(group, name, ok, detail) {
    results.push({ group: group, name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- 1) 运行时全局对象与配置 ----------
  function checkRuntime() {
    var cfg = global.APP_CONFIG;
    add('运行时', 'app-config.js 已加载', !!cfg, cfg ? 'env=' + cfg.env : '未定义');
    add('运行时', 'classroomEmbed=false（防课堂套娃）', !!cfg && cfg.classroomEmbed === false,
      cfg ? 'classroomEmbed=' + cfg.classroomEmbed : '-');
    add('运行时', '平台探测 APP_PLATFORM', !!global.APP_PLATFORM, global.APP_PLATFORM || '未定义');
    add('运行时', '桥接对象 CLASSROOM_BRIDGE', !!global.CLASSROOM_BRIDGE,
      global.CLASSROOM_BRIDGE ? 'platform=' + global.CLASSROOM_BRIDGE.platform : '未定义');
    add('运行时', '角色分流 RoleRouter', !!global.RoleRouter,
      global.RoleRouter ? 'targetFor/classroomDeepLink/prepDeepLink' : '未定义');
    add('运行时', '权限引导 AppPermissions', !!global.AppPermissions,
      global.AppPermissions ? 'platform=' + global.AppPermissions.platform : '未定义');

    if (cfg) {
      var isServer = !cfg.apiOrigin && !cfg.classroomApiOrigin && !cfg.classroomWsOrigin;
      add('运行时', '三套地址模式一致', isServer,
        isServer ? 'server 模式：三套地址为空，走同源代理' :
          'local 模式：api=' + (cfg.apiOrigin || '-') + ' / classApi=' + (cfg.classroomApiOrigin || '-'));
      if (cfg.classroomApiOrigin) {
        var base = global.CLASSROOM_BRIDGE && global.CLASSROOM_BRIDGE.classroomApiBase();
        add('运行时', '课堂 API 双基址覆盖生效', base === cfg.classroomApiOrigin, base || '空');
      }
    }
  }

  // ---------- 2) 深链逻辑（纯函数桩） ----------
  function checkDeepLinks() {
    var RR = global.RoleRouter;
    if (!RR) { add('深链', 'RoleRouter 不可用', false, '跳过'); return; }
    add('深链', 'classroomDeepLink(sid~2)',
      RR.classroomDeepLink('sid~2') === 'classroom.html?scheduleId=sid~2',
      RR.classroomDeepLink('sid~2'));
    add('深链', 'prepDeepLink(sid~2, student) 带 mode',
      RR.prepDeepLink('sid~2', 'student') === 'classroom-prep.html?scheduleId=sid~2&mode=student',
      RR.prepDeepLink('sid~2', 'student'));
    add('深链', 'prepDeepLink(sid, teacher) 无 mode',
      RR.prepDeepLink('sid', 'teacher') === 'classroom-prep.html?scheduleId=sid',
      RR.prepDeepLink('sid', 'teacher'));
    add('深链', '角色 → 工作台映射',
      RR.targetFor('teacher') === 'teacher.html' && RR.targetFor('student') === 'student.html' &&
      RR.targetFor('admin') === 'admin.html' && RR.targetFor('platform_admin') === 'teacher.html',
      '教师/平台→teacher，学生→student，管理员→admin');
  }

  // ---------- 3) 补丁落位（fetch 真实产物文本） ----------
  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }
  function checkPatches() {
    var jobs = [
      { url: 'js/classroom/classroom-main.js', label: 'classroom-main.js',
        needles: [{ k: 'FP-001', s: '[FP-001]' }, { k: 'role 收口', s: 'role: user.role' }] },
      { url: 'classroom.html', label: 'classroom.html',
        needles: [{ k: 'FP-002 守卫', s: '<!-- FP-002:app-entry-guard -->' },
                  { k: '守卫脚本引用', s: 'app-entry-guard.js' },
                  { k: 'FP-007a 权限', s: '<!-- FP-007a:app-permissions -->' }] },
      { url: 'classroom-prep.html', label: 'classroom-prep.html',
        needles: [{ k: 'FP-007b 权限', s: '<!-- FP-007b:app-permissions -->' }] }
    ];
    return Promise.all(jobs.map(function (j) {
      return fetchText(j.url).then(function (text) {
        j.needles.forEach(function (n) {
          add('补丁', j.label + ' · ' + n.k, text.indexOf(n.s) >= 0, n.s);
        });
      }).catch(function (e) {
        add('补丁', j.label + ' 读取失败', false, e.message + '（是否用 file:// 打开了？）');
      });
    }));
  }

  // ---------- 4) 关键资源可达 ----------
  function checkResources() {
    var urls = ['index.html', 'my-classroom.html', 'login.html', 'student.html', 'teacher.html',
      'classroom.html', 'classroom-prep.html', 'app.css', 'app-config.js', 'app-bridge.js',
      'app-entry-guard.js', 'app-permissions.js', 'role-router.js',
      'js/classroom/classroom-main.js', 'js/classroom/classroom-prep.js', 'js/public/api.js'];
    return Promise.all(urls.map(function (u) {
      return fetch(u, { method: 'GET', cache: 'no-store' }).then(function (r) {
        add('资源', u, r.ok, 'HTTP ' + r.status);
      }).catch(function (e) {
        add('资源', u, false, e.message);
      });
    }));
  }

  // ---------- 5) 渲染 ----------
  function renderRole(role) {
    var box = doc.getElementById('role-out');
    if (!box || !global.RoleRouter) return;
    var store = global.localStorage;
    try {
      if (role) {
        store.setItem('token', 'verify-token-000000');
        store.setItem('currentUser', JSON.stringify({
          role: role, userId: 'verify-' + role, name: '验证用户', tenantCode: 'T-DEMO'
        }));
      }
    } catch (e) { /* ignore */ }
    var info = global.RoleRouter.resolve();
    box.innerHTML = '<div class="kv"><span>识别角色</span><b>' + esc(info.role || '（未登录）') + '</b></div>' +
      '<div class="kv"><span>角色名</span><b>' + esc(info.roleLabel) + '</b></div>' +
      '<div class="kv"><span>工作台</span><b>' + esc(info.target) + '</b></div>' +
      '<div class="kv"><span>已登录</span><b>' + (info.authenticated ? '是' : '否') + '</b></div>' +
      '<div class="kv"><span>进课堂</span><b>' + esc(global.RoleRouter.classroomDeepLink('demo~2')) + '</b></div>';
  }

  function renderSummary() {
    var pass = results.filter(function (r) { return r.ok; }).length;
    var fail = results.length - pass;
    var groups = {};
    results.forEach(function (r) {
      (groups[r.group] = groups[r.group] || []).push(r);
    });
    var html = '';
    Object.keys(groups).forEach(function (g) {
      html += '<section><h2>' + esc(g) + '</h2><div class="rows">';
      groups[g].forEach(function (r) {
        html += '<div class="row ' + (r.ok ? 'ok' : 'bad') + '">' +
          '<span class="mark">' + (r.ok ? '✓' : '✗') + '</span>' +
          '<span class="name">' + esc(r.name) + '</span>' +
          '<span class="detail">' + esc(r.detail) + '</span></div>';
      });
      html += '</div></section>';
    });
    var list = doc.getElementById('checks');
    if (list) list.innerHTML = html;
    var top = doc.getElementById('summary');
    if (top) {
      top.className = 'summary ' + (fail === 0 ? 'allok' : 'hasbad');
      top.innerHTML = '<div class="big">' + pass + ' <small>/ ' + results.length + ' 项通过</small></div>' +
        '<div class="sub">' + (fail === 0 ? '全部检查通过 — 产物与补丁均已就绪' :
          fail + ' 项失败 — 见下方红色条目') + '</div>';
    }
  }

  function bindRoleButtons() {
    var btns = doc.querySelectorAll('[data-role]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () { renderRole(b.getAttribute('data-role')); });
    });
    var clear = doc.getElementById('role-clear');
    if (clear) clear.addEventListener('click', function () {
      try {
        global.localStorage.removeItem('token');
        global.localStorage.removeItem('currentUser');
      } catch (e) { /* ignore */ }
      renderRole('');
    });
  }

  function run() {
    if (global.location.protocol === 'file:') {
      var warn = doc.getElementById('file-warn');
      if (warn) warn.style.display = 'block';
    }
    bindRoleButtons();
    renderRole('');
    checkRuntime();
    checkDeepLinks();
    Promise.all([checkPatches(), checkResources()]).then(renderSummary).catch(function (e) {
      add('运行时', '自检执行异常', false, e.message);
      renderSummary();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
  else run();
})(typeof window !== 'undefined' ? window : this);
