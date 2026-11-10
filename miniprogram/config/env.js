// 小程序上游地址·三层配置机制（方案一 + 方案二）
//
// 优先级（app.js onLaunch 依序执行）：
//   ① storage 调试覆盖   —— wx.setStorageSync('upstream_override', {...})，仅联调用
//   ② 远程配置           —— GET {webBase}/app-config.json，后端换域名时免重新发版
//   ③ 本文件内置默认值   —— 远程拉取失败（弱网/站点未部署）时的兜底，保证可登录
//
// envVersion 依据 wx.getAccountInfoSync().miniProgram.envVersion：
//   develop —— 微信开发者工具 / 本地联调；trial —— 体验版；release —— 正式版
//
// ★ 域名约束（历史坑）：
//   - 云托管公网入口只能走 443，不能带 :8081/:8090（网关不映射容器端口）
//   - 微信 request 合法域名只接受 https 且不带端口
//   - webBase 域名必须加入「request 合法域名」白名单（方案二起小程序会真的向它发请求）
//
// ★ 远程配置文件：前端站点根目录 app-config.json（cloudBased/frontend/dist/），
//   nginx 对它 expires -1 强制回源校验。修改后端地址只需更新该文件并重新部署前端。
const ENV = {
  develop: {
    apiBase: 'http://127.0.0.1:8081',   // 业务端 api（本地 Spring Boot）
    msgBase: 'http://127.0.0.1:8090',   // message-service（本地）
    webBase: ''                         // 本地无前端站点 → 跳过远程配置，直接用上面的值 http://152.136.254.127:8090
  },
  rmt: { //使用服务器地址 测试
    apiBase: 'http://152.136.254.127:8081',   // 业务端 api（本地 Spring Boot）
    msgBase: 'http://152.136.254.127:8090',   // message-service（本地）
    webBase: ''                         // 本地无前端站点 → 跳过远程配置，直接用上面的值 http://152.136.254.127:8090
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
// 保证任何环境下都有可用的引导/兜底地址，绝不返回 undefined 让请求打空。
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
