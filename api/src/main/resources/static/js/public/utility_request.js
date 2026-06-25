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

  function getNewToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    return refreshTokenAxios.post('/auth/refreshToken', { refreshToken });
  }

  const service = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json;charset=utf-8'
    }
  });

  service.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
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
        return res.data;
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

      if (status === 401) {
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
          const result = refreshRes.data;
          if (result.code === 200) {
            const { token, refreshToken } = result.data;
            localStorage.setItem('token', token);
            localStorage.setItem('refreshToken', refreshToken);
            originalRequest.headers.Authorization = `Bearer ${token}`;
            requestQueue.forEach((cb) => cb(token));
            requestQueue = [];
            return service(originalRequest);
          }
          throw new Error(result.message || result.msg || '刷新凭证失败');
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
