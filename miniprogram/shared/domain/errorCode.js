// HTTP / 业务错误码 → 统一可读性文案 + 类型判定（纯逻辑，不含 toast/showModal）
// 抽自：
//   - frontend/js/public/utility_request.js 响应拦截（res.code 200/401/403/其他）+ 错误拦截（ECONNABORTED 超时 / 无 response 网络不可达 / http 状态）
//   - frontend/js/public/api.js 的 401/403 注释段
// 消费：请求适配层 / 页面 catch 用 resolveRequestError(err).message 取友好文案（展示交给 ui 层）。
// 纯函数、零 DOM。Node 下可直接 import 做单测。
// Web 端已通过 window.ErrorCodeDomain 挂载（bridge-exports.json 登记，utility_request.js 在调）。

export const RESULT_OK = 200;

/**
 * 需要人机验证（2026-10-22 P0，登录风控频率闸）。
 *
 * 与服务端 {@code Result.CODE_NEED_CHALLENGE} 对齐，走 HTTP 200 + body.code，
 * 刻意不进 ResultHttpStatusAdvice 的 400/404/409/500 映射表——否则 axios 会把它当
 * HTTP 错误走 error 拦截器，与 401 刷新链路混在一起。
 *
 * 这里定义一次、两端共用：Web 弹 DOM 滑块、小程序弹 canvas 滑块，
 * 但"这是挑战、不是错误"这个语义只能有一个出处，否则必然出现
 * "Web 弹红字报错、小程序被 silent catch 吞掉"两种表述。
 */
export const RESULT_NEED_CHALLENGE = 1002;

/** 解析后端统一响应体 { code, message, msg, data }（即 response.data）。
 *  返回 { type, message, data, code }：
 *   - ok          code===200，data 透传
 *   - challenge   code===1002，需人机验证；data 为挑战素材（challengeId/拼图），可能为空
 *   - unauthorized code===401，message 缺省 '登录已过期'
 *   - forbidden   code===403，message 缺省 '无权限访问该资源'
 *   - biz         其它业务错误，message 缺省 '操作失败'
 *  message 优先取 message 字段，其次 msg（对齐 utility_request.js 的 res.message || res.msg）。 */
export function resolveResult(res) {
  if (!res || typeof res !== 'object') {
    return { type: 'biz', message: '响应格式异常', data: undefined, code: undefined };
  }
  const code = res.code;
  const message = res.message || res.msg || '';
  if (code === RESULT_OK) return { type: 'ok', message: '', data: res.data, code };
  if (code === RESULT_NEED_CHALLENGE) {
    return { type: 'challenge', message: message || '请完成安全验证', data: res.data, code };
  }
  if (code === 401) return { type: 'unauthorized', message: message || '登录已过期', data: undefined, code };
  if (code === 403) return { type: 'forbidden', message: message || '无权限访问该资源', data: undefined, code };
  return { type: 'biz', message: message || '操作失败', data: undefined, code };
}

/** 解析 axios / wx.request 的错误对象。
 *  返回 { type, message, status }：
 *   - timeout  错误码 ECONNABORTED 且 message 含 'timeout'
 *   - network  无 error.response（网络不可达 / 断网）
 *   - http     其它 HTTP 错误，含 response.status
 *  文案与 utility_request.js 原拦截器保持一致。 */
export function resolveRequestError(err) {
  if (!err) return { type: 'network', message: '网络连接失败，请检查网络', status: undefined };
  if (err.code === 'ECONNABORTED' && typeof err.message === 'string' && err.message.includes('timeout')) {
    return { type: 'timeout', message: '请求超时，请稍后重试', status: undefined };
  }
  if (!err.response) return { type: 'network', message: '网络连接失败，请检查网络', status: undefined };
  const status = err.response.status;
  return { type: 'http', message: '服务异常（HTTP ' + status + '）', status };
}

/** 取错误友好文案（页面 catch 直接用的便捷函数）。 */
export function errorMessage(err) {
  return resolveRequestError(err).message;
}
