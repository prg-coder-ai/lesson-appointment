-- ============================================================
-- 教育行业租户开通课堂（租户-实例绑定）+ 修正默认实例 WS 根路径
-- 日期：2026-11-13
-- 背景：教师端「我的课堂」菜单消失。
--   菜单显隐的唯一判据是 GET /api/v1/eclassroom/config 的 enabled，
--   而 enabled 来自 sys_tenant_eclassroom（无记录 = 未开通）。
--   实测该表 0 行但 AUTO_INCREMENT=5 —— 曾插入 4 条绑定后被删
--   （EclassroomService.unbindTenantClassroom 是物理 delete），
--   于是所有租户 getConfig 回落 {enabled:false}，前端把菜单 display:none。
-- 作用：
--   1) 为 industry_id=4（education 教育培训）且启用中的租户绑定 default-local 实例，enabled=1
--   2) 若已有绑定但 enabled=0，重新置 1（本次意图就是"开通"，不是"保留禁用"）
--   3) sys_eclassroom_instance.ws_base_path 由历史错误值 '/ws' 归一为 ''
--      语义见 EclassroomService.DEFAULT_WS_BASE_PATH：该字段是 WS 根，
--      **不含 /ws/classrooms 业务段**（前端 classroom-ws.js 会补），
--      留 '/ws' 会拼出 ws://host:port/ws/ws/classrooms/... → 白板/心跳/信令全连不上。
-- 幂等：可重复执行；已绑定且 enabled=1 的租户不受影响。
-- ============================================================

-- 1) 教育行业租户绑定默认实例
INSERT INTO `sys_tenant_eclassroom` (`tenant_id`, `instance_id`, `enabled`, `remark`, `creator_account`)
SELECT t.`id`, i.`id`, 1, '教育行业租户默认开通课堂', 'system'
FROM `sys_tenant` t
JOIN `sys_eclassroom_instance` i
  ON i.`instance_code` = 'default-local'
 AND i.`deleted` = 0
 AND i.`status` = 1
WHERE t.`industry_id` = 4
  AND t.`status` = 1
  AND t.`tenant_code` <> 'platform'
  AND NOT EXISTS (
    SELECT 1 FROM `sys_tenant_eclassroom` te WHERE te.`tenant_id` = t.`id`
  );

-- 2) 已有绑定但被禁用的，重新启用（并在记录上补一句备注来源）
UPDATE `sys_tenant_eclassroom` te
JOIN `sys_tenant` t ON t.`id` = te.`tenant_id`
SET te.`enabled` = 1,
    te.`remark` = '教育行业租户默认开通课堂（20261113 patch 重新启用）'
WHERE t.`industry_id` = 4
  AND t.`status` = 1
  AND t.`tenant_code` <> 'platform'
  AND te.`enabled` = 0;

-- 3) 修正默认实例的历史 WS 根路径
UPDATE `sys_eclassroom_instance`
SET `ws_base_path` = ''
WHERE `instance_code` = 'default-local'
  AND `ws_base_path` = '/ws';

-- 校验（执行后人工看一眼）
-- SELECT t.id, t.tenant_code, t.org_name, te.instance_id, te.enabled
--   FROM sys_tenant t LEFT JOIN sys_tenant_eclassroom te ON te.tenant_id = t.id
--  WHERE t.industry_id = 4 ORDER BY t.id;
