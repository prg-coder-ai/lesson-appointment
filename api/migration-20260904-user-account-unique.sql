-- ============================================================================
-- migration-20260904-user-account-unique.sql  用户表账号唯一约束
-- 背景（2026-09-04）：
--   修复登录 selectOne 因 account 模糊匹配误伤 2 条记录
--   （TooManyResultsException，账号 T002 与 T002@def.com 同租户互污染）之后，
--   进一步在【存储层】兜底：同一租户内 account 必须唯一，杜绝任何因应用层
--   查询逻辑（LIKE/精确）疏漏导致的同租户账号重复或混淆。
--   跨租户允许相同 account（不同 tenant_id 视为不同账号），故唯一键含 tenant_id。
--   对应应用层修复：UserMapper.getUserByAccount 已将 LIKE 改为 account = 精确匹配。
-- ============================================================================

-- 幂等：仅当索引不存在时才添加（MySQL 不支持 CREATE UNIQUE INDEX IF NOT EXISTS）
DELIMITER $$
DROP PROCEDURE IF EXISTS add_user_account_unique$$
CREATE PROCEDURE add_user_account_unique()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'user'
          AND INDEX_NAME   = 'uk_user_account_tenant'
    ) THEN
        ALTER TABLE `user`
          ADD UNIQUE KEY `uk_user_account_tenant` (`account`, `tenant_id`);
    END IF;
END$$
DELIMITER ;

CALL add_user_account_unique();
DROP PROCEDURE IF EXISTS add_user_account_unique;
