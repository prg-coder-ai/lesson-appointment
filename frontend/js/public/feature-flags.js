/**
 * 课堂特性开关工具（依赖：无，纯 localStorage 读写）
 *
 * 职责：
 *  - 读写 eclassroomConfig（登录响应返回的课堂配置）
 *  - 判断当前租户是否启用课堂
 *  - 获取课堂 API / WebSocket 基础地址
 *  - 批量隐藏未启用模块的菜单项
 *  - 课堂页面守卫（未启用则跳回角色首页）
 */
(function () {
  const STORAGE_KEY = 'eclassroomConfig';

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function setConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config || null));
    } catch (e) {
      console.error('setEclassroomConfig 写入失败', e);
    }
  }

  function hasClassroom() {
    var config = getConfig();
    return config !== null && config.enabled === true;
  }

  function getClassroomApiBaseUrl() {
    var config = getConfig();
    return config ? (config.apiBaseUrl || '') : '';
  }

  function getClassroomWsBaseUrl() {
    var config = getConfig();
    return config ? (config.wsBaseUrl || '') : '';
  }

  function applyMenuVisibility() {
    if (!hasClassroom()) {
      var items = document.querySelectorAll('.menu-item[data-module="classroom"]');
      items.forEach(function (item) {
        item.style.display = 'none';
      });
    }
  }

  function guardClassroom() {
    if (!hasClassroom()) {
      var role = '';
      try {
        var user = JSON.parse(localStorage.getItem('currentUser') || '{}');
        role = user.role || '';
      } catch (e) { /* ignore */ }
      var pageMap = {
        admin: 'admin.html',
        teacher: 'teacher.html',
        student: 'student.html',
        platform_admin: 'platform_admin.html'
      };
      var target = pageMap[role] || 'login.html';
      if (typeof window.pageUrl === 'function') {
        window.location.href = window.pageUrl(target);
      } else {
        window.location.href = './' + target;
      }
      return false;
    }
    return true;
  }

  window.hasClassroom = hasClassroom;
  window.getClassroomApiBaseUrl = getClassroomApiBaseUrl;
  window.getClassroomWsBaseUrl = getClassroomWsBaseUrl;
  window.setEclassroomConfig = setConfig;
  window.applyMenuVisibility = applyMenuVisibility;
  window.guardClassroom = guardClassroom;
})();