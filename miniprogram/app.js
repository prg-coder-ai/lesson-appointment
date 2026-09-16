import { setRuntimeConfig } from './shared/constants.js';

App({
  globalData: {
    // TODO: 上线前替换为真实 HTTPS 域名（需在微信公众平台配置 request 合法域名）
    apiBase: 'https://api.example.com',
    msgBase: 'https://msg.example.com',
    // 登录失效回调：由页面层注入（如跳回登录页）
    onAuthFail: null
  },
  onLaunch() {
    setRuntimeConfig({ apiBase: this.globalData.apiBase, msgBase: this.globalData.msgBase });
  }
});
