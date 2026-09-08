package com.reservation.common;

/**
 * 角色常量定义
 * 说明：
 * - student / teacher：普通业务角色
 * - admin：租户管理员，只能管理本租户范围内的数据
 * - platform_admin：平台管理员，跨租户管理，可进入租户管理/系统监视/运营统计等平台页面
 */
public final class RoleConst {

    private RoleConst() {
    }

    public static final String STUDENT = "student";
    public static final String TEACHER = "teacher";
    public static final String ADMIN = "admin";
    public static final String PLATFORM_ADMIN = "platform_admin";
}
