package com.classroom.common;

/** 角色常量（与主系统一致） */
public final class RoleConst {
    private RoleConst() {}
    public static final String STUDENT = "student";
    public static final String TEACHER = "teacher";
    public static final String ADMIN = "admin";
    public static final String PLATFORM_ADMIN = "platform_admin";
    public static final String SYSTEM = "system";

    public static boolean isTeacher(String role) { return TEACHER.equals(role); }
    public static boolean isStudent(String role) { return STUDENT.equals(role); }
    public static boolean isManager(String role) {
        return ADMIN.equals(role) || PLATFORM_ADMIN.equals(role);
    }
    public static boolean isPlatformAdmin(String role) {
        return PLATFORM_ADMIN.equals(role);
    }
}