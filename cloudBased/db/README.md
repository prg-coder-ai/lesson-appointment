# ==============================================================================
# 数据库迁移准备 —— 微信云托管
# 手册 4.1-4.3 节的实际执行路径
# ==============================================================================

## 一、数据库方案选择

| 方案 | 做法 | 推荐度 |
|------|------|--------|
| **A. 内建 MySQL（Serverless）** | 云托管控制台「数据库」一键开通 | ⭐⭐⭐ 测试期、快速验证 |
| **B. 自带 MySQL（腾讯云数据库）** | 环境变量里给 SPRING_DATASOURCE_URL | ⭐⭐⭐⭐⭐ 生产期、数据主权 |

本项目有两个库（与两个后端服务一一对应）：
- `lesson_appointment` ← api 主服务（业务库）
- `message_center`    ← message-service（消息中心）

### 方案 A 执行步骤

1. 控制台 → 数据库 → 开通 Serverless MySQL
2. 控制台拿到内建 MySQL 自动注入的三个变量：
   - `MYSQL_ADDRESS`（主机:端口）
   - `MYSQL_USERNAME`
   - `MYSQL_PASSWORD`
3. **在 api 服务和 message-service 服务的环境变量里「接法 1」**（零代码改动，见 `.env.api.example` 注释）：
   - 用 `MYSQL_ADDRESS` 拆 host/port，拼成 `SPRING_DATASOURCE_URL`
   - 直接填 `DB_USERNAME` / `DB_PASSWORD`
4. 把下方 4.2 的 schema 脚本导入云托管内建 MySQL
5. 完成后**必须重新发布**两个后端服务

### 方案 B 执行步骤

1. 用腾讯云 MySQL（或自建），创建两个库：`lesson_appointment` / `message_center`
2. 环境变量直接按 `.env.api.example` 里的接法 1 填
3. 导入 schema 脚本

---

## 二、Schema 迁移（通用）

### 2.1 现有 schema 脚本位置

所有 schema 脚本**都已在项目根目录**，迁移时直接拿过来执行，**cloudBased 不重复维护**，避免两份：

```
api/sql/schema/20261014-legal-doc.sql          ← 协议/隐私政策两张表
api/sql/seed/20261015-legal-doc-seed.sql        ← 4 条初始文档（平台正式版 + 平台模板各 2 条）
api/sql/dump/lesson_appointment.sql            ← 主业务库 dump（如有）
api/message-service/sql/dump/message_center.sql← 消息库 dump（如有）
```

### 2.2 完整 schema 列表（按执行顺序）

| # | 脚本 | 说明 |
|---|------|------|
| 1 | `lesson_appointment.sql`（主业务库 dump） | 租户/课程/预约/推广/微信身份等所有业务表 |
| 2 | `20261014-legal-doc.sql` | `sys_legal_doc` / `sys_legal_accept` 两张新表 |
| 3 | `20261015-legal-doc-seed.sql` | 4 条初始协议文档（tenant_id=0，平台级） |
| 4 | `message_center.sql`（消息库 dump） | 消息中心所有表 |

### 2.3 执行方式（mysqldump 导入）

```bash
# 方式 1：连接云库后 source
mysql -h <cloud-mysql-host> -u <user> -p <db_name> < path/to/schema.sql

# 方式 2：云托管控制台 → 数据库 → 导入文件（上传 sql）
```

### 2.4 字符集强制校验（手册 4.2 节）

```bash
# 连到云库后执行：
SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='lesson_appointment';
# 期望：utf8mb4 / utf8mb4_general_ci（本项目跨库 JOIN 依赖此 collation）
```

**⚠️ 不要用默认的 utf8mb4_0900_ai_ci**，本项目有跨库 JOIN 会报 collation mismatch。

---

## 三、时区三处统一（手册 4.2 节强制项）

| 位置 | 当前本地值 | 云托管必须改为 | 改动位置 |
|------|-----------|---------------|---------|
| 容器 TZ | — | `Asia/Shanghai` | Dockerfile 里 ENV TZ |
| JDBC serverTimezone | `UTC` | `Asia/Shanghai` | cloudBased/*/application-cloud.properties 覆盖 |
| MySQL 全局时区 | 本地 MySQL 可能 Asia/Shanghai | `Asia/Shanghai` | 云托管内建 MySQL 默认 UTC，需在 JDBC URL 里用 `serverTimezone=Asia/Shanghai` 兜底即可（不需要改数据库全局时区） |

### 为什么必须改？

UTC vs Asia/Shanghai 差 8 小时，不改的后果：
- 所有写入的课程开始/结束时间错位 8 小时
- 定时任务（8 个 @Scheduled）触发时刻全部偏移
- session JWT 的 issuedAt / expiresAt 错位，可能导致登录态异常

---

## 四、迁移 checklist

- [ ] 云托管 MySQL 库已创建（lesson_appointment + message_center）
- [ ] 两个库 charset=utf8mb4 / collation=utf8mb4_general_ci
- [ ] Schema + seed 全部导入完成（含 legal-doc 两张表 + 4 条文档）
- [ ] 环境变量接法确定（A 还是 B），两个后端服务的环境变量已填好
- [ ] DB_PASSWORD / JWT_SECRET / AES_KEY / HMAC_KEY / WECHAT_SECRET / WECHAT_OPEN_SECRET 全部走加密变量
- [ ] api 与 message-service 的 JWT_SECRET / AES_KEY / HMAC_KEY **逐字符一致**
- [ ] 两个后端服务已重新发布，日志无启动异常
- [ ] 用 `GET /api/v1/health` 或 Actuator health 检查返回 200
