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

-- ------------------------------------------------------------
-- root 远程登录收口（**前提：不能把 root@localhost 弄没**）
--
-- 目标：把 root 的可登录范围收敛到本机，同时绝不留下「一个 root 都不剩」的状态。
--   · 只删「远程 host」的 root；root@localhost **一行都不碰** —— 这是硬保证；
--   · 文件末尾带一条硬断言：万一 root@localhost 真不在，脚本会自己中止（见下）。
--
-- ⚠️ 执行前必看（云厂商镜像常见只有 root@'%'，没有 root@localhost）：
--      mysql -uroot -p -e "SELECT user,host FROM mysql.user WHERE user='root'"
--    若输出里**只有 root@'%'、没有 root@localhost**，**先不要执行本文件** ——
--    此刻删掉 '%' 就再没有任何 root 能登录，只能进 --skip-grant-tables 救援。
--    先把它改名过去（名字换了、密码原样保留，不会锁死）：
--      RENAME USER 'root'@'%' TO 'root'@'localhost';
--    再回来执行本文件。
--
-- 说明：DROP USER 只拦新连接，不会踢掉已建立的会话 —— 当前这条连接删完照样可用，
--      断开重连才生效（这时你会以 root@localhost 身份进来）。
-- ------------------------------------------------------------
DROP USER IF EXISTS 'root'@'%';
DROP USER IF EXISTS 'root'@'0.0.0.0';
DROP USER IF EXISTS 'root'@'::';

-- 硬断言：root@localhost 必须仍然存在，否则中止，不让后面 schema/*.sql 在半残状态下开跑
-- （@has=1 时走 'DO 0' 什么也不做；@has=0 时刻意去查一张不存在的表，使 mysql 以
--   ERROR 1146 + 非 0 退出码中断。那条「表不存在」的报错是**故意设计的信号**，不是本文件的 bug。）
SET @has_root_local := (SELECT COUNT(*) FROM mysql.user WHERE user = 'root' AND host = 'localhost');
SET @root_check_sql := IF(@has_root_local = 1,
  'DO 0',
  'SELECT * FROM `mysql`.`__ABORT_root_localhost_missing_read_comment_above__`');
PREPARE _chk_root FROM @root_check_sql;
EXECUTE _chk_root;
DEALLOCATE PREPARE _chk_root;

-- 自检（应输出 3 行 utf8mb4，以及 lesson 账号的 3 条授权）
-- SELECT SCHEMA_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA
--  WHERE SCHEMA_NAME IN ('lesson_appointment','message_center','classroom');
-- SHOW GRANTS FOR 'lesson'@'127.0.0.1';

-- root 收口自检：期望**恰好 1 行** root/localhost。
-- 若还有别的 host 行（如某个具体 IP、机器名），按需再 DROP；
-- 若一行都没有，立即停下，不要继续跑 schema/*.sql。
SELECT user, host FROM mysql.user WHERE user = 'root' ORDER BY host;
