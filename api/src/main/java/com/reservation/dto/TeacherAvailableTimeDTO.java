package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 教师可预约时间段子项 DTO（与 TeacherAvailableTime 实体同构，对齐 admin-schedule 排期标识）
 */
@Data
public class TeacherAvailableTimeDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String availableId;

    /** 重复类型：none(不重复) / day(每天) / week(每周) / month(每月) */
    private String repeatType;

    /** 重复间隔 N，默认 1 */
    private Integer repeatInterval;

    /** 逗号分隔数字：week→1..7(周一..周日)，month→1..31 */
    private String repeatDays;

    /** 开始日期 YYYY-MM-DD */
    private String startDate;

    /** 结束日期 YYYY-MM-DD（可为空） */
    private String endDate;

    /** 时段开始 HH:mm 或 HH:mm:ss */
    private String startTime;

    /** 时段结束 HH:mm 或 HH:mm:ss */
    private String endTime;

    /** active/frozen */
    private String status;
}
