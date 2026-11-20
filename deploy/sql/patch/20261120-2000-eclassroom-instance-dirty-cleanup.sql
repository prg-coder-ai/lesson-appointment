-- ============================================================
-- 课堂实例存量脏值清理（2026-11-20）
--
-- 【背景】
--   sys_eclassroom_instance.max_capacity 此前是纯记录字段（无任何代码读取），
--   平台端也不校验，于是库里可能这样躺着：
--     · max_capacity <= 0  —— 运营以为填 0 是"禁掉"，实际语义是"不限制"；
--     · api_host 为空串    —— 绑上租户后课堂入口拼出 http://:8092/api/v1，全挂且报错指不到根因；
--     · status <> 1        —— 停用/维护中的实例仍可被绑定（旧版 bindTenantClassroom 不校验）。
--   2026-11-20 起：写入时校验容量为正整数、绑定时校验 api_host 非空 + status=1、开课时按容量准入。
--   但**存量数据不会自动变干净**，先用本文件诊断，再按需修正。
--
-- 【执行】
--   mysql -uroot -p < deploy/sql/patch/20261120-2000-eclassroom-instance-dirty-cleanup.sql
--   本文件第 1 段只读；第 2 段是**注释掉的**修正模板，逐条确认后手工取消注释执行。
--   ⚠️ 刻意不写 `USE xxx`：历史上有文件带 USE 导致 `mysql <别的库>` 时静默切库写错地方。
--
-- 【不要用"解绑"当清理手段】
--   unbindTenantClassroom 是**物理 DELETE**（删 sys_tenant_eclassroom 的整行），
--   删掉后租户课堂入口立刻消失，且审计上留不下"曾经开通过"的痕迹。
--   只是想让某租户停用课堂 → 用「禁用」（enabled=0），不要解绑。
-- ============================================================

-- ------------------------------------------------------------
-- 第 1 段：诊断（只读，直接执行）
-- ------------------------------------------------------------
SELECT
    id,
    instance_code,
    api_host,
    api_port,
    max_capacity,
    current_load,
    status,
    CASE
        WHEN api_host IS NULL OR TRIM(api_host) = '' THEN '❌ API 地址为空：绑上去课堂入口必挂'
        WHEN status <> 1 THEN '⚠️ 状态非「正常」：课堂侧会直接 403「课堂未启用」'
        WHEN max_capacity IS NULL THEN '· 未设容量：不做并发准入（不限制）'
        WHEN max_capacity <= 0 THEN '❌ 容量 <= 0：语义等同「不限制」，不是「禁掉」'
        ELSE '✅ 正常'
    END AS diagnosis,
    (SELECT COUNT(*) FROM lesson_appointment.sys_tenant_eclassroom te
      WHERE te.instance_id = i.id) AS bound_tenants
FROM lesson_appointment.sys_eclassroom_instance i
WHERE i.deleted = 0
ORDER BY i.id;

-- ------------------------------------------------------------
-- 第 2 段：修正模板（默认注释，逐条确认后手工启用）
-- ------------------------------------------------------------

-- ① 容量 <= 0 → 改成合理上限（先按实际机器能力定值：一台 8092 建议 50~200 之间）
-- UPDATE lesson_appointment.sys_eclassroom_instance
--    SET max_capacity = 200
--  WHERE deleted = 0 AND (max_capacity IS NULL OR max_capacity <= 0) AND id = /*实例ID*/ 0;

-- ② API 地址为空的实例：补全地址，或**确认无绑定的前提下**软删（deleted=1）掉
--    （有绑定租户的实例不能直接删，先把租户改绑到正常实例）
-- UPDATE lesson_appointment.sys_eclassroom_instance
--    SET deleted = 1
--  WHERE deleted = 0 AND (api_host IS NULL OR TRIM(api_host) = '')
--    AND id = /*实例ID*/ 0
--    AND NOT EXISTS (SELECT 1 FROM lesson_appointment.sys_tenant_eclassroom te
--                     WHERE te.instance_id = lesson_appointment.sys_eclassroom_instance.id);

-- ③ 停用/维护中但仍有租户绑着的实例：要么把状态改回 1，要么把租户改绑到正常实例
-- SELECT te.tenant_id, te.instance_id, i.instance_code, i.status
--   FROM lesson_appointment.sys_tenant_eclassroom te
--   JOIN lesson_appointment.sys_eclassroom_instance i ON i.id = te.instance_id
--  WHERE te.enabled = 1 AND (i.status <> 1 OR i.deleted = 1);

-- ------------------------------------------------------------
-- 第 3 段：清理后复核（只读）
-- ------------------------------------------------------------
-- 期望：没有「❌」行；bound_tenants 全部挂在 status=1 且 api_host 非空的实例上。
