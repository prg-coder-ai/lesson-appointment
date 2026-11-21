-- ============================================================
-- eclassroom 默认课堂服务实例种子（上线 / 演示用）
-- 日期：2026-10-29
-- 背景：20261027-0900-eclassroom-tenant.sql 只建表、不种实例。
--   sys_eclassroom_instance 为空时，平台管理员在「课堂实例」页无实例可绑，
--   导致所有租户 getConfig 返回 enabled=false、前端看不到「进入课堂」入口，
--   课堂功能在首次部署后完全不可用。
-- 作用：种入一个指向本地 classroom-service(8092) 的默认实例，解除上线阻断。
-- 生产：上线前请在平台管理端「课堂实例」页把地址改成真实的 classroom-service，
--       或直接删除本行后新建；instance_code='default-local' 已存在则跳过（幂等）。
-- ============================================================

INSERT INTO `sys_eclassroom_instance`
  (`instance_code`, `instance_name`, `api_host`, `api_port`, `api_base_path`,
   `ws_host`, `ws_port`, `ws_base_path`, `status`, `region`, `max_capacity`,
   `current_load`, `remark`, `creator_account`)
SELECT
   'default-local',
   '默认课堂服务(本地)',
   '127.0.0.1',
   8092,
   '/api/v1',
   '127.0.0.1',
   8092,
   '/ws',
   1,
   'local',
   200,
   0,
   '本地开发/演示默认实例；上线前请改为真实 classroom-service 地址，或删除后由平台管理员新建',
   'system'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_eclassroom_instance` WHERE `instance_code` = 'default-local'
);
