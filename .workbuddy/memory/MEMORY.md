# 项目长期记忆（2026-11-24 精简；详细历史见 .workbuddy/memory/2026-11-*.md）

## 协作
- 连续失败 2~3 次即问用户；先证据后修；写完直接交付、跳过自测但要编译验证；不可逆操作拒绝。
- 输出首行【YYYY-MM-DD HH:mm】，末尾 🔔🔔🔔。
- 改既有校验先摆事实+选项让用户拍板；用户库数据只诊断不清理。

## 守卫 17 道（npm run check:<name>，逃生 SKIP_<大写>）
core.hooksPath=tools/git-hooks。shared-sync/authz/cascade/ddl-align/tz/global-collide/scheduler/actuator/tenant-xt/secret-env/result-contract/date-contract/status-contract/itest-sut/bridge-exports/endpoints/admin-self-lock/headers。
- 反向测试必须证真会红、结尾 process.exit(failed?1:0)；禁 spawnSync；CRLF 归一（core.autocrlf=true）再 includes，备份按字节还原。
- 免登录白名单四处缺一失效：SecurityConfig / JwtFilter.WHITELIST_PATHS / check-authz PERMIT_ALL / WebMvcConfig.EXCLUDE_PATTERNS。
- 端点避开 /api/v1/message；新 /api/v1/user/* 必须进 AuthzRules。

## 契约
Result.code=int；fail 白名单 {200,400,401,403,404,409,500,1001}；401/403 走过滤器层。分页=PageResult{rows,total}。LocalDateTime 序列 format(fmt)+"Z"。

## 前端铁律
- 顶层 IIFE；onclick 用 window.*；同文件禁同名函数。
- shared/apiPaths.js + shared/domain/*.js 四步同步：sync-miniprogram-shared → check-shared-sync → gen-shared-bridge → frontend/build.js。
- 请求必须自带 /api/v1（axios 对 / 开头 url 忽略 baseURL）。
- 构建用 CODEBUDDY_SAFE_DELETE_ENABLED=0 node frontend/build.js。
- 三服务反代：booking 8081 / message 8090 / classroom 8092；分流清单 doc-develop/90-tools/dev-proxy.js；API location 加 ^~。
- 密钥 env：AES_KEY / HMAC_KEY（不是 CRYPTO_AESKEY）。
- dist 是 terser 压缩产物，grep 字符串字面量/DOM id。
- Permissions-Policy：camera=() 空 allowlist 连页面自身都禁；自签 HTTPS 音视频异常先查它。nginx add_header 覆盖式继承。

## 账户/租户
- 仅 active 可登录；禁用=frozen + /auth/kick。
- 平台保留字 platform/default 永不作经营租户；isReservedTenantCode 在 resolveTenantByCode 之前拦。
- 客户端 IP 只用 ClientIpResolver.resolve；user.name 入库加密、服务级解密。
- 复合主键实体用显式 updateByKey。

## 课堂
- 有效时长=合并间隙≤60s 的 presence 段求和，min(总分,duration)。
- 收尾唯一入口 ClassroomClosingService.closeAfterEnd；回执事务提交后发；consumption_version +1。
- 课次复合键 sid / sid~N；eventId 带 -cN。
- 七扫描器 ClassroomScheduler（池8）；掉线以 Redis 在线 key 为准。
- 「我的课堂」显隐唯一判据 /api/v1/eclassroom/config enabled（sys_tenant_eclassroom）。
- 课时扣减待拍板。

## 一码多端（2026-11-24）
- 分支 student-crossplatform（从 auto_deploy 拉出）。2 笔待推：方案文档 bbb79ab0、P0 框架 a9b73292；P1 未提交。约定 P1 完成后一起推。
- classroom-app 独立工程：原 frontend 零改动；改动只记录（FRONTEND-PATCHES.md + config/frontend-patches.js），patch.js 构建期只打 www 副本。
- 三套地址：apiOrigin / classroomApiOrigin / classroomWsOrigin；server 模式全空，local 模式填绝对地址。
- 桥接必须双保险覆盖 eclassroomConfig 存储层 + 函数层（feature-flags.js 晚加载会反向盖掉函数覆盖）。
- 风险收口：classroom-main.js:87 URL role 覆盖登录态 → FP-001；课堂页无 guardEntryPage → FP-002；start/enter 端点未进 apiPaths（仍字面量）。
- 深链：classroom.html?scheduleId=<key>；课前 classroom-prep.html?scheduleId=&mode=student。
- 网页验证：`cd classroom-app && node scripts/serve.js 8098`，浏览器开 my-classroom.html / classroom.html；默认 prod server 模式的 frontendOrigin 是占位域名，本地验证需直接开具体页或改用 dev/local 模式。

## 排障
- JDK21 路径 C:\Program Files\Eclipse Adoptium\jdk-21.0.8.9-hotspot\bin；MySQL D:\program\mysql84\bin\mysql.exe（root/123456）。
- 云托管无 K8s DNS；服务间调用用内网域名或公网域名；变量 proxy_pass 必须 resolver。
- 前端上游走运行时 env（API_UPSTREAM/MSG_UPSTREAM），不进镜像。
- check:cascade / check:secret-env 历史遗留失败，用 SKIP_。
