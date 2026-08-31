package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 教师职业信息主表实体（1:1 关联 user 表中 role=teacher 的记录）
 * 对应 notes §1.1 teacher_professional 表
 */
@Data
@TableName("teacher_professional")
public class TeacherProfessional implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;

    /** 主键UUID */
    @TableId(type = IdType.ASSIGN_UUID)
    private String teacherProfessionalId;

    /** 关联user表user_id（仅限role=teacher） */
    private String teacherId;

    /** 学科（冗余user.language_type，便于排序搜索） */
    private String subject;

    /** 个人照片URL（静态文件路径，优先） */
    private String personalPhotoUrl;

    /** 个人照片Base64（与URL二选一，兼容老qualification方式） */
    private String personalPhotoBase64;

    /** 文字说明（教师简介） */
    private String bioText;

    /** 文字说明链接（外部简历/博客URL） */
    private String bioUrl;

    /** 可预约时间规则（结构化JSON，冗余字段便于快速展示） */
    private String availabilityRule;

    /** 单次可预约最小课时数（如4小时） */
    private Integer minBookingHours;

    /** 每周可预约总课时上限 */
    private Integer weeklyAvailableHours;

    /** 证书文字描述（如CET-8、JLPT N1） */
    private String certificateText;

    /** 职业信息状态active/inactive/frozen */
    private String status;

    /** 创建时间 */
    private String createTime;

    /** 更新时间 */
    private String updateTime;
}
