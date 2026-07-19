# Axios 全局统一封装（开箱即用，Vue/原生JS通用）

# Axios 全局统一封装（开箱即用，Vue / 原生 JS 通用）

功能清单：

1. 请求拦截器自动携带 Token（localStorage）

2. 全局 Loading 加载状态（封装开关）

3. 请求超时统一处理

4. 响应拦截统一解析后端标准 `Result` 结构

5. 全局错误统一捕获：401/403/500 / 网络超时 / 未知错误弹窗提示

6. 支持单独接口关闭 loading、单独关闭错误提示

7. 可直接复制到项目使用

## 1\. 文件：src/utils/request\.js

```javascript
import axios from 'axios'
// 弹窗组件（Element Plus / Element UI / 自定义弹窗自行替换）
import { ElMessage, ElLoading } from 'element-plus'

// 全局 loading 实例
let loadingInstance = null
// loading 计数器（并发请求不重复显示/关闭）
let loadingCount = 0

// 后端标准返回结构统一约束
/*
{
  code: 200,
  data: {},
  msg: '操作成功'
}
code != 200 代表业务失败
*/

// 创建 axios 实例
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, // 环境变量接口前缀
  timeout: 15000, // 15秒超时
  headers: {
    'Content-Type': 'application/json;charset=utf-8'
  }
})

/**
 * 开启全局 loading
 */
const startLoading = () => {
  loadingCount++
  if (loadingCount === 1) {
    loadingInstance = ElLoading.service({
      lock: true,
      text: '加载中...',
      background: 'rgba(0, 0, 0, 0.1)'
    })
  }
}

/**
 * 关闭全局 loading
 */
const closeLoading = () => {
  loadingCount--
  if (loadingCount <= 0) {
    loadingInstance?.close()
    loadingCount = 0
  }
}

// ===================== 请求拦截器 =====================
service.interceptors.request.use(
  (config) => {
    // 1. 自动携带 token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 2. 默认开启loading，可在接口配置 customLoading: false 关闭
    if (config.customLoading !== false) {
      startLoading()
    }

    return config
  },
  (error) => {
    closeLoading()
    ElMessage.error('请求发起失败')
    return Promise.reject(error)
  }
)

// ===================== 响应拦截器 =====================
service.interceptors.response.use(
  (response) => {
    const config = response.config
    // 关闭loading
    if (config.customLoading !== false) {
      closeLoading()
    }

    // 取出后端标准返回体
    const res = response.data

    // 业务码 200 = 成功，直接返回 data
    if (res.code === 200) {
      return res.data
    }

    // 业务失败统一提示（可配置 customErrorMsg: false 关闭弹窗）
    if (config.customErrorMsg !== false) {
      ElMessage.error(res.msg || '操作失败')
    }
    // 抛出错误，接口catch捕获
    return Promise.reject(res)
  },
  (error) => {
    // 请求异常，关闭loading
    closeLoading()
    const config = error.config || {}

    // 超时单独处理
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

    // HTTP 状态码处理
    const status = error.response.status
    let errMsg = ''
    switch (status) {
      case 401:
        errMsg = '登录已失效，请重新登录'
        localStorage.removeItem('token')
        // 跳转登录页
        location.href = '/login'
        break
      case 403:
        errMsg = '无权限访问该资源'
        break
      case 404:
        errMsg = '接口地址不存在'
        break
      case 500:
        errMsg = '服务器内部错误'
        break
      default:
        errMsg = `请求错误：${status}`
    }

    if (config.customErrorMsg !== false) {
      ElMessage.error(errMsg)
    }
    return Promise.reject(error)
  }
)

export default service
```

## 2\. 环境变量 \.env\.development

```env
VITE_API_BASE_URL = "/api"
```

## 3\. API 统一管理示例 src/api/schedule\.js

```javascript
import request from '@/utils/request'

/**
 * 生成课程排期
 * @param {Object} data 排期表单
 */
export function generateSchedule(data) {
  return request({
    url: '/schedule/generate',
    method: 'post',
    data
    // customLoading: false 不显示加载动画
    // customErrorMsg: false 不自动弹出错误提示
  })
}

/**
 * 获取排期列表（GET参数用params）
 */
export function getScheduleList(courseId) {
  return request({
    url: '/schedule/list',
    method: 'get',
    params: { courseId }
  })
}

/**
 * 删除排期
 */
export function delSchedule(id) {
  return request({
    url: `/schedule/${id}`,
    method: 'delete'
  })
}
```

## 4\. 页面组件调用示例

```javascript
import { generateSchedule } from '@/api/schedule'

// 提交排期表单
async function submitForm() {
  const form = {
    startDate: '2026-06-10',
    startTime: '10:00',
    repeatType: 'week',
    repeatDays: [1, 3, 5],
    endDate: '2026-07-10',
    timeZone: 'Asia/Shanghai'
  }
  try {
    const list = await generateSchedule(form)
    console.log('排期结果', list)
    ElMessage.success('生成成功')
  } catch (err) {
    // 业务错误已全局弹窗，此处可做额外逻辑
    console.error('生成失败', err)
  }
}
```

# 核心功能说明

## 1\. Token 自动携带

- 从 `localStorage.token` 读取

- 请求头自动添加 `Authorization: Bearer xxx`

- 401 自动清 token、跳转登录

## 2\. 全局 Loading

- 默认所有接口自动弹出加载遮罩

- 并发请求计数，不会闪烁重复弹窗

- 单个接口关闭 loading：`customLoading: false`

```js
request({
  url: '/xxx',
  customLoading: false
})
```

## 3\. 全局错误统一处理

- 网络超时、断网、401/403/404/500 统一文案弹窗

- 后端业务 code \!=200 自动弹出后端返回 msg

- 单个接口关闭自动错误弹窗：`customErrorMsg: false`

## 4\. 超时统一拦截

固定 15 秒超时，捕获 `ECONNABORTED` 提示超时文案

## 5\. 后端 Result 结构自动解析

后端返回格式标准：

```json
{
  "code": 200,
  "data": [],
  "msg": "成功"
}
```

封装后接口直接拿到 `data`，无需每次 `.data.data`；业务异常直接进入 catch。

# 适配改造说明（非 Element 项目）

1. 替换 `ElMessage` / `ElLoading` 为项目自有弹窗 / 加载组件

2. 存储 token 若用 pinia/vuex，替换 localStorage 读取逻辑

3. 后端 code 非 200 为成功：修改响应拦截判断 `res.code === 200`

4. token 头部不是 Bearer：修改 `headers.Authorization` 拼接规则

> （注：文档部分内容可能由 AI 生成）
