// 全局工具方法统一入口
// 现有适配层在 core/（小程序端 wx 封装），跨端公共逻辑在 shared/。
// 此处按需再导出，供页面统一从 utils 引入，减少各页面对 core/shared 的直接耦合。

// 存储 / 登录态
export {
  storage,
  getSession,
  setSession,
  clearSession,
  getToken
} from '../core/storage.js';

// 文本格式化
export {
  escapeHtml,
  escapeAttr,
  maskPhone,
  maskEmail
} from '../shared/format.js';
