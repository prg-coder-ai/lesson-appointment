package com.reservation.vo;

import com.reservation.entity.TeacherAvailableTime;
import com.reservation.entity.TeacherCertificate;
import com.reservation.entity.TeacherProfessional;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 教师职业信息详情返回 VO（编辑页用，含完整子表 + 冗余 user 字段）
 * 对应 notes §2.3 详情返回VO
 */
@Data
public class TeacherProfessionalDetailVO implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 主表全部字段 */
    private TeacherProfessional professional;

    /** 证书列表（完整） */
    private List<TeacherCertificate> certificates;

    /** 可预约时间段列表（完整） */
    private List<TeacherAvailableTime> availableTimes;

    /** 冗余：来自 user 表 */
    private String name;
    private String account;
    private String phone;
    private String email;
    private String userStatus;
}
