-- ============================================================
-- 迁移脚本：为 user 表添加 account 列
-- 日期：2026-08-13
-- 原因：api/database.sql 第8行语法错误（单引号包裹列名 + 缺逗号），
--       导致实际建表时 account 列未被创建，与实体类 User.java 不匹配，
--       运行时报错：Unknown column 'account' in 'field list'
-- 目标表：lesson_appointment.user
-- ============================================================

USE lesson_appointment;

-- ------------------------------------------------------------
-- 步骤 1：添加 account 列（带幂等防护，重复执行不报错）
-- 列定义参考 doc-api/MySQL.sql 第7行：
--   `account` varchar(50) NOT NULL COMMENT '账号（用户名）'
-- 位置：放在 user_id 之后，phone 之前（AFTER user_id）
--
-- 注意：MySQL 8.0 原生不支持 ADD COLUMN IF NOT EXISTS，
--       因此通过存储过程 + INFORMATION_SCHEMA 判断实现幂等。
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_user_account_column;
DELIMITER //
CREATE PROCEDURE add_user_account_column()
BEGIN
    -- 检查 account 列是否已存在
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'user'
          AND COLUMN_NAME  = 'account'
    ) THEN
        -- 先以允许 NULL + 默认值方式添加，避免已有数据时 NOT NULL 报错
        ALTER TABLE `user`
            ADD COLUMN `account` VARCHAR(50) NULL
            COMMENT '账号（用户名）'
            AFTER `user_id`;

        -- ------------------------------------------------------------
        -- 步骤 2：回填已有数据的 account 值
        -- 优先级：phone > email > userId（UUID 兜底保证非空）
        -- 说明：account 是登录账号，通常使用 phone 或 email 作为账号
        -- ------------------------------------------------------------
        UPDATE `user`
        SET `account` = CASE
            WHEN `phone` IS NOT NULL AND TRIM(`phone`) <> '' THEN `phone`
            WHEN `email` IS NOT NULL AND TRIM(`email`) <> '' THEN `email`
            ELSE `user_id`  -- 兜底：使用 user_id（UUID），保证唯一且非空
        END
        WHERE `account` IS NULL OR TRIM(`account`) = '';

        -- 回填完成后，将列改为 NOT NULL（与 doc-api/MySQL.sql 和实体类 @NotBlank 保持一致）
        ALTER TABLE `user`
            MODIFY COLUMN `account` VARCHAR(50) NOT NULL
            COMMENT '账号（用户名）';
    END IF;
END //
DELIMITER ;

-- 执行存储过程
CALL add_user_account_column();

-- 清理存储过程
DROP PROCEDURE IF EXISTS add_user_account_column;

-- ------------------------------------------------------------
-- 步骤 3：添加 account 唯一索引（带幂等防护）
-- 说明：account 作为登录账号，业务上应该唯一。
--       参考 doc-api/MySQL.sql，该索引在原始 DDL 中未定义，
--       但为了保证登录逻辑的正确性（按 account 查找唯一用户），
--       建议补充。若不需要可跳过此步骤。
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_user_account_unique_index;
DELIMITER //
CREATE PROCEDURE add_user_account_unique_index()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'user'
          AND INDEX_NAME   = 'uk_account'
    ) THEN
        ALTER TABLE `user`
            ADD UNIQUE KEY `uk_account` (`account`) COMMENT '账号唯一';
    END IF;
END //
DELIMITER ;

CALL add_user_account_unique_index();
DROP PROCEDURE IF EXISTS add_user_account_unique_index;

-- ============================================================
-- 验证语句（执行完补丁后手动运行以下 SQL 确认）
-- ============================================================
-- DESC `user`;
-- 期望输出中包含：
--   account | varchar(50) | NO |  | NULL |
--
-- SHOW INDEX FROM `user` WHERE Key_name = 'uk_account';
-- 期望输出中有 uk_account 且 Non_unique = 0
-- ============================================================
