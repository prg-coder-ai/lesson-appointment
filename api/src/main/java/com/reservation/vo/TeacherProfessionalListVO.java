package com.reservation.vo;

import lombok.Data;

import java.io.Serializable;

/**
 * 教师职业信息列表返回 VO（表格用，避免把长 base64 传到列表页）
 * 对应 notes §2.3 列表返回VO
 */
@Data
public class TeacherProfessionalListVO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String teacherProfessionalId;
    private String teacherId;

    /** 来自 user.name（联表） */
    private String name;
    /** 来自 user.account（联表） */
    private String account;
    /** 来自 user.phone（联表） */
    private String phone;
    /** 来自 user.email（联表） */
    private String email;

    private String subject;
    private String personalPhotoUrl;
    /** bio_text 截断 100 字（在 SQL 中已截断） */
    private String bioText;
    private Integer weeklyAvailableHours;
    private Integer minBookingHours;
    /** 证书数量（子查询统计） */
    private Integer certificateCount;
    /** 第一张证书缩略图 URL（子查询） */
    private String firstCertificateUrl;
    /** 可预约时间汇总文本（如「周一至周五 09:00-17:00」） */
    private String availabilitySummary;
    private String status;
    private String createTime;
    private String updateTime;
}
