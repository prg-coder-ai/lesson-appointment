package com.messagecenter.security;

import com.messagecenter.common.RoleConst;
import lombok.Data;

/**
 * 当前请求用户上下文（由 MessageAuthInterceptor 填充，afterCompletion 清除）。
 * tenantId<0 表示未解析到租户（平台管理员传 0 时即跨租户）。
 */
public class MessageAuthContext {
    private static final ThreadLocal<Auth> HOLDER = new ThreadLocal<>();

    public static Auth get() { return HOLDER.get(); }
    public static void set(Auth a) { HOLDER.set(a); }
    public static void clear() { HOLDER.remove(); }

    public static String currentUserId() {
        Auth a = HOLDER.get();
        return a == null ? null : a.getUserId();
    }
    public static String currentRole() {
        Auth a = HOLDER.get();
        return a == null ? null : a.getRole();
    }
    public static Long currentTenantId() {
        Auth a = HOLDER.get();
        return a == null ? null : a.getTenantId();
    }
    public static String currentToken() {
        Auth a = HOLDER.get();
        return a == null ? null : a.getToken();
    }
    /** 平台管理员(跨租户) */
    public static boolean isPlatformAdmin() {
        return RoleConst.PLATFORM_ADMIN.equals(currentRole());
    }
    /** 可管理(分类/模板/批量/全局消息) */
    public static boolean isManager() {
        return RoleConst.isManager(currentRole());
    }

    @Data
    public static class Auth {
        private String userId;
        private String role;
        private Long tenantId;
        private String token;
    }
}
