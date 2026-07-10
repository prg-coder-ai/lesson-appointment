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
    // 获取当前登录者的账号account
    const cuser =  localStorage.getItem('currentUser');
    const account = cuser.getAccount('account');
    const role = cuser.getRole('role');
    /*const currentUser = {
      userId: user.userId,
      account: user.account,
      name: user.name,
      role: user.role,
      token: user.token
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
*/
    return refreshTokenAxios.post('/auth/refreshToken', { refreshToken:refreshToken,account:account,role:role });
  }

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
        "请求 URL：", config.url,
        "url参数 params：", config.params,
        "请求体 data：", config.data
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
        console.log("resp:",res.data);
        return res.data;
      }
      if(res.code == 403){
        window.href ="./index.html";

      }
      const errMsg = res.message || res.msg || '操作失败';
      if (config.customErrorMsg !== false) {
        showError(errMsg);
      }
      return Promise.reject(res);
    },
    async (error) => {
      closeLoading();
      const config = error.config || {};

      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        const msg = '请求超时，请稍后重试';
        if (config.customErrorMsg !== false) {
          showError(msg);
        }
        return Promise.reject(msg);
      }

      if (!error.response) {
        const msg = '网络连接失败，请检查网络';
        if (config.customErrorMsg !== false) {
          showError(msg);
        }
        return Promise.reject(msg);
      }

      const status = error.response.status;
      const originalRequest = config;

      if (status === 401 || status== 403) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            requestQueue.push((newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(service(originalRequest));
            });
          });
         
        }
        isRefreshing = true;
        try {
          const refreshRes = await getNewToken();
          console.log("000 getNewToken:",refreshRes.code,refreshRes.data);
          const result = refreshRes.data;
          if (result.code === 200) {
            const { token, refreshToken } = result.data;
            localStorage.setItem('token', token);
            localStorage.setItem('refreshToken', refreshToken);
            originalRequest.headers.Authorization = `Bearer ${token}`;
            requestQueue.forEach((cb) => cb(token));
            requestQueue = [];
            //isRefreshing = false;
            console.log("200 originalRequest:",originalRequest);
            return service(originalRequest);
          
          // INSERT_YOUR_CODE
          /**
           * service(originalRequest) 的含义是：
           * 用 axios 封装的 service 实例，重新发起原始请求 originalRequest。
           * 即：当 token 刷新成功后，把最初因 token 失效返回 401/403 的请求（originalRequest），
           * 再次用新 token 放入 headers 里，自动重发。返回的是新的 Promise（请求结果）。
           *
           * 这样用户无感知地完成了 token 自动更新，操作不中断。
           *
           * 例如：
           * service(originalRequest) 相当于 axios(originalRequest)，只是这里 service 是 axios 封装对象，可以带一些默认配置。
           */
 
          } else { //直接去重新登陆
            showError('登录已过期，请重新登录q');
            location.href = './index.html';
            return Promise.reject(refreshErr); 
          }
         // throw new Error(result.message || result.msg || '刷新凭证失败');
        } catch (refreshErr) { 
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('currentUser');
          requestQueue = [];
          showError('登录已过期，请重新登录');
          location.href = './index.html';
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
      /**
       * 代码解释：
       * 
       * 上述代码片段是前端 axios 拦截器的 response 错误处理部分，主要关注 401 和 403 错误码（未授权和无权限）。
       * 
       * 1. 当请求返回 401 或 403 时，判断当前是否已经在执行刷新 token 的操作（isRefreshing）。
       *    - 如果正在刷新，后续相同错误请求进入队列，等 token 刷新完再重新发请求。
       *    - 如果没有刷新，则调用 getNewToken()（发起 /auth/refreshToken 请求），拿到新 token 后本地存储，并重放所有等待中的请求。
       *    - 若刷新失败，则清空 token 和刷新队列，跳转回登录页。
       * 2. 其他错误（404、500 等）进行友好提示。
       * 
       * 循环可能性分析：
       * - 如果 /auth/refreshToken 这个请求也被同样的拦截器处理，并它返回 401/403，再次触发刷新，则会陷入死循环（即刷新接口也自动带 token 且因无效 token 被拦截）。
       * - 但此代码中 getNewToken() 用的是 refreshTokenAxios 实例，理论上 refreshTokenAxios 没有挂全局拦截器，所以不会对 refreshToken 的调用再次进入自动刷新逻辑——因此**前端此处避免了循环**。
       * 
       * 总结：只要 refreshTokenAxios 没有挂载同样拦截，且 /auth/refreshToken API 逻辑不异常递归抛 401/403，前端这里不会进入逻辑死循环。
       * 遇到循环多因 refreshToken 请求也被拦截/或后端实现问题导致反复 401。
       */


      let errMsg = '';
      switch (status) {
        case 403:
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