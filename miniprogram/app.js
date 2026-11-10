// 副作用引入共享核心（barrel）与 utils 聚合出口，使整棵 shared/、utils/ 依赖树进入编译依赖图，
// 避免微信「主包内不应存在未使用的js文件」检查把镜像进来但尚未逐个引用的共享模块误报为未使用。
import './shared/index.js';
import './utils/index.js';
import { setRuntimeConfig } from './shared/constants.js';
import { resolveEnv } from './config/env.js';

App({
  // 上游地址不再在此硬编码：onLaunch 时按 envVersion 从 config/env.js 注入。
  // 此处仅保留结构与非地址类字段（见 config/env.js 顶部注释了解域名约束）。
  globalData: {
    apiBase: '',
    msgBase: '',
    webBase: '',
    // 登录失效回调：由页面层注入（如跳回登录页）
    onAuthFail: null
  },
  onLaunch() {
    const cfg = resolveEnv();
    Object.assign(this.globalData, cfg);
    setRuntimeConfig({ apiBase: cfg.apiBase, msgBase: cfg.msgBase });
  }
});
