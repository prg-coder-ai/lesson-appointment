package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 教师职业信息入参 DTO（新增/修改共用）
 * 对应 notes §2.3 入参DTO
 */
@Data
public class TeacherProfessionalDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 租户ID — SaaS多租户；服务端应以 TenantContext 覆盖，勿信任客户端传值 */
    private Long tenantId;

    /** 修改时传，新增时为null */
    private String teacherProfessionalId;

    /** 必填（必须存在 role=teacher 的 user） */
    private String teacherId;

    /** 学科 */
    private String subject;

    /** 个人照片URL */
    private String personalPhotoUrl;

    /** 个人照片Base64 */
    private String personalPhotoBase64;

    /** 文字说明（教师简介） */
    private String bioText;

    /** 文字说明链接 */
    private String bioUrl;

    /** 可预约时间规则（结构化JSON） */
    private String availabilityRule;

    /** 单次可预约最小课时数 */
    private Integer minBookingHours;

    /** 每周可预约总课时上限 */
    private Integer weeklyAvailableHours;

    /** 证书文字描述 */
    private String certificateText;

    /** 职业信息状态active/inactive/frozen */
    private String status;

    /** 证书列表（增/改入参，修改时为「先删后插」覆盖） */
    private List<TeacherCertificateDTO> certificates;

    /** 可预约时间段列表（增/改入参，修改时为「先删后插」覆盖） */
    private List<TeacherAvailableTimeDTO> availableTimes;
}
