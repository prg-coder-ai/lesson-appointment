-- ============================================================
-- 三库初始化（新环境第 0 步，必须先于所有 schema/*.sql 执行）
-- 日期：2026-11-20
-- 位置：deploy/sql/00-create-databases.sql
--
-- 【为什么需要这个文件】
--   deploy/sql/schema/ 下的表结构是现网 mysqldump 导出的，**不带 CREATE DATABASE / USE**。
--   早先的初始化文档直接 `mysql -uroot < xxx-schema.sql`，会报
--   ERROR 1046 (3D000): No database selected —— 首次部署就卡在第一步。
--   唯一自带建库的是 api/classroom-service/sql/classroom-schema.sql（本文件仍显式建一次，
--   使三库在同一步就绪，且字符集口径统一）。
--
-- 【字符集/排序规则按现网逐库对齐，不要图省事统一成一种】
--   lesson_appointment   utf8mb4 / utf8mb4_unicode_ci
--   message_center       utf8mb4 / utf8mb4_general_ci
--   classroom            utf8mb4 / utf8mb4_0900_ai_ci
--   课堂服务要跨库只读 lesson_appointment.sys_tenant_eclassroom 判断租户是否开通课堂，
--   collation 改成与现网不一致会在字符串比较/排序上冒出难查的怪结果。
--
-- 【执行】
--   mysql -uroot -p < deploy/sql/00-create-databases.sql
--   （本文件可重复执行：IF NOT EXISTS 全程幂等）
-- ============================================================

CREATE DATABASE IF NOT EXISTS `lesson_appointment`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `message_center`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE DATABASE IF NOT EXISTS `classroom`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- 应用账号（与 deploy/*.env.template 里的 DB_USERNAME=lesson 对应）
--
-- ⚠️ 执行前把 'CHANGE_ME' 换成真实密码，且必须与
--    /etc/lesson/booking.env、message.env、classroom.env 的 DB_PASSWORD **完全一致** ——
--    三个服务共用同一个账号，改一处不改另一处就是启动即连不上。
-- ⚠️ 若 MySQL 开了 validate_password 插件（8.0 默认策略为 MEDIUM），'CHANGE_ME' 会被拒
--    （不含数字/特殊字符）。这种情况直接写真实强密码再执行。
-- ⚠️ CREATE USER IF NOT EXISTS 对**已存在**的用户不会改密码；要改密码用：
--    ALTER USER 'lesson'@'127.0.0.1' IDENTIFIED BY '<新密码>';
--
-- 建两份是因为 MySQL 把 127.0.0.1（TCP）与 localhost（socket）当成不同主机：
-- 三服务的 JDBC 走 TCP（127.0.0.1），而服务器上手工 mysql 客户端常走 socket（localhost），
-- 只建一份会出现"服务能连、运维手连报 Access denied"。
-- ------------------------------------------------------------
CREATE USER IF NOT EXISTS 'lesson'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
CREATE USER IF NOT EXISTS 'lesson'@'localhost'  IDENTIFIED BY 'CHANGE_ME';

-- 三库授权。课堂服务除自己的库之外还要**只读**主库的两张课堂表
-- （sys_tenant_eclassroom / sys_eclassroom_instance），所以对 lesson_appointment 也必须有权限。
-- 若要把权限收窄成最小集，至少保留：
--   课堂库      SELECT/INSERT/UPDATE/DELETE
--   lesson_appointment  SELECT（跨库只读）
-- 这里给 ALL 是为了让 schema 修复、索引重建等运维动作不必再临时提权。
GRANT ALL PRIVILEGES ON `lesson_appointment`.* TO 'lesson'@'127.0.0.1', 'lesson'@'localhost';
GRANT ALL PRIVILEGES ON `message_center`.*     TO 'lesson'@'127.0.0.1', 'lesson'@'localhost';
GRANT ALL PRIVILEGES ON `classroom`.*          TO 'lesson'@'127.0.0.1', 'lesson'@'localhost';

FLUSH PRIVILEGES;

-- 自检（应输出 3 行 utf8mb4，以及 lesson 账号的 3 条授权）
-- SELECT SCHEMA_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA
--  WHERE SCHEMA_NAME IN ('lesson_appointment','message_center','classroom');
-- SHOW GRANTS FOR 'lesson'@'127.0.0.1';
