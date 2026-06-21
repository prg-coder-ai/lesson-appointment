import axios from 'axios'
import { ElMessage, ElLoading } from 'element-plus'

let loadingInstance = null
let loadingCount = 0
let isRefreshing = false
let requestQueue = []

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
})

const startLoading = () => {
  loadingCount++
  if (loadingCount === 1) {
    loadingInstance = ElLoading.service({
      lock: true,
      text: '加载中...',
      background: 'rgba(0,0,0.1)'
    })
  }
}
const closeLoading = () => {
  loadingCount--
  if (loadingCount <= 0) {
    loadingInstance?.close()
    loadingCount = 0
  }
}

// 独立刷新token实例，不走拦截器
const refreshTokenAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000
})
function getNewToken() {
  const refreshToken = localStorage.getItem('refreshToken')
  return refreshTokenAxios.post('/auth/refreshToken', { refreshToken })
}


// 请求拦截
service.interceptors.request.use(
(config) => {
const token = localStorage.getItem('token')
if (token) config.headers.Authorization = `Bearer ${token}`
if (config.customLoading !== false) startLoading()
return config
},
error => {
closeLoading()
ElMessage.error('请求发起失败')
return Promise.reject(error)
}
)

// 响应拦截
service.interceptors.response.use(
response => {
const config = response.config
if (config.customLoading !== false) closeLoading()
const res = response.data
if (res.code === 200) return res.data
if (config.customErrorMsg !== false) ElMessage.error(res.msg || '操作失败')
return Promise.reject(res)
},
async error => {
closeLoading()
const config = error.config || {}
// 超时
if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
  const msg = '请求超时，请稍后重试'
  if (config.customErrorMsg !== false) ElMessage.error(msg)
  return Promise.reject(msg)
}
// 无网络
if (!error.response) {
  const msg = '网络连接失败，请检查网络'
  if (config.customErrorMsg !== false) ElMessage.error(msg)
  return Promise.reject(msg)
}

const status = error.response.status
const originalRequest = config
// 401 Token过期 自动刷新逻辑
if (status === 401) {
  if (isRefreshing) {
    return new Promise(resolve => {
      requestQueue.push((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        resolve(service(originalRequest))
      })
    })
  }
  isRefreshing = true
  try {
    const refreshRes = await getNewToken()
    const result = refreshRes.data
    if (result.code === 200) {
      const { token, refreshToken } = result.data
      localStorage.setItem('token', token)
      localStorage.setItem('refreshToken', refreshToken)
      originalRequest.headers.Authorization = `Bearer ${token}`
      requestQueue.forEach(cb => cb(token))
      requestQueue = []
      return service(originalRequest)
    } else {
      throw new Error(result.msg)
    }
  } catch (refreshErr) {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    requestQueue = []
    ElMessage.error('登录已过期，请重新登录')
    location.href = '/login'
    return Promise.reject(refreshErr)
  } finally {
    isRefreshing = false
  }
}

// 其他HTTP错误码
let errMsg = ''
switch (status) {
  case 403: errMsg = '无权限访问该资源'; break
  case 404: errMsg = '接口地址不存在'; break
  case 500: errMsg = '服务器内部错误'; break
  default: errMsg = `请求错误：${status}`
}
if (config.customErrorMsg !== false) ElMessage.error(errMsg)
return Promise.reject(error)
}
)

export default service;