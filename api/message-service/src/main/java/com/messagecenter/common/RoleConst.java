package com.messagecenter.common;

/** 角色常量（与主系统一致） */
public final class RoleConst {
    private RoleConst() {}
    public static final String STUDENT = "student";
    public static final String TEACHER = "teacher";
    public static final String ADMIN = "admin";
    public static final String PLATFORM_ADMIN = "platform_admin";
    /** 系统/业务系统触发 */
    public static final String SYSTEM = "system";

    /** 可发下行消息的角色（teacher/admin/platform_admin/system） */
    public static boolean canSendDownstream(String role) {
        return TEACHER.equals(role) || ADMIN.equals(role) || PLATFORM_ADMIN.equals(role) || SYSTEM.equals(role);
    }
    /** 可管理分类/模板/批量任务/全局消息的角色（admin/platform_admin） */
    public static boolean isManager(String role) {
        return ADMIN.equals(role) || PLATFORM_ADMIN.equals(role);
    }
    /** 平台管理员（跨租户） */
    public static boolean isPlatformAdmin(String role) {
        return PLATFORM_ADMIN.equals(role);
    }
}
