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

  /**
   * 回环地址判定（2026-11-16）：配置里的 apiBaseUrl / wsBaseUrl 若为
   * 127.0.0.1 / localhost / ::1，对浏览器一律归一为「同源空串」。
   *
   * 背景：sys_eclassroom_instance.default-local 的 api_host=127.0.0.1，
   * 后端据此下发 http://127.0.0.1:8092/api/v1。本机打开 localhost:8080 时恰好能用
   * （127.0.0.1 就是本机），但局域网另一台电脑用 https://192.168.1.7:8080 打开时，
   * 浏览器里的 127.0.0.1 指向的是**访问者自己那台电脑**——连不上，或连错机器。
   * 回环地址只在「服务端自调用」时有意义（课堂事件推送仍用后端原值，不受此处影响）；
   * 对浏览器，正确做法是走同源反向代理（dev-proxy / nginx 已把 /api/v1 分流到 8092，
   * /ws/classrooms 也已转发），这样地址永远跟着页面地址走，换网络零改动。
   *
   * 正则要求 host 后紧跟 : / 或结束，避免把 127.0.0.10 误判成回环。
   */
  function isLoopbackBase(base) {
    if (!base) return false;
    return /(^|\/\/)(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/i.test(String(base));
  }

  function getClassroomApiBaseUrl() {
    var config = getConfig();
    var base = config ? (config.apiBaseUrl || '') : '';
    return isLoopbackBase(base) ? '' : base;
  }

  function getClassroomWsBaseUrl() {
    var config = getConfig();
    var base = config ? (config.wsBaseUrl || '') : '';
    return isLoopbackBase(base) ? '' : base;
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
    if (hasClassroom()) return true;
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
    /**
     * 未登录（拿不到角色）时把「当前页」塞进 redirect：登录成功后 login.html 会按它回跳，
     * 直接落回这间课堂。
     *
     * <p>为什么必须有：课堂链接是管理员临时发给学生的（尤其应急建的临时课堂，学生端
     * 「我的课堂」根本没有这条记录）。没有 redirect 时，学生点链接 → 登录页 → 登录成功
     * 被丢进学生工作台，得再点一次链接才进得去，实际就是「链接发了但进不来」。
     *
     * <p>已登录但租户未开通课堂时**不带** redirect：那不是登录问题，带上只会变成
     * 「登录 → 被踢回首页 → 再点链接 → 再登录」的死循环。
     */
    var back = '';
    try {
      back = (window.location.pathname || '').split('/').pop() + (window.location.search || '');
    } catch (e) { /* file:// 等异常场景忽略 */ }
    var extra = (target === 'login.html' && /\.html(\?|#|$)/i.test(back)) ? { redirect: back } : null;
    if (typeof window.pageUrl === 'function') {
      window.location.href = extra ? window.pageUrl(target, extra) : window.pageUrl(target);
    } else {
      window.location.href = extra
        ? './' + target + '?redirect=' + encodeURIComponent(back)
        : './' + target;
    }
    return false;
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