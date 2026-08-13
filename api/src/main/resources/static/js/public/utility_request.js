/**
 * 浏览器版 HTTP 请求封装（与 axios 拦截器逻辑一致，供静态页面使用）
 * 使用前需在页面中先引入 axios CDN，并可选设置 window.API_BASE_URL
 */
(function () {
  if (typeof axios === 'undefined') {
    console.error('utility_request.js 依赖 axios，请先引入 axios CDN');
    return;
  }

  let loadingCount = 0;
  let isRefreshing = false;
  let requestQueue = [];

  const API_BASE_URL = window.API_BASE_URL || '';

  function showError(msg) {
    if (typeof window.showApiError === 'function') {
      window.showApiError(msg);
    } else {
      console.error(msg);
    }
  }

  const startLoading = () => {
    loadingCount++;
  };

  const closeLoading = () => {
    loadingCount--;
    if (loadingCount <= 0) {
      loadingCount = 0;
    }
  };

  const refreshTokenAxios = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000
  });
  /**
   * getNewToken 的功能及原理：
   * 
   * 功能简介：
   *   getNewToken 方法用于通过 refreshToken 向后端请求新的访问令牌（token）。当用户的 token 过期后，
   *   前端可调用此方法获取最新的 token，以实现无感刷新登录态，提高用户体验。
   * 
   * 原理解析：
   *   1. 从 localStorage 获取当前保存的 refreshToken。
   *   2. 使用单独的 axios 实例（refreshTokenAxios）发起 POST 请求，请求路径为 /auth/refreshToken，
   *      请求体（body）中携带 { refreshToken }。
   *   3. 后端收到请求后校验 refreshToken，若合法返回新的 token（和新的 refreshToken），否则拒绝（如过期或被踢出）。
   *   4. 请求结果返回 Promise，前端收到新 token 后应适时更新 localStorage 并重试原始请求。
   * 
   * 典型场景：
   *   - 用户已经登录，但 token 过期，自动刷新 token 无需重新登录。
   *   - 实现 token 失效自动续约流程时常用。
   * 
   * 安全提示：
   *   - refreshToken 通常有效期比 token 长，只保存在客户端本地，不随请求自动发送，建议存储和传输均走 HTTPS。
   *   - 后端应防止 refreshToken 泄露被重放攻击，合理设置其有效期，且发现异常可将其失效。
   */

  function getNewToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    // 修复：localStorage 存的是 JSON 字符串，必须先 JSON.parse 才能取字段
    // 否则 cuser.account / cuser.role 都是 undefined，刷新接口拿不到账号 → 401 → 又触发刷新 → 死循环
    let account = undefined;
    let role = undefined;
    try {
      const cuserStr = localStorage.getItem('currentUser');
      if (cuserStr) {
        const cuser = JSON.parse(cuserStr);
        account = cuser && cuser.account;
        role = cuser && cuser.role;
      }
    } catch (e) {
      console.warn('解析 currentUser 失败：', e);
    }
    return refreshTokenAxios.post('/auth/refreshToken', {
      refreshToken: refreshToken,
      account: account,
      role: role
    });
  }

  /**
   * 保存登录重定向信息（页面级公共工具）
   * 场景：接口 401 跳登录前，保存当前来源页 URL，登录成功后按此返回
   *
   * 安全：只保留 pathname+search+hash，去掉 origin；对结果做白名单正则校验
   * @param {'401'|'logout'|'noauth'} [reason] 触发原因（调试用）
   */
  function saveLoginRedirect(reason) {
    // ===== 调试日志 1：函数入口 =====
    // 用 groupCollapsed 把整次 save 折叠起来，避免控制台太乱
    console.groupCollapsed(
      '%c[AuthRedirect] saveLoginRedirect 触发',
      'color:#fff;background:#d97706;padding:2px 6px;border-radius:3px;',
      'reason=', reason || '(default 401)'
    );
    console.log('[AuthRedirect] 1. 原始 location：', {
      pathname: window.location.pathname,
      search:   window.location.search,
      hash:     window.location.hash,
      href:     window.location.href
    });

    try {
      // 只保留相对 URL，避免跨域/开放重定向漏洞
      let relUrl = window.location.pathname + window.location.search + window.location.hash;
      console.log('[AuthRedirect] 2. 拼接原始 relUrl：', relUrl);

      if (!relUrl || relUrl === '/' || relUrl === '') {
        relUrl = './index.html';
        console.log('[AuthRedirect] 2.a 空路径 → 降级 ./index.html');
      } else if (!relUrl.startsWith('.')) {
        // pathname 如 /admin.html → 转成 ./admin.html 匹配实际项目的相对路径
        relUrl = '.' + relUrl;
        console.log('[AuthRedirect] 2.b 补点号 →', relUrl);
      }

      // 白名单校验：只允许本项目的静态 html 页面（相对路径 + search + hash）
      const safe = /^(\.\/|\.\.\/)?[A-Za-z0-9_\-]+\.html(\?[^#]*)?(#.*)?$/.test(relUrl);
      console.log('[AuthRedirect] 3. 白名单正则校验：', safe ? '✅ PASS' : '❌ FAIL', '→', relUrl);
      if (!safe) {
        console.warn('[AuthRedirect] 3.a 未通过白名单，降级跳首页：', relUrl);
        relUrl = './index.html';
      }

      const info = {
        url: relUrl,
        title: document.title || '',
        ts: Date.now(),
        reason: reason || '401'
      };
      console.log('[AuthRedirect] 4. 准备写入 localStorage：', info);

      localStorage.setItem('auth_redirect_info', JSON.stringify(info));

      // 回读校验，确认真的写进去了
      const verify = localStorage.getItem('auth_redirect_info');
      console.log('[AuthRedirect] 5. 回读校验：', verify ? '✅ 已写入' : '❌ 写入失败');
      if (verify) {
        console.log('[AuthRedirect] 6. localStorage.auth_redirect_info =', verify);
      }
    } catch (e) {
      console.error('[AuthRedirect] saveLoginRedirect 异常：', e);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * 读取登录重定向信息（不存在返回 null；读取后会立即清理，避免过期残留）
   * @returns {String|null} 合法的相对 URL（如 './admin.html#student-management?tab=1'）
   */
  function consumeLoginRedirect() {
    console.groupCollapsed(
      '%c[AuthRedirect] consumeLoginRedirect 触发',
      'color:#fff;background:#0891b2;padding:2px 6px;border-radius:3px;'
    );

    try {
      const raw = localStorage.getItem('auth_redirect_info');
      console.log('[AuthRedirect] 1. 读取 localStorage.auth_redirect_info：', raw || '(空)');

      if (!raw) {
        console.log('[AuthRedirect] 2. 没有 redirect 信息，返回 null（首次登录或已消费）');
        return null;
      }

      const info = JSON.parse(raw);
      console.log('[AuthRedirect] 3. 解析对象：', info);

      // 用完即删（无论后续校验是否通过，都已经"消费"过了）
      localStorage.removeItem('auth_redirect_info');
      console.log('[AuthRedirect] 4. 已删除 localStorage.auth_redirect_info（用完即删）');

      if (!info || !info.url) {
        console.warn('[AuthRedirect] 5. info.url 为空，返回 null');
        return null;
      }

      // 二次白名单校验（避免读取时已被污染）
      const safe = /^(\.\/|\.\.\/)?[A-Za-z0-9_\-]+\.html(\?[^#]*)?(#.*)?$/.test(info.url);
      console.log('[AuthRedirect] 6. 白名单二次校验：', safe ? '✅ PASS' : '❌ FAIL', '→', info.url);
      if (!safe) {
        console.warn('[AuthRedirect] 6.a 未通过白名单，返回 null（可能被篡改）');
        return null;
      }

      // ts 超过 24h 过期
      const ageMs = info.ts ? (Date.now() - info.ts) : 0;
      const expired = info.ts && ageMs > 24 * 60 * 60 * 1000;
      console.log('[AuthRedirect] 7. 过期检查：',
        'age=' + (ageMs / 1000 / 60).toFixed(1) + 'min',
        expired ? '❌ 已超过24h' : '✅ 未过期');
      if (expired) {
        console.warn('[AuthRedirect] 7.a 已过期，丢弃');
        return null;
      }

      console.log('%c[AuthRedirect] 8. ✅ 返回 redirect URL：' + info.url,
        'color:#16a34a;font-weight:bold;');
      return info.url;
    } catch (e) {
      console.error('[AuthRedirect] consumeLoginRedirect 异常：', e);
      localStorage.removeItem('auth_redirect_info');
      return null;
    } finally {
      console.groupEnd();
    }
  }

  /**
   * 清理登录重定向信息（显式清理场景：注册/登录手动取消等）
   */
  function clearLoginRedirect() {
    console.log('%c[AuthRedirect] clearLoginRedirect 触发，清理 auth_redirect_info',
      'color:#dc2626;');
    try {
      localStorage.removeItem('auth_redirect_info');
      console.log('[AuthRedirect] 已清理');
    } catch (_) {
      console.warn('[AuthRedirect] 清理异常', _);
    }
  }

  // 暴露到全局，供 auth.js / api.js / 各业务页面统一调用
  window.saveLoginRedirect = saveLoginRedirect;
  window.consumeLoginRedirect = consumeLoginRedirect;
  window.clearLoginRedirect = clearLoginRedirect;

  const service = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    }
  });

  // 在 axios 的 config 中，params 和 data 的区别如下：
  // - params: 只用于 GET、DELETE 等方法，作为 URL 查询参数（如 ?id=1&name=xx）拼接在 URL 上（会经过 encodeURIComponent），
  //           后端通过 @RequestParam 可获取；参数放在 config.params。
  // - data:   只用于 POST、PUT、PATCH 等方法，用作请求体(body)，发送到服务器（需要序列化，通常为 JSON）。
  //           后端通常用 @RequestBody 或 request.getInputStream() 读 body 内容，参数放在 config.data。
  // - 注意：GET/DELETE 方法 axios 不会自动把 data 带给后端（除非特殊配置），POST/PUT/PATCH 方法 params 会拼 URL，data 是体。
  // - 实战建议：GET/DELETE 参数用 params，POST/PUT/PATCH 参数用 data。
  // 参考 dataFunctions.js 的注释/示例和官方文档！
  service.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // 这里可以同时输出 params 和 data，方便前端调试和区分：
     console.log(
        "请求 URL：", config.url
        //,
        //"url参数 params：", config.params,
       // "请求体 data：", config.data
      );
 
      if (config.customLoading !== false) {
        startLoading();
      }
      return config;
    },
    (error) => {
      closeLoading();
      showError('请求发起失败');
      return Promise.reject(error);
    }
  );

  service.interceptors.response.use(
    (response) => {
      const config = response.config;
      if (config.customLoading !== false) {
        closeLoading();
      }
      const res = response.data;
     
      if (res.code === 200) {
        // 业务成功：直接返回 data 字段（与原逻辑保持一致）
        return res.data;
      }

      // 业务层 401：后端以 HTTP 200 + body.code=401 返回（token 失效）
      // 不在这里跳转/刷新，统一交给 error 拦截器或调用方处理；这里仅 reject
      if (res.code === 401) {
        const errMsg = res.message || res.msg || '登录已过期';
        console.log('[AuthRedirect] 登录已过期：', errMsg);
        if (config.customErrorMsg !== false) {
          showError(errMsg);
        }
        return Promise.reject(res);
      }

      // 业务层 403：权限不足（与 HTTP 403 同义）—— 不刷新 token，不跳转登录页
      // 之前用 window.href（错误拼写，应为 window.location.href）跳转 index.html 是错的：
      // 权限不足 ≠ 未登录，跳登录页会让用户困惑
      if (res.code === 403) {
        const errMsg = res.message || res.msg || '无权限访问该资源';
        if (config.customErrorMsg !== false) {
          showError(errMsg);
        }
        return Promise.reject(res);
      }

      // 其他业务错误码
      const errMsg = res.message || res.msg || '操作失败';
      if (config.customErrorMsg !== false) {
        showError(errMsg);
      }
      return Promise.reject(res);
    },
    async (error) => {
      closeLoading();
      const config = error.config || {};

      // ① 超时
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        const msg = '请求超时，请稍后重试';
        if (config.customErrorMsg !== false) {
          showError(msg);
        }
        return Promise.reject(msg);
      }

      // ② 网络不可达
      if (!error.response) {
        const msg = '网络连接失败，请检查网络';
        if (config.customErrorMsg !== false) {
          showError(msg);
        }
        return Promise.reject(msg);
      }

      const status = error.response.status;
      const originalRequest = config;

      // ====== 关键修复：只对 401 刷新 token，403 不刷新 ======
      // 原因：403 表示"已登录但权限不足"，刷新 token 后用户角色/权限不变，
      //       重试请求还是 403，又会触发刷新 → 无限循环
      //       401 才表示"未登录或 token 失效"，需要刷新
      //
      // ====== 关键修复：originalRequest._retry 标记 ======
      // 已重试过的请求若再次 401，不再刷新，避免嵌套循环
      if (status === 401 && !originalRequest._retry) {

         console.log('[AuthRedirect] 401 刷新 token：', errMsg);
        originalRequest._retry = true; // 标记：本请求已尝试过刷新重试

        // ②-a 已有刷新在进行：排队等待，刷新完成后用新 token 重发
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            // 修复：队列项需同时保存 resolve 和 reject，
            // 否则刷新失败时排队的 Promise 永远 pending
            requestQueue.push({
              resolve,
              reject,
              fn: (newToken) => {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                service(originalRequest).then(resolve).catch(reject);
              }
            });
          });
        }

        // ②-b 没有刷新在进行：自己发起刷新
        isRefreshing = true;
        try {
          const refreshRes = await getNewToken();
          // 后端响应：HTTP 200 + body.code === 200 才算刷新成功
          console.log("refresh token",refreshRes);
          if (
            refreshRes &&
            refreshRes.status === 200 &&
            refreshRes.data &&
            refreshRes.data.code === 200
          ) {
            const result = refreshRes.data;
            const newToken = result.data && result.data.token;
            const newRefreshToken = result.data && result.data.refreshToken;
            if (!newToken) {
              throw new Error('刷新接口未返回 token');
            }
            localStorage.setItem('token', newToken);
            if (newRefreshToken) {
              localStorage.setItem('refreshToken', newRefreshToken);
            }
            originalRequest.headers.Authorization = `Bearer ${newToken}`;

            // 唤醒所有排队请求
            requestQueue.forEach((item) => item.fn(newToken));
            requestQueue = [];
            isRefreshing = false;

            // 重试原请求
            return service(originalRequest);
          }
          // 刷新接口返回非 200 业务码：当作刷新失败
          throw new Error(
            (refreshRes && refreshRes.data && (refreshRes.data.message || refreshRes.data.msg)) ||
            '刷新凭证失败'
          );
        } catch (refreshErr) {
          // ③ 刷新失败：清登录态、唤醒排队请求 reject、跳登录页
          // 兼容两种失败形态：
          //   a) 后端返回 HTTP 200 + body.code=401（Result.unauthorized）→ 我们手动 throw Error(message)
          //      此时 refreshErr.message 含后端 message，如 "刷新凭证已失效，请重新登录"
          //   b) 后端返回 HTTP 4xx/5xx（异常/Spring Security 拦截）→ axios 自动 reject
          //      此时 refreshErr 是 axios error，真实错误在 refreshErr.response.data.message
          let backendMsg = '登录已过期，请重新登录';
          if (refreshErr) {
            if (typeof refreshErr === 'string') {
              backendMsg = refreshErr;
            } else if (refreshErr.response && refreshErr.response.data) {
              // axios error：从响应体取后端 message
              const r = refreshErr.response.data;
              backendMsg = (r && (r.message || r.msg)) || backendMsg;
            } else if (refreshErr.message) {
              // 手动 throw new Error(后端message) 的情况
              backendMsg = refreshErr.message;
            }
          }
          console.warn('[RefreshToken] 刷新失败，最终提示用户：', backendMsg, '原始 error=', refreshErr);

          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('currentUser');
          // 修复：清空队列时也 reject 排队的请求，避免它们永久 pending
          requestQueue.forEach((item) => item.reject(refreshErr));
          requestQueue = [];
          isRefreshing = false;
          showError(backendMsg);
          // 关键：跳登录页之前保存当前页面 URL，登录成功后回跳
          console.log('%c[AuthRedirect] 调用点 A：HTTP 401 刷新 token 失败，准备 saveLoginRedirect 后跳登录',
            'color:#dc2626;font-weight:bold;');
          saveLoginRedirect('401');
          // 延迟跳转，让当前 reject 链先走完
          setTimeout(() => {
            console.log('[AuthRedirect] 调用点 A：500ms 后开始跳转 ./index.html');
            location.href = './index.html';
          }, 500);
          return Promise.reject(refreshErr);
        }
        // 注意：此处 finally 中不再设置 isRefreshing=false，
        // 因为 try/catch 内已经显式管理；且原 finally 会在 return 之后执行导致状态错乱
      }

      // ④ 非 401 / 已重试过的 401 / 403 等：按状态码提示，不再刷新
      let errMsg = '';
      switch (status) {
        case 401:
          // 已重试过仍 401，或刷新失败：清登录态并跳转
          errMsg = '登录已过期，请重新登录';
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('currentUser');
          // 关键：跳登录页之前保存当前页面 URL，登录成功后回跳
          console.log('%c[AuthRedirect] 调用点 B：已重试过仍 401，准备 saveLoginRedirect 后跳登录',
            'color:#dc2626;font-weight:bold;');
          saveLoginRedirect('401');
          console.log('[AuthRedirect] 调用点 B：登录已过期：', errMsg);
          setTimeout(() => {
            console.log('[AuthRedirect] 调用点 B：500ms 后开始跳转 ./index.html');
            location.href = './index.html';
          }, 500);
          break;
        case 403:
          // 权限不足：只提示，不刷新，不跳转（保留当前页面上下文）
          errMsg = '无权限访问该资源';
          break;
        case 404:
          errMsg = '接口地址不存在';
          break;
        case 500:
          errMsg = '服务器内部错误';
          break;
        default:
          errMsg = `请求错误：${status}`;
      }
      if (config.customErrorMsg !== false) {
        showError(errMsg);
      }
      return Promise.reject(error);
    }
  );

  window.request = service;
})();

/*
在刷新token时出现循环：更新、删除、插入一直在重复，说明在对user_refresh_token表的 CURD 操作时，前端/后端产生了意料之外的递归调用或死循环。

常见原因及排查步骤如下：

1. 后端 refreshToken 接口实现存在问题：
   - 若 refreshToken 的接口在数据库操作（如 insert/update/delete user_refresh_token）时异常（如抛出异常未捕获），前端收到 401 或异常码后，重发刷新 token 请求，导致死循环。
   - 或者刷新 token 的请求也被拦截器拦下，再次自动刷新，导致循环。

2. 前端拦截器逻辑错误导致循环刷新：
   - 如果前端的 axios 拦截器里，refreshToken 的请求响应被同一拦截器再次捕获（即 refreshToken 的接口本身也被自动附带 token、自动刷新），会引发无限递归。
   - 应该为 refreshToken 请求单独设置 instance 或排除它不进入全局 response 拦截。

3. 数据库 user_refresh_token 插入或更新逻辑错误：
   - 业务层未能正常 upsert，触发插入、更新、删除的异常组合。
   - 检查是否对同一用户的 refreshToken 进行了多余的 insert/delete。

【解决建议：】

A. 前端：
   - 确认 refreshToken 请求不会再被拦截器进入自动刷新逻辑，可以通过为刷新专门创建一个 axios 实例，在拦截器加判断（如 config.url），或在请求头加特殊标识跳过。

B. 后端：
   - 检查 refreshToken 相关的数据库操作（user_refresh_token 表）逻辑，确认不会异常抛出并导致接口反复调用；
   - 对 user_refresh_token 表采用「先查后改/插入」，避免因主键冲突、重复插入、并发更新导致异常。

C. 日志追踪：
   - 打印 token 刷新接口每一次调用的日志，确保没有多次触发。

建议先检查 axios 拦截器逻辑以及数据库 token 处理代码，判断递归调用和死循环来源，通常是刷新 token 的请求本身被重复拦截或 CURD 异常未妥善处理。
*/