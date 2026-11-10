// 小程序上游 API 地址·按运行环境自动切换（方案一）
//
// 依据 wx.getAccountInfoSync().miniProgram.envVersion 区分三种运行环境：
//   develop —— 微信开发者工具 / 本地联调
//   trial   —— 体验版（上传后设置的体验版）
//   release —— 正式发布版
//
// ★ 域名约束（历史坑，见 app.js 注释）：
//   - 云托管公网入口只能走 443，不能带 :8081/:8090（网关不映射容器端口，
//     带上会 net::ERR_CONNECTION_TIMED_OUT）
//   - 微信 request 合法域名只接受 https 且不带端口
//   - 每个 base 的域名都要加进 mp.weixin.qq.com「request 合法域名」白名单
//
// ★ 本地联调：develop 走 http://127.0.0.1 仅在开发者工具里生效，
//   且需勾选「详情 → 本地设置 → 不校验合法域名」；真机预览请改 trial 或云托管地址。
const ENV = {
  develop: {
    apiBase: 'http://127.0.0.1:8081',   // 业务端 api（本地 Spring Boot）
    msgBase: 'http://127.0.0.1:8090',   // message-service（本地）
    webBase: ''                         // 本地无前端站点，promo 二维码会走兜底文案
  },
  trial: {
    apiBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com',
    msgBase: 'https://message-service-329614-8-1475810246.sh.run.tcloudbase.com',
    webBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com'
  },
  release: {
    // 正式版与体验版当前同源；若正式环境单独部署，在此替换为正式域名
    apiBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com',
    msgBase: 'https://message-service-329614-8-1475810246.sh.run.tcloudbase.com',
    webBase: 'https://api-329614-8-1475810246.sh.run.tcloudbase.com'
  }
};

// 兜底策略：envVersion 取不到或值异常（如未来新增枚举）一律回落 release，
// 保证任何环境下都有可用的上游地址，绝不返回 undefined 让请求打空。
export function resolveEnv() {
  let key = 'release';
  try {
    const info = wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.envVersion;
    if (v && ENV[v]) key = v;
  } catch (e) {
    // 低版本基础库可能无 getAccountInfoSync，静默回落 release
  }
  return Object.assign({}, ENV[key]);
}
