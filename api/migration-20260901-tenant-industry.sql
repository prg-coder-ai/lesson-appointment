-- 2026-09-01 租户表增加所属行业字段
-- 关联 sys_industry.id；0 或 NULL 表示未指定行业
ALTER TABLE sys_tenant
  ADD COLUMN industry_id BIGINT NULL DEFAULT NULL
  COMMENT '所属行业ID，关联 sys_industry.id；NULL 表示未指定'
  AFTER package_id;
