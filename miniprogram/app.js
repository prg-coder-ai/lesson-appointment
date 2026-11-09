// 副作用引入共享核心（barrel）与 utils 聚合出口，使整棵 shared/、utils/ 依赖树进入编译依赖图，
// 避免微信「主包内不应存在未使用的js文件」检查把镜像进来但尚未逐个引用的共享模块误报为未使用。
import './shared/index.js';
import './utils/index.js';
import { setRuntimeConfig } from './shared/constants.js';

App({
  globalData: {
    // ★ 云托管公网入口只能走 443，**不能带 :8081**。
    //   8081 是容器内端口（Dockerfile EXPOSE / container.config.json containerPort），
    //   云托管网关不对外映射它 —— 带上会得到 net::ERR_CONNECTION_TIMED_OUT：
    //   网关直接丢弃目标端口不是 443 的 SYN，所以表现是"一直转圈到超时"，而不是立刻 refused。
    // ★ 微信小程序只接受 https；request 合法域名不能带端口，去掉 :8081 才能加进白名单。
    //   旧值（云托管之前直连 ECS）：'http://152.136.254.127:8081'
    apiBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com',

    // TODO: 消息服务是**独立云托管服务**，域名与 api 不同，需按实际服务详情页填写：
    //   https://message-service-<envid>.sh.run.tcloudbase.com   （同样不能带 :8090）
    //   未配置时消息中心不可用，但不影响登录。
    msgBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com:8090',

    // TODO: 前端站点域名（promo 页二维码用），部署 web 服务后填 https 域名
    webBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com',
    // 登录失效回调：由页面层注入（如跳回登录页）
    onAuthFail: null
  },
  onLaunch() {
    setRuntimeConfig({ apiBase: this.globalData.apiBase, msgBase: this.globalData.msgBase });
  }
});
