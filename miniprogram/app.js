// 副作用引入共享核心（barrel）与 utils 聚合出口，使整棵 shared/、utils/ 依赖树进入编译依赖图，
// 避免微信「主包内不应存在未使用的js文件」检查把镜像进来但尚未逐个引用的共享模块误报为未使用。
import './shared/index.js';
import './utils/index.js';
import { setRuntimeConfig } from './shared/constants.js';

App({
  globalData: {
    // TODO: 上线前替换为真实 HTTPS 域名（需在微信公众平台配置 request 合法域名）
    apiBase: 'http://152.136.254.127:8081',
    //'https://api.example.com'
    msgBase: 'http://152.136.254.127:8090',
    //,'https://msg.example.com
    // 登录失效回调：由页面层注入（如跳回登录页）
    onAuthFail: null
  },
  onLaunch() {
    setRuntimeConfig({ apiBase: this.globalData.apiBase, msgBase: this.globalData.msgBase });
  }
});
