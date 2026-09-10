/**
 * 缺失页面守卫（404 兜底告警）
 *
 * 背景（2026-09-10 事故）：
 *   Nginx 为了 SPA 兜底配了 `try_files $uri $uri/ /index.html;`。
 *   本项目其实是**多页静态应用**（admin.html / teacherInfo.html / booking.html …），并非 SPA。
 *   于是任何「页面文件不存在」的请求都会被静默兜底成登录首页 ——
 *   表现为「点完某个功能，闪一下就回到登录界面」，看上去像是登录态失效、
 *   token 过期、守卫写错，排错方向完全被带偏。
 *
 *   真实案例：teacherInfo.html（教师职业信息维护页）在「前后端分离」重构时被误删、
 *   未迁入 frontend。管理员在【教师管理】列表点教师姓名 → 404 → 兜底登录页，
 *   表象就是「跳出用户登录界面」，掩盖了「整个页面漏迁」的根因。
 *
 * 作用：
 *   在首页加载的最早阶段判断当前 URL 是否真的在访问首页；
 *   若不是（即靠 try_files 兜底进来的），给出醒目的告警条，并保持登录表单可用，
 *   既不误伤正常访问，也不再把 404 伪装成登录异常。
 *
 * 用法：在 index.html 的 <body> 开头引入本文件（早于登录表单渲染）。
 */
(function () {
  'use strict';

  /** 允许落到首页的路径（大小写不敏感） */
  var HOMEPAGE_FILES = ['index.html', 'default.html', 'home.html'];

  /** 取路径最后一段文件名（去 query / hash），如 /foo/teacherInfo.html -> teacherInfo.html */
  function basename(pathname) {
    var seg = String(pathname || '').split('/');
    return seg[seg.length - 1] || '';
  }

  /**
   * 是否是「正常访问首页」
   * 放行： '/'、'/xxx/index.html'、'/index.html'
   * 拦截： '/teacherInfo.html'、'/some/dir/'（目录不存在也被兜底）
   */
  function isHomeRequest() {
    var path = location.pathname || '/';
    if (path === '/' || path === '') return true;
    if (/\/$/.test(path)) return false;           // 非根却以 / 结尾 → 目录不存在，被兜底
    var name = basename(path).toLowerCase();
    return HOMEPAGE_FILES.indexOf(name) >= 0;
  }

  function buildTip(missing) {
    var box = document.createElement('div');
    box.id = 'missing-page-tip';
    box.setAttribute('role', 'alert');
    box.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:9999',
      'background:#fff2f0', 'border-bottom:1px solid #ffccc7', 'color:#a8071a',
      'padding:12px 20px', 'font-size:13px', 'line-height:1.7',
      'font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.06)'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:14px;margin-bottom:2px;';
    title.textContent = '页面不存在（已被站点兜底规则重定向到登录首页）';

    var detail = document.createElement('div');
    detail.textContent = '你访问的地址：' + missing
      + ' 。该文件在服务器上不存在，Nginx 的 try_files 兜底把请求转给了登录页，'
      + '所以看起来像"莫名其妙回到登录界面"。常见原因：页面漏迁移/改名、链接写错、dist 未同步。';

    var actions = document.createElement('div');
    actions.style.cssText = 'margin-top:8px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;';

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '返回首页';
    backBtn.style.cssText = 'padding:4px 12px;border:1px solid #ffa39e;background:#fff;color:#a8071a;border-radius:4px;cursor:pointer;font-size:12px;';
    backBtn.addEventListener('click', function () {
      // 回首页时保留 tCode，避免把「页面不存在」变成「租户编码丢失」
      location.href = (typeof window.pageUrl === 'function') ? window.pageUrl('index.html') : './index.html';
    });

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '复制报错信息';
    copyBtn.style.cssText = backBtn.style.cssText;
    copyBtn.addEventListener('click', function () {
      var text = '[缺失页面] ' + missing + ' (referrer: ' + (document.referrer || '无') + ')';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () { copyBtn.textContent = '已复制'; },
            function () { fallbackCopy(text); }
          );
        } else {
          fallbackCopy(text);
        }
      } catch (e) {
        fallbackCopy(text);
      }
    });

    actions.appendChild(backBtn);
    actions.appendChild(copyBtn);
    box.appendChild(title);
    box.appendChild(detail);
    box.appendChild(actions);
    return box;
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) { /* 复制失败忽略 */ }
  }

  function show(missing) {
    if (document.getElementById('missing-page-tip')) return;
    var box = buildTip(missing);
    if (document.body) {
      document.body.insertBefore(box, document.body.firstChild);
      // 告警条占位后再让出空间，避免遮住登录框标题
      document.body.style.paddingTop = '86px';
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.insertBefore(box, document.body.firstChild);
        document.body.style.paddingTop = '86px';
      });
    }
    try {
      console.error('[missing-page] 404 兜底告警：' + missing + ' 不存在，已被 try_files 重定向到 index.html');
    } catch (e) { /* ignore */ }
  }

  // 暴露给外部（便于 Selenium / 冒烟测试断言）
  window.__missingPageGuard = { check: isHomeRequest, disable: function () { window.__missingPageGuardDisabled = true; } };

  if (!window.__missingPageGuardDisabled && !isHomeRequest()) {
    show(location.pathname + (location.search || ''));
  }
})();
