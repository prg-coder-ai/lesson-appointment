package com.reservation.common;

import java.util.List;

/**
 * 上课通知的「接收人」常量。
 *
 * <p>落库在 {@code course_notify_rule_point.audience}，决定该档通知发给谁。
 * 收件人身份取自订单（{@code booking.studentId} / {@code booking.teacherId}），
 * 不是按角色广播——只提醒这节课的当事人，不打扰同租户其他人。
 */
public final class NotifyAudience {

    private NotifyAudience() {
    }

    /** 仅学生 */
    public static final String STUDENT = "STUDENT";
    /** 仅教师 */
    public static final String TEACHER = "TEACHER";
    /** 学生 + 教师（默认） */
    public static final String BOTH = "BOTH";

    public static final List<String> ALL = List.of(STUDENT, TEACHER, BOTH);

    public static boolean isValid(String audience) {
        return audience != null && ALL.contains(audience.trim().toUpperCase());
    }

    public static String normalize(String audience) {
        if (audience == null) {
            return BOTH;
        }
        String s = audience.trim().toUpperCase();
        return ALL.contains(s) ? s : BOTH;
    }

    /** 是否包含学生 */
    public static boolean includesStudent(String audience) {
        String s = normalize(audience);
        return BOTH.equals(s) || STUDENT.equals(s);
    }

    /** 是否包含教师 */
    public static boolean includesTeacher(String audience) {
        String s = normalize(audience);
        return BOTH.equals(s) || TEACHER.equals(s);
    }

    public static String text(String audience) {
        switch (normalize(audience)) {
            case STUDENT:
                return "仅学生";
            case TEACHER:
                return "仅教师";
            default:
                return "学生 + 教师";
        }
    }

    /** 界面下拉用：{code, text} 列表 */
    public static List<java.util.Map<String, String>> options() {
        List<java.util.Map<String, String>> list = new java.util.ArrayList<>();
        for (String s : ALL) {
            java.util.Map<String, String> item = new java.util.LinkedHashMap<>();
            item.put("code", s);
            item.put("text", text(s));
            list.add(item);
        }
        return list;
    }
}
