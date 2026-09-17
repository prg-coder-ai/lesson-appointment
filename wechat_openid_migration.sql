-- ============================================================
-- 微信 openid 字段迁移（支持微信静默登录 / 绑定）
-- 数据库：lesson_appointment，表：user
-- 执行方式（在 MySQL 客户端 / 部署脚本里跑一次即可）：
--   mysql -u root -p lesson_appointment < wechat_openid_migration.sql
-- ============================================================

-- 1) 新增字段：可为空，未绑定微信的用户为 NULL
--    （不指定 AFTER，避免与其他列顺序耦合；MySQL 会追加到表尾）
ALTER TABLE `user`
    ADD COLUMN `wx_openid` VARCHAR(64) NULL DEFAULT NULL
    COMMENT '微信openid（微信静默登录/绑定用，全局唯一，不随租户隔离）';

-- 2) 唯一索引：同一微信最多绑定一个账号。
--    MySQL 的 InnoDB 允许 openid 为 NULL 的多行共存（不冲突），
--    因此未绑定用户（NULL）之间不会互相报错，已绑定用户则全局唯一。
ALTER TABLE `user`
    ADD UNIQUE KEY `uk_user_wx_openid` (`wx_openid`);
