/**
 * 三角色统一入口分流（classic script，IIFE 自包含）
 * ==================================================================
 * 独立 App 用统一「我的课堂」页，按登录态 role 决定展示哪份列表：
 *   teacher / platform_admin → 教师工作台（排期 → 开课）
 *   student                  → 学生工作台（预约 / 课堂号 → 加入）
 *   admin                    → 运营台（巡课 / 强制结课）
 *
 * ★ P1 增强：深链构建
 *   - classroomDeepLink(scheduleId)      → 统一进课堂（课堂页按登录态取 role）
 *   - prepDeepLink(scheduleId, role)     → 课前检测（学生带 mode=student）
 *   - params()                            → 解析 URL 参数，支持通知/二维码直达
 *
 * 课堂页 URL 契约（与 classroom.html / classroom-prep.html 一致）：
 *   classroom.html?scheduleId=<key>           第1课次裸id，第2起 "<id>~N"
 *   classroom-prep.html?scheduleId=<key>[&mode=student]
 */
(function (global) {
  'use strict';

  var ROLE_TARGET = {
    teacher: 'teacher.html',
    platform_admin: 'teacher.html',
    student: 'student.html',
    admin: 'admin.html'
  };
  var ROLE_LABEL = {
    teacher: '教师', platform_admin: '平台管理员', student: '学生', admin: '管理员'
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

  function targetFor(role) { return ROLE_TARGET[role] || 'login.html'; }
  function labelFor(role) { return ROLE_LABEL[role] || role || '未知'; }

  function resolve() {
    var u = currentUser();
    var role = u ? String(u.role || '').toLowerCase() : '';
    return {
      role: role,
      roleLabel: labelFor(role),
      target: targetFor(role),
      displayName: (u && (u.name || u.account)) || '',
      tenantCode: (u && (u.tenantCode || u.tCode)) || '',
      authenticated: !!(u && global.localStorage.getItem('token'))
    };
  }

  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }

  /** 统一进课堂：课堂页按登录态取 role，不信任 URL role（配合 FP-001） */
  function classroomDeepLink(scheduleId) {
    if (!scheduleId) return '';
    return 'classroom.html?scheduleId=' + enc(scheduleId);
  }

  /** 课前检测：学生带 mode=student，教师/管理员用缺省教师模式 */
  function prepDeepLink(scheduleId, role) {
    if (!scheduleId) return '';
    var r = role || currentRole();
    var mode = (r === 'student') ? '&mode=student' : '';
    return 'classroom-prep.html?scheduleId=' + enc(scheduleId) + mode;
  }

  /** 解析当前 URL 参数 */
  function params() {
    var out = {};
    try {
      var q = global.location.search.replace(/^\?/, '');
      q.split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = i === -1 ? kv : kv.slice(0, i);
        var v = i === -1 ? '' : kv.slice(i + 1);
        try { out[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
    return out;
  }

  global.RoleRouter = {
    currentRole: currentRole,
    targetFor: targetFor,
    labelFor: labelFor,
    resolve: resolve,
    classroomDeepLink: classroomDeepLink,
    prepDeepLink: prepDeepLink,
    params: params
  };
})(typeof window !== 'undefined' ? window : this);
