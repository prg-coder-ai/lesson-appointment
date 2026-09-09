package com.reservation.audit;

/**
 * 审计操作类型枚举
 */
public enum AuditAction {
    // 用户相关
    USER_LOGIN("用户登录"),
    USER_LOGOUT("用户登出"),
    USER_REGISTER("用户注册"),
    USER_APPROVE("用户审核"),
    USER_FREEZE("用户冻结"),
    USER_UNFREEZE("用户解冻"),
    USER_DELETE("用户删除"),
    USER_RESET_PASSWORD("重置密码"),
    USER_CHANGE_PASSWORD("修改密码"),
    // 修改用户基本资料（姓名/手机号/邮箱/状态），不含账号
    USER_UPDATE("修改用户信息"),

    // 课程相关
    COURSE_CREATE("创建课程"),
    COURSE_UPDATE("修改课程"),
    COURSE_DELETE("删除课程"),
    COURSE_PUBLISH("发布课程"),
    TEMPLATE_CREATE("创建模板"),
    TEMPLATE_UPDATE("修改模板"),
    TEMPLATE_DELETE("删除模板"),

    // 排期相关
    SCHEDULE_CREATE("创建排期"),
    SCHEDULE_UPDATE("修改排期"),
    SCHEDULE_DELETE("删除排期"),
    SCHEDULE_ASSIGN("分配学生到排期"),

    // 预约相关
    BOOKING_CREATE("创建预约"),
    BOOKING_CONFIRM("确认预约"),
    BOOKING_CANCEL("取消预约"),
    BOOKING_DELETE("删除预约"),

    // 课时相关
    APPOINTMENT_NOTE("发送上课通知"),
    APPOINTMENT_COMPLETE("完成课时"),
    APPOINTMENT_DELETE("删除课时"),

    // 教师信息
    TEACHER_PROFESSIONAL_UPDATE("修改教师职业信息"),
    TEACHER_PROFILE_PUBLISH("发布教师主页"),
    TEACHER_PROFILE_ARCHIVE("归档教师主页"),

    // 系统管理
    ADMIN_FORCE_LOGOUT("强制踢出用户"),
    SYSTEM_CONFIG_UPDATE("修改系统配置");

    private final String label;
    AuditAction(String label) { this.label = label; }
    public String getLabel() { return label; }
}
