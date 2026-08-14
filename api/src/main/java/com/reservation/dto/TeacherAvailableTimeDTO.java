package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 教师可预约时间段子项 DTO（TeacherProfessionalDTO 的子结构）
 */
@Data
public class TeacherAvailableTimeDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String availableId;

    /** weekly(每周模板) / override(具体日期覆盖) / holiday(假日) */
    private String timeType;

    /** 每周模板时生效：1=周一..7=周日 */
    private Integer dayOfWeek;

    /** override/holiday时生效：具体日期 */
    private String specificDate;

    /** 时段开始 如 09:00:00 */
    private String startTime;

    /** 时段结束 如 17:00:00 */
    private String endTime;

    /** active/frozen */
    private String status;
}
