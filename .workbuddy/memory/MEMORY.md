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
