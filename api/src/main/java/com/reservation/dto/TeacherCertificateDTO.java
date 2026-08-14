package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 教师证书子项 DTO（TeacherProfessionalDTO 的子结构）
 */
@Data
public class TeacherCertificateDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String certificateId;

    /** 证书名称 */
    private String certName;

    /** 证书图片URL */
    private String certUrl;

    /** 证书图片Base64 */
    private String certBase64;

    /** 排序号，小在前 */
    private Integer sortNo;
}
