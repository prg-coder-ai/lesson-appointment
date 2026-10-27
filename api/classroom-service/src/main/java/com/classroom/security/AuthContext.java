package com.classroom.security;

import com.classroom.common.RoleConst;
import lombok.Data;

/**
 * 当前请求用户上下文（由 AuthInterceptor 填充，afterCompletion 清除）。
 */
public class AuthContext {
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
    public static boolean isTeacher() { return RoleConst.isTeacher(currentRole()); }
    public static boolean isStudent() { return RoleConst.isStudent(currentRole()); }
    public static boolean isManager() { return RoleConst.isManager(currentRole()); }
    public static boolean isPlatformAdmin() { return RoleConst.isPlatformAdmin(currentRole()); }

    @Data
    public static class Auth {
        private String userId;
        private String role;
        private Long tenantId;
        private String token;
    }
}