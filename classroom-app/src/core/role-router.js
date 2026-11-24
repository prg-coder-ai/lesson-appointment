/**
 * 三角色统一入口分流（classic script，IIFE 自包含）
 * ==================================================================
 * 独立 App 用统一「我的课堂」页，按登录态 role 决定展示哪份列表：
 *   teacher / platform_admin → 教师工作台（排期 → 开课）
 *   student                  → 学生工作台（预约 / 课堂号 → 加入）
 *   admin                    → 运营台（巡课 / 强制结课）
 *
 * 本脚本只做「识别当前角色 + 暴露分流决策」，不改写业务页面。
 * 各工作台页面（student.html / teacher.html）由 auth.js 既有逻辑按 role 跳转；
 * role-router 为 App 自研的统一 my-classroom.html 提供数据。
 */
(function (global) {
  'use strict';

  var ROLE_TARGET = {
    teacher: 'teacher.html',
    platform_admin: 'teacher.html',
    student: 'student.html',
    admin: 'admin.html'
  };

  function currentUser() {
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

  function currentRole() {
    var u = currentUser();
    return u ? String(u.role || '').toLowerCase() : '';
  }

  function targetFor(role) {
    return ROLE_TARGET[role] || 'login.html';
  }

  // 供 my-classroom.html 调用：返回当前角色应展示的入口信息
  function resolve() {
    var u = currentUser();
    var role = u ? String(u.role || '').toLowerCase() : '';
    return {
      role: role,
      target: targetFor(role),
      displayName: (u && (u.name || u.account)) || '',
      tenantCode: (u && (u.tenantCode || u.tCode)) || '',
      authenticated: !!(u && global.localStorage.getItem('token'))
    };
  }

  global.RoleRouter = {
    currentRole: currentRole,
    targetFor: targetFor,
    resolve: resolve
  };
})(typeof window !== 'undefined' ? window : this);
