/**
 * 认证相关 API（依赖 utility_request.js 提供的 window.request）
 */
(function () {
  if (typeof window.request === 'undefined') {
    console.error('auth.js 依赖 utility_request.js，请先引入 utility_request.js');
    return;
  }

  const request = window.request;

  // 登录 API：参数应当放在 data 中
  function login(data) {
    // data: { account: 'xxx', password: 'yyy' }
    return request({
      url: '/auth/login',
      method: 'post',
      data: data,             // 参数传递方式正确
      customErrorMsg: false
    });
  }

  // 登出 API：refreshToken 作为 data 传递，符合一般 POST 格式
  function logout(refreshToken) {
    // 后端如要求 JSON 格式：{ refreshToken: ... }
    return request({
      url: '/auth/logout',
      method: 'post',
      data: { refreshToken: refreshToken } // 参数传递方式正确
    });
  }

  function kickUser(userId) {
    return request({ url: '/auth/kick/' + userId, method: 'delete' });
  }

  async function handleLogout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch (e) {
        console.warn('登出接口调用失败，仍清除本地登录态', e);
      }
    }
    localStorage.clear();
    document.cookie = 'currentUser=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/';
    location.href = './index.html';
  }
  
  /**
   * 保存当前用户会话信息到 localStorage 和 cookie
   * 
   * 功能说明：
   * 1. 将后端登录返回的用户信息（如 token、refreshToken、用户账号、角色、名称）分别存入 localStorage 和 cookie，方便前端各页面读取、自动登录、鉴权等场景使用。
   * 2. token/refreshToken 以独立字段存储，便于后续接口请求/刷新。
   * 3. 构造 currentUser（包含基本用户信息）分别存储在 localStorage 和 cookie（带有效期）。
   * 4. cookie 用于部分页面切换、tab/iframe 共享及部分后端读取场景，localStorage 便于前端多处读取和持久化存储。
   * 5. 写入 cookie 时，设置20小时有效期。
   * 6. 存储失败会有详细错误日志。
   *
   * @param {Object} user 登录返回的用户对象，结构包含 userId、account、name、role、token、refreshToken
   * @returns {Object} currentUser 当前活跃用户简要信息对象
   */

  function saveCurrentUserSession(user) {
    localStorage.setItem('token', user.token);
    localStorage.setItem('refreshToken', user.refreshToken);
    const currentUser = {
      userId: user.userId,
      account: user.account,
      name: user.name,
      role: user.role,
      token: user.token
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    try {
      const d = new Date();
      d.setTime(d.getTime() + 20 * 60 * 60 * 1000);
      document.cookie =
        'currentUser=' +
        encodeURIComponent(JSON.stringify(currentUser)) +
        ';expires=' +
        d.toUTCString() +
        ';path=/';
    } catch (e) {
      console.error('写入 cookie 失败', e);
    }
    return currentUser;
  }
  /**
   * cookie 与 localStorage 存储的差异、优缺点
   * 
   * 1. 存储位置与作用范围
   *   - cookie：会随着每个 HTTP 请求自动携带到服务器，可以被服务端读取和用于会话维持。单个域名下所有路径共享，支持设置过期时间与路径、域限制。
   *   - localStorage：仅存储在客户端浏览器，不会自动随请求发送到服务器，仅限同源页面 JS 访问，不能被服务器直接读取，作用于同源下所有标签页/窗口，除非主动清除。
   * 
   * 2. 大小限制
   *   - cookie：通常每个 cookie 最多 4KB，总数约 20 个（各浏览器略不同），有限制，主要用于小体积数据如 token/session id。
   *   - localStorage：通常 5MB 级别，远大于 cookie，适合存储大量本地数据、配置等。
   * 
   * 3. 生命周期
   *   - cookie：支持设置 expires/max-age，可持久、可会话级（如未设置则关闭浏览器失效）。
   *   - localStorage：持久性存储，除非主动清除或用户手动清空，否则刷新/重开浏览器仍在。
   * 
   * 4. 安全性
   *   - cookie：如未设置 HttpOnly，容易被 XSS 窃取。用于跨站有被 CSRF 利用的风险。可通过 Secure/HttpOnly/ SameSite 增加安全性。
   *   - localStorage：不能被服务器端直接访问，但同样易受 XSS 攻击（前端 JS 可读取）。不建议用于存敏感信息或长久 token。无法通过设置策略限制作用域。
   * 
   * 5. 其他特性
   *   - cookie：可通过响应头 Set-Cookie 控制，后端可读写，适合存放登录态、会话 id，适合和后端联动的场景。
   *   - localStorage：仅前端控制，轻便高效，适合存储 UI 状态、偏好、缓存数据等。
   * 
   * 【总结】
   *  - 存需与后端共享或做会话认证的信息时，优先用 cookie (结合 HttpOnly/Secure)。
   *  - 存仅前端自己用的数据时，优先用 localStorage（如主题色、临时草稿等）。
   *  - 二者都容易被 XSS 窃取，敏感数据应谨慎存储，配合 CSP、输入过滤等手段提安全。
   */

  async function authenticateUser(account, pwd) {
    const loginInfo = { account: account, password: pwd };
    try {
      const res = await login(loginInfo);
      if (!res || !res.token) {
        throw new Error('登录失败，未返回有效凭证');
      }
      //console .log("authenticateUser",res);
      return saveCurrentUserSession(res);
    } catch (err) {
      const msg =
        typeof err === 'string'
          ? err
          : err.message || err.msg || '账号或密码错误，请重试';
      throw msg;
    }
  }


   // 利用后端 "/account/exist" 检查账号是否已经存在
   // 该函数会对输入账号发起GET请求，返回Promise<boolean>
   async function checkAccountExists(registerAccount) {
     if (!registerAccount) return false; // 没有账号直接认为不存在（交给前面表单校验）
     try {
       const resp = await request({url:`${API_BASE_URL}/user/account/exist?account=${encodeURIComponent(registerAccount)}`});
     //  if (!resp.ok) {
         // 网络异常一律视为未占用，但需给出alert以便排查问题
        //  alert("网络异常，无法校验账号是否存在,稍等再试"); //可根据需要屏蔽
     //    return false;
    //   }
    //   const data = await resp.json();
       // 期望后端返回 { code: ..., data: true/false }
       return  resp ;//    !!(data && data.data === true);
     } catch (e) {
       // 网络或js异常视为未占用
     //   alert("连接后端失败，无法判断账号是否已存在,稍等再试");
       return false;
     }
   }
  window.login = login;
  window.logout = logout;
  window.kickUser = kickUser;
  window.handleLogout = handleLogout;
  window.authenticateUser = authenticateUser;
  window.checkAccountExists = checkAccountExists;
 
})();
//修改：course delete
//checkAccountExists