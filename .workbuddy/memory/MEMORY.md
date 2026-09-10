# 项目长期记忆

## 协作偏好
- **遇到多次尝试仍失败时，停下来询问用户，不要反复重试死磕**（2026-08-30，用户明确提出）。一般 2~3 次仍失败即应汇报现状并给出选项。

## 项目背景
- 单租户 → 多租户（SaaS）迁移项目，位于 `api/` 目录
- 技术栈：Spring Boot 3.3.5 + Java 17 + MyBatis-Plus，数据库 lesson_appointment
- Maven 3.9.11 安装在 `C:\Program Files\apache-maven-3.9.11`，Git Bash 下须直接调 `mvn.cmd`
- 本机 target 目录偶发被残留 java.exe 进程锁定（杀毒/IDEA/中断的 Maven 进程）

## 环境备忘
- Windows 上 Bash 管道与 Maven 输出捕获不稳定，可用 `*> 文件` 重定向或 PowerShell 原生调用

## 术语表设计（2026-09-02 定稿，待工作区任务完成后开工）
- 目标：行业专业词汇表 sys_term，按行业切换菜单/标签词汇；平台维护全系统词，租户可添加/自定义，显示以租户词优先
- 单表三级作用域，industry_id + tenant_id 用 0 哨兵（NULL 唯一键不生效 + 契合 tenant_id=0=平台语义）：
  - (0,0)=平台词；(行业id,0)=行业词；(租户id, 冗余行业id)=租户词
  - 唯一键 uk_scope_key(term_key, industry_id, tenant_id)；索引 idx_tenant / idx_industry
  - 字段：id / term_key(编码,如 course) / term_name(显示词) / term_type(label|menu|button|tip,先只做label) / industry_id / tenant_id / sort_order / status / remark / create_time / update_time
  - 解析优先级：租户词 > 行业词 > 平台词，逐级回退，最终前端硬编码兜底
- 接口：GET /term/map（当前租户合并词表 key→name）、GET /term/list（平台/行业管理）、GET /term/tenant/list、POST /term、PUT /term/{id}、POST /term/{id}/status、DELETE /term/{id}、POST /term/copy（行业词批量复制，新行业上线从已有行业拷）
- 待拍板：①租户新增词条是否限行业现有 key（倾向不限，可发明新 key）②term_type 先只做 label ③/term/map 租户维度缓存 5 分钟或改词失效

## 前端构建与部署（2026-09-07 落地）
- `frontend/` 为 vanilla 业务前端源码；standalone `frontend/pom.xml`(packaging=pom) + frontend-maven-plugin 自动下载 Node v20.11.1/npm 10.2.4，prepare-package 阶段跑 `build.js` 产出 `frontend/dist/`（terser/clean-css/html-minifier-terser 压缩混淆，仅混淆局部变量、保留跨文件全局名）。
- 部署根 = `frontend/dist`（非源码 `frontend/`）；Nginx `root` 须指向 `dist`。`dist/`、`node_modules/`、`target/` 均被 frontend/.gitignore 忽略不入库。
- 本机系统 `mvn` 损坏，前端构建同后端须用 Maven launcher JAR 直启（unset CLASSPATH + java -classpath plexus-classworlds-2.9.0.jar）。
- 平台管理端 platform-admin-*.js 随 api jar 构建混淆：`api/build-platform.js`（仅局部变量，覆盖 target/classes/static，源码保持未混淆）+ `api/pom.xml` 的 frontend-maven-plugin 绑 prepare-package；spring-boot repackage 把混淆版打进 jar。跨文件全局名（request 等）保留。**构建命令与端到端联调实测见部署手册 2.8 节**。
- 本地开发代理（`doc-develop/`，2026-09-09 重构）：引擎 `dev-proxy.js` + 两个入口 `dev-frontend-local.js`（全本地）/ `dev-frontend-remote.js`（全远程，默认 152.136.254.127）；`dev-frontend.js` 仅作兼容薄封装。Windows 双击用 `start-frontend-local.cmd` / `start-frontend-remote.cmd`。环境变量：`DEV_PORT`、`FRONTEND_ROOT`、`DIST=1`、`API_HOST`、`BOOKING_PORT`、`MSG_HOST`、`MSG_PORT`、`NO_PROBE=1`。2026-09-10：`dev-frontend-remote.js` **默认 BOOKING_PORT/MSG_PORT 改为 80**（服务器已收紧 8081/8090，`SERVER_ADDRESS=127.0.0.1` + 安全组只放 80/443），改由远程 Nginx 分流；旧部署用环境变量覆盖回 8081/8090。脚本内置**混合拓扑守卫**（一端本地一端远程即告警）。

## JWT 密钥域与部署拓扑铁律（2026-09-08 用户权威确认）
- **密钥域约定**：远程的 message-service 与远程 booking api **使用系统的 jwt 密钥**（线上实际部署密钥）；本地 maven 构建出的 message-service/booking jar 用的是 `api/src/main/resources/application.properties` 里的源 `jwt.secret`（882 串）——**与远程系统密钥不同**。
- **铁律**：token 只能被「与其同源密钥」的服务校验。前端**不能一边连本地、一边连远程**：
  - ✅ 全远程：远程 booking + 远程 message-service（同系统密钥），兼容；前提是远程 message-service 真在跑 + 防火墙放行 8090 入站。
  - ✅ 全本地：本地 booking(8081) + 本地 message-service(8090)（同 882 串源密钥），兼容；前提是本地库数据就绪。
  - ❌ 混合（本地 message + 远程 booking，或反向）：跨服务 token 验不过，必 401。
- **实证锚点**：曾用源 882 串密钥伪造 token，本地 message-service 验过→send 200；远程 booking 拒→load recipients 401。该 401 是**密钥不一致**，非 sys_user_session 登录态校验（JwtAuthenticationFilter 只验签名、不查 session）。
- **工具约束**：`doc-develop/dev-frontend.js` 的 `MSG_HOST` 分流**仅在两端密钥一致时（全本地或全远程同密钥）才安全**；不可用于"前端一边本地一边远程"的联调。
- **本地起 message-service 必带 `--server.port=8090`**：沙箱环境变量 `SERVER__PORT=55058` 会被 Spring Boot 宽松绑定映射成 `server.port`，覆盖 jar 的 8090 → 绑 55058 撞 WorkBuddy IDE 退出。

## 前后端职责边界（2026-09-09 改造落地）
- **booking api = 纯后台**：仅提供 REST（`/api/v1/**`），**不再伺服任何 UI 页面**；`api/src/main/resources/static/` 已整体删除，jar 内 static 条目为 0。
- **平台管理端归 frontend**：`platform_admin.html`、`logBrowser.html`、`js/platform-admin-*.js`、`js/main.js`、`js/logBrowser.js` 已迁至 `frontend/`，由 `frontend/build.js` 构建进 `dist/`，Nginx 伺服。平台管理员从前端登录（frontend/index.html 已支持 platform_admin 角色）→ 跳 `FRONTEND_ORIGIN + '/platform_admin.html'`。
- **api 唯一缺省页**：`api/.../controller/DefaultPageController.java`，映射 `"/"` 与 `"/index.html"`，动态显示程序名/版本（build-info）/服务器时间/时区/已运行时长，用于自我标识。`"/"` 已在 SecurityConfig permitAll。
- **api 不再跑 node**：`api/pom.xml` 的 `frontend-maven-plugin` 已移除，`api/build-platform.js`、`package.json`、`package-lock.json`、`node_modules` 已删；版本信息改由 `spring-boot-maven-plugin` 的 `build-info` goal 生成。
- **共用资源零冲突**：`css/admin.css` 等共享文件两处原本内容完全一致（仅差末尾换行），合并到 frontend 一份后样式不变；但今后改 `admin.css` 会同时影响 platform_admin 与 admin 两页。
- **构建注意**：frontend `build.js` 全量扫描 `frontend/`（html + js/** + css/** + 资源），新增页面/脚本放进去即自动进 dist，无需改构建配置。
