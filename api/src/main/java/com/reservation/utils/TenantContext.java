package com.reservation.utils;
 //saas租户上下文

public class TenantContext {
    private static final ThreadLocal<Long> TENANT_HOLDER = new ThreadLocal<>();

    public static void setTenantId(Long tenantId) {
        TENANT_HOLDER.set(tenantId);
    }

    public static Long getTenantId() {
        return TENANT_HOLDER.get();
    }

    public static void clear() {
        TENANT_HOLDER.remove();
    }
}