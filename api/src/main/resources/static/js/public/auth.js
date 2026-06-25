/**
 * 认证相关 API（依赖 utility_request.js 提供的 window.request）
 */
(function () {
  if (typeof window.request === 'undefined') {
    console.error('auth.js 依赖 utility_request.js，请先引入 utility_request.js');
    return;
  }

  const request = window.request;

  function login(data) {
    return request({
      url: '/auth/login',
      method: 'post',
      data,
      customErrorMsg: false
    });
  }

  function logout(refreshToken) {
    return request({
      url: '/auth/logout',
      method: 'post',
      data: { refreshToken }
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

  async function authenticateUser(account, pwd) {
    const loginInfo = { account: account, password: pwd };
    try {
      const res = await login(loginInfo);
      if (!res || !res.token) {
        throw new Error('登录失败，未返回有效凭证');
      }
      return saveCurrentUserSession(res);
    } catch (err) {
      const msg =
        typeof err === 'string'
          ? err
          : err.message || err.msg || '账号或密码错误，请重试';
      throw msg;
    }
  }

  window.login = login;
  window.logout = logout;
  window.kickUser = kickUser;
  window.handleLogout = handleLogout;
  window.authenticateUser = authenticateUser;
})();
