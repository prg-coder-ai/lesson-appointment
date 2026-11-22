-- ============================================================
-- classroom 库授权补齐（2026-11-22）
-- 位置：deploy/sql/patch/20261122-1430-classroom-db-grant.sql
--
-- 【为什么单独出一个补丁】
--   deploy/sql/00-create-databases.sql 里本来就有 `GRANT ALL ON classroom.*`，
--   但它只在「新环境第 0 步」跑一次。现实里 classroom 库常常是后来才加的
--   （课堂服务是第三个上线的模块），于是出现：
--     · lesson 账号能连 lesson_appointment / message_center，唯独没有 classroom 的授权；
--     · 课堂服务启动不报错（连接是懒建立的），一查就炸；
--     · 表象极其误导：HTTP 500 `{"code":500,"message":"服务器繁忙：MyBatisSystemException"}`，
--       **没有任何 SQL 报错文案**（因为失败在"拿连接"这一层，
--       MyBatisExceptionTranslator 只有在直接 cause 是 SQLException 时才翻译出 BadSqlGrammar…）；
--     · 连带效应：租户管理端访问课堂全部 403「课堂未启用」——
--       AuthInterceptor 判开关要先查 lesson_appointment.sys_tenant_eclassroom，
--       查询异常被 TenantEclassroomService 的 catch 降级成 false，于是"未启用"。
--   2026-11-22 现网就是这三条同时出现，排查绕了很久，故沉淀成本文件。
--
-- 【授权范围（按实际代码用量核对，不是拍的）】
--   classroom.*                                 课堂服务自己的 13 张表：读写
--   lesson_appointment.sys_tenant_eclassroom    判断租户是否开通课堂：只读
--   lesson_appointment.sys_eclassroom_instance  取课堂实例地址/容量：只读
--   lesson_appointment.booking                  花名册人数统计（BookingRosterMapper）：只读
--   两库必须在**同一个 MySQL 实例**上 —— 源码里用的是全限定表名（lesson_appointment.xxx），
--   跨实例根本读不到。
--
-- 【执行】
--   mysql -uroot -p < deploy/sql/patch/20261122-1430-classroom-db-grant.sql
--   幂等：账号不存在时只告警不报错；重复执行结果一致。
--   ⚠️ 本文件**不创建账号、不改密码**（避免把线上密码覆盖成占位符）。
--      账号不存在请先执行 deploy/sql/00-create-databases.sql 或手建：
--        CREATE USER 'lesson'@'127.0.0.1' IDENTIFIED BY '<与三份 env 一致的密码>';
--
-- ⚠️ 手工执行时的三个坑（2026-11-22 现场踩过，报错都表现为"不识别命令"）：
--   ① 必须先进 mysql 会话（提示符 mysql>）再敲 SQL；在 bash/zsh 里直接粘贴
--      `GRANT ALL PRIVILEGES ...` 会得到 `bash: GRANT: command not found` —— 那是 shell 在骂，不是 MySQL。
--   ② 用 `mysql -e "GRANT ... ON \`classroom\`.* TO ..."` 时，**反引号会被 shell 当命令替换**先执行掉，
--      于是 MySQL 收到残缺语句 → `ERROR 1064 You have an error in your SQL syntax`。
--      规避：-e 的内容用**单引号**包（'GRANT ALL PRIVILEGES ON classroom.* TO ...'），
--      或者干脆去掉反引号（库名 classroom 不含特殊字符，不需要反引号），
--      或者用重定向执行本文件（推荐，见上）。
--   ③ 必须用 root（或带 GRANT OPTION 的账号）执行。用 lesson 自己执行会得到
--      `ERROR 1044 Access denied ... to database` / 8.0+ 的
--      `ERROR 1410 You are not allowed to create a user with GRANT`（目标账号 host 不存在时）。
--
-- 【执行后验证】
--   SHOW GRANTS FOR 'lesson'@'127.0.0.1';
--   mysql -h127.0.0.1 -ulesson -p classroom -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='classroom';"
--   期望 13；能用 lesson 账号连上即为授权生效。
-- ============================================================

-- ------------------------------------------------------------
-- 授权：先判账号是否存在（MySQL 的 GRANT 没有 IF EXISTS，账号缺失会直接报 1410）
-- ------------------------------------------------------------
SET @has_tcp  := (SELECT COUNT(*) FROM mysql.user WHERE user = 'lesson' AND host = '127.0.0.1');
SET @has_sock := (SELECT COUNT(*) FROM mysql.user WHERE user = 'lesson' AND host = 'localhost');

-- 课堂库：读写全量（schema 修复、索引重建等运维动作不必再临时提权）
SET @s_tcp := IF(@has_tcp = 1,
  "GRANT ALL PRIVILEGES ON `classroom`.* TO 'lesson'@'127.0.0.1'",
  "SELECT 'WARN: lesson@127.0.0.1 不存在，跳过授权；请先执行 00-create-databases.sql' AS msg");
PREPARE st FROM @s_tcp; EXECUTE st; DEALLOCATE PREPARE st;

SET @s_sock := IF(@has_sock = 1,
  "GRANT ALL PRIVILEGES ON `classroom`.* TO 'lesson'@'localhost'",
  "SELECT 'WARN: lesson@localhost 不存在，跳过授权（TCP 部署可忽略，运维手连会 Access denied）' AS msg");
PREPARE st FROM @s_sock; EXECUTE st; DEALLOCATE PREPARE st;

-- ------------------------------------------------------------
-- 跨库只读：课堂服务要用全限定表名读主库这三张
-- 若主库授权已给到库级（lesson_appointment.*），本段是冗余的、无副作用；
-- 若主库被收窄成表级最小权限，这三条是**必须**的，否则课堂开关永远判成"未启用"。
-- ------------------------------------------------------------
SET @s_cross := IF(@has_tcp = 1,
  "GRANT SELECT ON `lesson_appointment`.`sys_tenant_eclassroom`   TO 'lesson'@'127.0.0.1'",
  "SELECT 'skip' AS msg");
PREPARE st FROM @s_cross; EXECUTE st; DEALLOCATE PREPARE st;

SET @s_cross2 := IF(@has_tcp = 1,
  "GRANT SELECT ON `lesson_appointment`.`sys_eclassroom_instance` TO 'lesson'@'127.0.0.1'",
  "SELECT 'skip' AS msg");
PREPARE st FROM @s_cross2; EXECUTE st; DEALLOCATE PREPARE st;

SET @s_cross3 := IF(@has_tcp = 1,
  "GRANT SELECT ON `lesson_appointment`.`booking`                 TO 'lesson'@'127.0.0.1'",
  "SELECT 'skip' AS msg");
PREPARE st FROM @s_cross3; EXECUTE st; DEALLOCATE PREPARE st;

FLUSH PRIVILEGES;

-- ------------------------------------------------------------
-- 自检（执行完看输出）
-- ------------------------------------------------------------
SELECT user, host FROM mysql.user WHERE user = 'lesson' ORDER BY host;

SELECT 'classroom 表数（期望 13）' AS item,
       COUNT(*) AS val
  FROM information_schema.tables WHERE table_schema = 'classroom'
UNION ALL
SELECT 'lesson 对 classroom 的授权条数（期望 ≥1）',
       COUNT(DISTINCT table_schema)
  FROM information_schema.schema_privileges
 WHERE grantee = "'lesson'@'127.0.0.1'" AND table_schema = 'classroom';

-- 逐条展开看（把结果贴给运维复核用）
-- 同样先判存在性：账号缺失时 SHOW GRANTS 会 ERROR 1141 并让脚本以非 0 退出，
-- 那是"账号还没建"，不是"授权失败"，不该被误读成本文件执行失败。
SET @s_show := IF(@has_tcp = 1,
  "SHOW GRANTS FOR 'lesson'@'127.0.0.1'",
  "SELECT '（跳过 SHOW GRANTS：lesson@127.0.0.1 不存在，先建账号）' AS note");
PREPARE st FROM @s_show; EXECUTE st; DEALLOCATE PREPARE st;
