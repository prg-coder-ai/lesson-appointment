package com.reservation.dto;

import lombok.Data;

/**
 * 租户用量与额度视图对象（运行管理页面）
 */
@Data
public class TenantUsageDTO {

    private Long tenantId;
    private String tenantCode;
    private String orgName;

    /** 套餐ID（0/null 表示未指定套餐，即不限额） */
    private Long packageId;

    /** 额度等级：normal / warn / danger / unlimited */
    private String quotaLevel;

    private Integer courseCount;
    private Integer courseLimit;
    private Integer coursePercent;

    private Integer scheduleCount;
    private Integer scheduleLimit;
    private Integer schedulePercent;

    private Integer userCount;
    private Integer userLimit;
    private Integer userPercent;

    private Integer teacherCount;
    private Integer teacherLimit;
    private Integer teacherPercent;

    private Integer studentCount;
    private Integer studentLimit;
    private Integer studentPercent;

    private Integer teacherPublishCount;
    private Integer teacherPublishLimit;
    private Integer teacherPublishPercent;

    /** 预约数（不占用额度，仅用于统计展示） */
    private Integer bookingCount;

    /** 与上月的变化（正数为增加） */
    private Integer courseDelta;
    private Integer scheduleDelta;
    private Integer teacherDelta;
    private Integer studentDelta;
    private Integer bookingDelta;
}
