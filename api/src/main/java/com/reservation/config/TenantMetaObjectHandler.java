package com.reservation.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.reservation.utils.TenantContext;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

/**
 * 租户字段自动填充
 *
 * 背景：TenantLineInnerInterceptor 只负责 SELECT/UPDATE/DELETE 拼接 tenant_id 条件，
 *      **不会**在 INSERT 时为实体赋值。若实体字段为 null，MP 会显式插入 NULL，
 *      进而触发 `Column 'tenant_id' cannot be null`。
 *
 * 作用：所有含 tenantId 字段的实体，在 insert 且该字段为空时自动填充当前租户ID；
 *      无租户上下文（定时任务、异步线程、白名单接口）时按约定填 0（平台/历史数据）。
 *      已显式赋值的场景（如审计日志在切面主线程解析）不会被覆盖。
 */
@Component
public class TenantMetaObjectHandler implements MetaObjectHandler {

    private static final String TENANT_ID = "tenantId";

    @Override
    public void insertFill(MetaObject metaObject) {
        // 平台表（sys_tenant 等）没有该字段，直接跳过
        if (!metaObject.hasSetter(TENANT_ID)) {
            return;
        }
        if (getFieldValByName(TENANT_ID, metaObject) != null) {
            return; // 业务已显式赋值，不覆盖
        }
        Long tenantId = TenantContext.getTenantId();
        setFieldValByName(TENANT_ID, tenantId == null ? 0L : tenantId, metaObject);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        // 更新不修改租户归属
    }
}
