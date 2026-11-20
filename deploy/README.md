# deploy —— 部署资产单一事实源

本目录放"**服务器上要用的、但不属于 jar 的东西**"：部署模板、systemd 单元、构建/上传脚本，以及
`sql/` 下的三库 DDL。`deploy/upload-to-server.sh` 会把这些文件按约定传到服务器。

> 2026-11-18 目录整合：原 `api/beforeRun/`（env/systemd 模板）与 `api/sql/`（schema/seed/patch）
> 已分别合并到 `deploy/` 与 `deploy/sql/`，旧目录删除。历史文档与守卫里的旧路径已同步更新。

## 一、目录内容

| 文件 | 落到服务器哪里 | 说明 |
|------|----------------|------|
| `booking.env.template` | `/opt/lesson/booking.env.template` → `sudo cp` 成 `/etc/lesson/booking.env` | 主服务 8081。密钥注入**正本**，守卫 `check:secret-env` 校验它 |
| `message.env.template` | 同上 → `/etc/lesson/message.env` | 消息 8090 |
| `classroom.env.template` | 同上 → `/etc/lesson/classroom.env` | 课堂 8092（新增 2026-10-30）。含 Redis / 存储 / RTC 项 |
| `booking.service` | `/etc/systemd/system/booking.service` | |
| `message-service.service` | `/etc/systemd/system/message-service.service` | |
| `classroom.service` | `/etc/systemd/system/classroom-service.service` | 注意**文件名不带 -service**，单元名是 `classroom-service`（新增 2026-10-30） |
| `sql/00-create-databases.sql` | `/opt/lesson/sql/` | 新环境**第 0 步**：建三库 + 建 `lesson` 账号并授权。三个库的 collation 与现网逐库对齐，别统一 |
| `nginx/booking.conf` / `booking-ip.conf` | `/etc/nginx/sites-available/{booking,booking-ip}` | HTTPS 版 / 纯 IP 版；首次部署默认启用后者（无证书时启用前者会因证书缺失起不来） |
| `nginx/conf.d/00-limit-req-zone.conf` | `/etc/nginx/conf.d/` | 限流 zone 必须放 `http{}` 上下文；漏传 → `nginx -t` 报 unknown limit_req_zone |
| `nginx/proxy_params` | `/etc/nginx/proxy_params`（**仅当目标不存在时**） | 两份站点配置共 22 处 `include` 它；Debian 由 nginx-common 自带，CentOS/Anolis 没有 → 缺了 `nginx -t` 直接失败 |
| `logrotate/lesson` | `/etc/logrotate.d/lesson` | 接管 systemd `append:` 日志的滚动（含 classroom.log）；漏装则永不滚动，写满撑爆磁盘 |
| `backup.sh` / `healthcheck.sh` | `/opt/lesson/` | 每日备份 / 5 分钟巡检；装完必须配 cron，条目见 `upload-to-server.sh` 末尾提示 |
| `referential-integrity-20261008.sql` | 留档，按需执行 | 外键/引用完整性的一次性脚本，见 `tools/check-cascade-rules.mjs` |
| `MVN跨平台…md` / `Maven…md` | 不上传 | 开发机参考资料 |

## 二、SQL 脚本在哪

DDL 的权威位置是**本目录下的 `sql/`**（`deploy/sql/{schema,seed,patch}/`），由 `deploy/upload-to-server.sh`
上传到服务器的 `/opt/lesson/sql/`；课堂库自带的 `CREATE DATABASE` 脚本仍在 `api/classroom-service/sql/`。

| 目的 | 仓库真实文件 | 服务器落点 |
|------|--------------|-----------|
| 业务库结构 `lesson_appointment` | `deploy/sql/schema/20261013-0400-lesson_appointment-schema.sql` | `/opt/lesson/sql/schema/` |
| 业务库种子（行业/套餐/系统配置/**术语 317 行**） | `deploy/sql/seed/20261008-1527-lesson_appointment-seed-dict-config.sql` | `/opt/lesson/sql/seed/` |
| 消息库结构 `message_center` | `deploy/sql/schema/20261008-1527-message_center-schema.sql` | `/opt/lesson/sql/schema/` |
| 消息库种子（分类/模板/敏感词） | `deploy/sql/seed/20261008-1528-message_center-seed-sys.sql` | `/opt/lesson/sql/seed/` |
| 课堂库结构 `classroom` | `api/classroom-service/sql/classroom-schema.sql` | `/opt/lesson/sql/classroom/` |
| 增量补丁 | `deploy/sql/patch/*.sql`、`api/classroom-service/sql/patch/*.sql` | `/opt/lesson/sql/patch/`、`…/classroom/patch/` |

⚠️ **两个与旧手册不同的关键点**：

1. `deploy/sql/schema/*.sql` 是**从现有库 dump 出来的表结构，不带 `CREATE DATABASE` / `USE`**。
   必须先建库再 `mysql <库名> < 文件`：
   ```bash
   mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS lesson_appointment DEFAULT CHARACTER SET utf8mb4;"
   mysql -uroot -p lesson_appointment < /opt/lesson/sql/schema/20261013-0400-lesson_appointment-schema.sql
   ```
   （只有 `api/classroom-service/sql/classroom-schema.sql` 自带 `CREATE DATABASE classroom` + `USE classroom`。）
2. 旧手册里的 `lesson_appointment_schema_fixed.sql`、`sys_term_upsert_to_target.sql`、
   `messagecenter-schema.sql` **在当前仓库已不存在**。术语数据已经并进
   `seed/20261008-1527-lesson_appointment-seed-dict-config.sql`，不再需要手工替换 `<目标数据库名>` 占位符。

## 三、改 env 模板时必看

- 密钥变量名必须是 `AES_KEY` / `HMAC_KEY`（不是 `CRYPTO_AESKEY`）。
  机理与对照实验见 `tools/check-secret-env-guard.mjs` 头部注释；
  改完跑 `npm run check:secret-env`（当前覆盖 3 个 properties + 3 个 env 模板）。
- 三份 env 的 `JWT_SECRET` / `AES_KEY` / `HMAC_KEY` 必须**逐字符一致**，
  否则消息/课堂 401、跨服务解密失败。
- 模板里只写 `CHANGE_ME`，**不要**写真实密钥（守卫会拦）。
- 三份 env 都必须有 `SERVER_PORT`（与 jar 内 `server.port` 一致）与 `SERVER_ADDRESS=127.0.0.1`：
  前者挡住服务器上残留的 `SERVER_PORT` 环境变量把服务顶到别的端口（表现是 nginx 全站 502、
  日志一句不提端口）；后者避免后端默认监听 `0.0.0.0` 绕过 nginx 直连（限流与安全响应头全部失效）。
  后端与 nginx 不同机时改成内网 IP —— 这一项 2026-11-20 才补齐，此前三份模板都没有。

> 另注：`doc-develop/04-部署与运维/booking.env.template`、`doc-develop/04-部署与运维/message.env.template` 是历史遗留的**同步副本**，
> 正本在本目录。改密钥相关的东西请改这里的正本（守卫只校验正本），两份副本记得一起改。
