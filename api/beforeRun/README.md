# api/beforeRun —— 部署前置件清单

本目录放"**服务器上要用的、但不属于 jar 的东西**"。命名沿用历史（beforeRun = 起服务之前要落位的文件），
`deploy/upload-to-server.sh` 会把这些文件按约定传到服务器。

## 一、目录内容

| 文件 | 落到服务器哪里 | 说明 |
|------|----------------|------|
| `booking.env.template` | `/opt/lesson/booking.env.template` → `sudo cp` 成 `/etc/lesson/booking.env` | 主服务 8081。密钥注入**正本**，守卫 `check:secret-env` 校验它 |
| `message.env.template` | 同上 → `/etc/lesson/message.env` | 消息 8090 |
| `classroom.env.template` | 同上 → `/etc/lesson/classroom.env` | 课堂 8092（新增 2026-10-30）。含 Redis / 存储 / RTC 项 |
| `booking.service` | `/etc/systemd/system/booking.service` | |
| `message-service.service` | `/etc/systemd/system/message-service.service` | |
| `classroom.service` | `/etc/systemd/system/classroom-service.service` | 注意**文件名不带 -service**，单元名是 `classroom-service`（新增 2026-10-30） |
| `referential-integrity-20261008.sql` | 留档，按需执行 | 外键/引用完整性的一次性脚本，见 `tools/check-cascade-rules.mjs` |
| `MVN跨平台…md` / `Maven…md` | 不上传 | 开发机参考资料 |

## 二、SQL 脚本在哪（**注意：不是本目录下的 sql/**）

历史手册里出现过 `api/beforeRun/sql/*.sql` 这个路径 —— **该目录已在提交 `f0bf2fbd` 删除**（此前确实存在过，
内容与 `api/sql/schema/` 重复且少 4 张表，属废弃副本）。
照着敲 `rsync api/beforeRun/sql/ ...` 会因源缺失直接失败（`set -e` 下整条上传流程终止）。
SQL 的真实位置如下（`deploy/upload-to-server.sh` 已按此传，目标是 `/opt/lesson/sql/`）：

| 目的 | 仓库真实文件 | 服务器落点 |
|------|--------------|-----------|
| 业务库结构 `lesson_appointment` | `api/sql/schema/20261013-0400-lesson_appointment-schema.sql` | `/opt/lesson/sql/schema/` |
| 业务库种子（行业/套餐/系统配置/**术语 317 行**） | `api/sql/seed/20261008-1527-lesson_appointment-seed-dict-config.sql` | `/opt/lesson/sql/seed/` |
| 消息库结构 `message_center` | `api/sql/schema/20261008-1527-message_center-schema.sql` | `/opt/lesson/sql/schema/` |
| 消息库种子（分类/模板/敏感词） | `api/sql/seed/20261008-1528-message_center-seed-sys.sql` | `/opt/lesson/sql/seed/` |
| 课堂库结构 `classroom` | `api/classroom-service/sql/classroom-schema.sql` | `/opt/lesson/sql/classroom/` |
| 增量补丁 | `api/sql/patch/*.sql`、`api/classroom-service/sql/patch/*.sql` | `/opt/lesson/sql/patch/`、`…/classroom/patch/` |

⚠️ **两个与旧手册不同的关键点**：

1. `api/sql/schema/*.sql` 是**从现有库 dump 出来的表结构，不带 `CREATE DATABASE` / `USE`**。
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

> 另注：`doc-develop/booking.env.template`、`doc-develop/message.env.template` 是历史遗留的**同步副本**，
> 正本在本目录。改密钥相关的东西请改这里的正本（守卫只校验正本），两份副本记得一起改。
