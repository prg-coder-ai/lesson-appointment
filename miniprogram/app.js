// 副作用引入共享核心（barrel）与 utils 聚合出口，使整棵 shared/、utils/ 依赖树进入编译依赖图，
// 避免微信「主包内不应存在未使用的js文件」检查把镜像进来但尚未逐个引用的共享模块误报为未使用。
import './shared/index.js';
import './utils/index.js';
import { setRuntimeConfig } from './shared/constants.js';
import { resolveEnv } from './config/env.js';

// 远程配置：放在前端站点根目录（nginx expires -1 强制回源，见 default.conf.template）
const REMOTE_CONFIG_PATH = '/app-config.json';
// 调试覆盖的 storage key。开发者工具 console 里执行：
//   wx.setStorageSync('upstream_override', { apiBase: 'http://127.0.0.1:8081', msgBase: '...' })
// 即可在不改动代码的情况下指向任意后端；删除 key（wx.removeStorageSync）即恢复。
const OVERRIDE_KEY = 'upstream_override';
// 只接受这三个键，远程/覆盖配置里的其它字段一律忽略（防配置文件夹带脏数据）
const CONFIG_KEYS = ['apiBase', 'msgBase', 'webBase'];

App({
  // 上游地址不再在此硬编码：onLaunch 按三层优先级注入（见 config/env.js 顶部说明）。
  // 此处仅保留结构与配置无关字段。
  globalData: {
    apiBase: '',
    msgBase: '',
    webBase: '',
    // 登录失效回调：由页面层注入（如跳回登录页）
    onAuthFail: null
  },

  onLaunch() {
    // ① env.js 内置默认值先注入：远程配置尚未到达前，任何请求都有地址可用（弱网不阻塞启动）
    this.applyConfig(resolveEnv());

    // ② storage 调试覆盖：命中则跳过远程拉取（联调时不被线上配置干扰）
    const override = this.readOverride();
    if (override) {
      this.applyConfig(override);
      return;
    }

    // ③ 远程配置：异步拉取，成功后覆盖 globalData。request.js 每次请求实时读
    //    globalData，故已发出的请求不受影响，后续请求自动切到新地址。
    this.fetchRemoteConfig();
  },

  applyConfig(cfg) {
    CONFIG_KEYS.forEach((k) => {
      if (cfg && typeof cfg[k] === 'string' && cfg[k].trim()) {
        this.globalData[k] = cfg[k].trim();
      }
    });
    setRuntimeConfig({ apiBase: this.globalData.apiBase, msgBase: this.globalData.msgBase });
  },

  readOverride() {
    try {
      const v = wx.getStorageSync(OVERRIDE_KEY);
      return (v && typeof v === 'object') ? v : null;
    } catch (e) {
      return null;
    }
  },

  fetchRemoteConfig() {
    const base = this.globalData.webBase;
    // 本地联调（develop 无 webBase）或历史会话无引导地址：跳过，保持 env.js 默认值
    if (!base) return;
    wx.request({
      url: base + REMOTE_CONFIG_PATH,
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        if (res.statusCode === 200 && res.data && typeof res.data === 'object' && res.data.apiBase) {
          this.applyConfig(res.data);
        }
        // 结构不合法（缺 apiBase）视为拉取失败，静默保留兜底值
      }
      // fail/超时：静默兜底——远程配置只是增强项，绝不能因它阻塞登录
    });
  }
});
