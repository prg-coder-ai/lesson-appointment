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
  /**
   * 「本标签页是否已与后端核对过课堂配置」的标记（sessionStorage）。
   *
   * 为什么需要它：localStorage 里的 eclassroomConfig 是**上一次会话**的快照，
   * 平台管理员改过租户课堂开关后它不会自己失效，而「是否隐藏课堂菜单」只看这个快照。
   * 旧实现只在 key 缺失时才补拉（null 才算未知），于是出现过
   * 「禁用过一次 → 缓存 {enabled:false} → 之后开通了菜单也永远不回来，必须手动清缓存」。
   * 现在按标签页核对一次，缓存脏了也能自愈。
   */
  const VERIFIED_KEY = 'eclassroomConfigVerified';

  function isVerified() {
    try { return sessionStorage.getItem(VERIFIED_KEY) === '1'; } catch (e) { return false; }
  }
  function markVerified() {
    try { sessionStorage.setItem(VERIFIED_KEY, '1'); } catch (e) { /* ignore */ }
  }

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

  /**
   * 配置是否已经取到过。
   * 与 hasClassroom() 的区别很关键：
   *   - hasClassroom()===false 有两种含义：① 明确未启用；② 压根还没取到配置（null）。
   *   - 菜单显隐必须区分这两者，否则「网络慢/老会话 → 配置为空」会把入口误隐藏，
   *     而且隐藏后没有恢复路径（用户永远点不到，以为功能没了）。
   */
  function hasConfigLoaded() {
    return getConfig() !== null;
  }

  /**
   * 主动拉取一次课堂配置（并发去重）。
   * 用于配置为空时补齐：登录响应写入（auth.js）、api.js 的启动补拉都可能没跑到
   * （老 token 直接进页面、接口抖动等），此处按需兜一次。
   * @param {boolean} [force] true = 无视本地缓存，强制向后端核对一次
   *                          （缓存可能是旧租户/旧开关状态，见 VERIFIED_KEY 注释）
   * @returns {Promise<Object|null>} 配置对象；取不到返回 null
   */
  var _ensurePromise = null;
  function ensureConfig(force) {
    var cur = getConfig();
    if (cur !== null && !force) return Promise.resolve(cur);
    if (_ensurePromise) return _ensurePromise;

    var token = null;
    try { token = localStorage.getItem('token'); } catch (e) { /* ignore */ }
    var ep = (window.ApiPaths && window.ApiPaths.ENDPOINTS && window.ApiPaths.ENDPOINTS.ECLASSROOM_CONFIG) || '';
    if (!token || !ep || typeof window.request !== 'function') {
      return Promise.resolve(null);
    }

    _ensurePromise = window.request({
      url: ep,
      method: 'get',
      customLoading: false,
      customErrorMsg: false
    }).then(function (cfg) {
      if (cfg) {
        setConfig(cfg);
        // 只有真正拿到后端结果才标记已核对；请求失败保持「未核对」，
        // 这样下一次进页面还会再试一次，不会把一次网络抖动固化成永久隐藏。
        markVerified();
      }
      return getConfig();
    }).catch(function () {
      return null;
    }).then(function (v) {
      _ensurePromise = null;
      return v;
    });
    return _ensurePromise;
  }

  function getClassroomApiBaseUrl() {
    var config = getConfig();
    return config ? (config.apiBaseUrl || '') : '';
  }

  function getClassroomWsBaseUrl() {
    var config = getConfig();
    return config ? (config.wsBaseUrl || '') : '';
  }

  /**
   * 批量应用菜单显隐。
   *
   * 【2026-11-13 修正①】原实现只看 hasClassroom()：配置为空（还没取到）就当成"未启用"直接
   * display:none，且没有任何恢复路径。页面 onload 里 autoLoginCheck() 的补拉是异步的，
   * 同步执行的 applyMenuVisibility() 往往先跑 → 入口被永久隐藏，表现为"课堂菜单消失"。
   *
   * 【2026-11-13 修正②】光区分「null」还不够：缓存里留着上一次会话的 {enabled:false}
   * 时同样不是未知，而是**过期**。所以判断依据从「有没有缓存」改成「本标签页有没有
   * 和后端核对过」：没核对过 → 先显示并强制核对一次（每标签页仅一次请求），
   * 核对过 → 才按缓存值收敛。平台端改了开关后，用户刷新页面即可自愈。
   */
  function applyMenuVisibility() {
    var items = document.querySelectorAll('.menu-item[data-module="classroom"]');

    if (!isVerified()) {
      // 尚未与后端核对：先保持可见（宁可见一次，也不让入口无声消失）
      items.forEach(function (item) { item.style.display = ''; });
      ensureConfig(true).then(function (v) {
        if (v !== null) applyMenuVisibility();
      });
      return;
    }

    var config = getConfig();
    var enabled = config !== null && config.enabled === true;
    items.forEach(function (item) {
      item.style.display = enabled ? '' : 'none';
    });
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
  window.hasClassroomConfigLoaded = hasConfigLoaded;
  window.hasClassroomConfigVerified = isVerified;
  window.ensureClassroomConfig = ensureConfig;
  window.getClassroomApiBaseUrl = getClassroomApiBaseUrl;
  window.getClassroomWsBaseUrl = getClassroomWsBaseUrl;
  window.setEclassroomConfig = setConfig;
  window.applyMenuVisibility = applyMenuVisibility;
  window.guardClassroom = guardClassroom;
})();