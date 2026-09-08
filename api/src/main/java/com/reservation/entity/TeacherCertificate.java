package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * 教师资格证书实体（1:N 关联教师）
 * 对应 notes §1.2 teacher_certificate 表
 */
@Data
@TableName("teacher_certificate")
public class TeacherCertificate implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 租户ID（0=平台/历史单租户数据）— SaaS多租户 */
    private Long tenantId;

    /** 主键UUID */
    @TableId(type = IdType.ASSIGN_UUID)
    private String certificateId;

    /** 关联教师user_id */
    private String teacherId;

    /** 证书名称 */
    private String certName;

    /** 证书图片URL */
    private String certUrl;

    /** 证书图片Base64（兼容） */
    private String certBase64;

    /** 排序号，小在前 */
    private Integer sortNo;

    /** 创建时间 */
    private String createTime;
}
