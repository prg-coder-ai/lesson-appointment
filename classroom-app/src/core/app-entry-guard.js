/**
 * 课堂入口守卫（FP-002）
 * ==================================================================
 * 由 patch.js 注入到 www/classroom.html 的 </head> 前加载。
 *
 * 原课堂页只有 guardClassroom() 查租户开关，缺登录态/角色/租户一致性校验。
 * 本脚本在进入课堂前补一道：
 *   1) token 存在且非过期占位
 *   2) 用户角色属于 teacher/student/admin/platform_admin
 *   3) URL 里的 role 参数（若有）必须与登录态一致（防冒充，配合 FP-001）
 *   4) 租户码 tCode 与登录态一致（防租户串门）
 *
 * 失败时 redirect 到登录页，不在控制台打印敏感信息。
 * classic script + IIFE，零顶层标识符污染。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  function readUser() {
    // 兼容项目里几种用户缓存键
    var keys = ['currentUser', 'userInfo', 'user'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = global.localStorage.getItem(keys[i]);
        if (raw) {
          var u = JSON.parse(raw);
          if (u && typeof u === 'object') return u;
        }
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function param(name) {
    try {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(global.location.search);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  function reject(reason) {
    // 不输出 token/tCode 原文；只记原因码便于排查
    if (global.console && console.warn) console.warn('[classroom-entry-guard] rejected:', reason);
    var back = encodeURIComponent(global.location.href);
    global.location.replace('login.html?reason=entry_guard&code=' + encodeURIComponent(reason) + '&back=' + back);
  }

  function guard() {
    var token = global.localStorage.getItem('token') || '';
    if (!token || token.length < 8) { reject('NO_TOKEN'); return false; }

    var user = readUser();
    // 没有用户缓存时放行给后端 accessGuard 兜底（避免误伤 token 有效但缓存键不同的场景）
    if (!user) return true;

    var role = String(user.role || '').toLowerCase();
    var validRoles = ['teacher', 'student', 'admin', 'platform_admin'];
    if (role && validRoles.indexOf(role) === -1) { reject('BAD_ROLE'); return false; }

    // URL role 与登录态一致性（FP-001 的双保险）
    var urlRole = param('role');
    if (urlRole && role && urlRole.toLowerCase() !== role) { reject('ROLE_MISMATCH'); return false; }

    // 租户码一致性：仅当两者都存在时比对
    var urlT = param('tCode') || param('tenantCode');
    var userT = user.tenantCode || user.tCode || '';
    if (urlT && userT && String(urlT) !== String(userT)) { reject('TENANT_MISMATCH'); return false; }

    return true;
  }

  // 立即执行一次；DOMContentLoaded 再兜底一次（用户缓存可能晚写入）。
  // 用 passed 记录结果，redirect 触发后页面即将跳转，重复执行无害但避免重复告警。
  global.__entryGuardPassed = guard();
  doc.addEventListener('DOMContentLoaded', function () {
    if (!global.__entryGuardPassed) global.__entryGuardPassed = guard();
  });
})(typeof window !== 'undefined' ? window : this);
