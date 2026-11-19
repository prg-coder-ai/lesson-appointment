package com.reservation.utils;

import com.reservation.common.RoleConst;

/**
 * 联系方式脱敏（2026-11-19，安全走读 M-2）。
 *
 * <h3>为什么需要它</h3>
 * 教师公开资料（{@code /teacher/professional/listByPage}、{@code /queryTeacherProfessionalInfo}）
 * 的角色声明是 {@code ALL_ROLES}——学生浏览教师资料是产品需求，不能收窄成管理员专属。
 * 但这两个端点把 {@code phone} / {@code email} 解密后**原样下发**，
 * 结果任何一个已登录学生都能拉走本租户全部教师的手机号与邮箱：既能批量外呼/发信，
 * 也是一次完整的个人信息导出（个人信息保护法口径下属于未授权提供）。
 *
 * <h3>为什么脱敏而不是删字段</h3>
 * 前端与小程序靠这两个字段判断"资料是否填全"，直接置 null 会让资料页显示"未填写"。
 * 保留字段、遮住内容，既维持契约形状，又不给出可直接使用的方式。
 *
 * <h3>放行谁</h3>
 * 管理员（admin / platform_admin）与**本人**看到全量：管理员要能维护、
 * 教师本人要能编辑自己的资料。
 */
public final class ContactMask {

    private ContactMask() {
    }

    /** 手机号：13812345678 → 138****5678；长度不足或为空原样/占位返回 */
    public static String phone(String v) {
        if (v == null || v.isBlank()) {
            return v;
        }
        String s = v.trim();
        if (s.length() < 7) {
            return "***";
        }
        return s.substring(0, 3) + "****" + s.substring(s.length() - 4);
    }

    /** 邮箱：zhangsan@demo.test → z***@demo.test；无 @ 或为空时给占位 */
    public static String email(String v) {
        if (v == null || v.isBlank()) {
            return v;
        }
        String s = v.trim();
        int at = s.indexOf('@');
        if (at <= 0 || at == s.length() - 1) {
            return "***";
        }
        String name = s.substring(0, at);
        String head = name.length() <= 1 ? name : name.substring(0, 1);
        return head + "***" + s.substring(at);
    }

    /**
     * 是否应对调用者隐藏联系方式。
     *
     * <p>fail closed：取不到调用者身份时一律隐藏——宁可让前端显示"未填写"，
     * 也不要把"身份没解析出来"变成"全量明文"。
     *
     * @param callerRole      调用者角色（token.role）
     * @param callerId        调用者 userId（token.sub）
     * @param ownerTeacherId  这条资料的归属教师 userId
     */
    public static boolean shouldMask(String callerRole, String callerId, String ownerTeacherId) {
        if (RoleConst.ADMIN.equals(callerRole) || RoleConst.PLATFORM_ADMIN.equals(callerRole)) {
            return false;
        }
        if (callerId == null || callerId.isBlank()) {
            return true;
        }
        return !callerId.equals(ownerTeacherId);
    }
}
