package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;

/**
 * 教师职业信息分页查询入参
 * 继承 PageQuery（pageNum / pageSize）
 * 对应 notes §2.1
 */
@Data
public class TeacherProfessionalQueryPage extends PageQuery {
    /** 租户ID（精准筛选，SaaS多租户；null=不限） */
    private Long tenantId;

    /** 精准查询（按教师ID） */
    private String teacherId;

    /** （模糊）教师姓名 —— 需联表 user.name */
    private String name;

    /** （精准或模糊）学科 */
    private String subject;

    /** 精准：active/inactive/frozen */
    private String status;

    /** （模糊）手机 —— 联表 user.phone */
    private String phone;

    /** （模糊）邮箱 —— 联表 user.email */
    private String email;

    /** （模糊）账号 —— 联表 user.account */
    private String account;

    /**
     * 计算 SQL OFFSET 偏移量：(pageNum-1) * pageSize
     * 供 Mapper XML 的 LIMIT ... OFFSET #{query.offset} 使用
     */
    public Integer getOffset() {
        Integer pn = getPageNum() == null ? 1 : getPageNum();
        Integer ps = getPageSize() == null ? 10 : getPageSize();
        return (pn - 1) * ps;
    }
}
