package com.reservation.query;

import com.reservation.common.PageQuery;
import lombok.Data;

@Data
public class CourseScheduleQueryPage extends PageQuery {
    private Long tenantId;  // 租户ID（精准筛选，SaaS多租户；null=不限）
    private String scheduleName;
    private String courseName;
    private String status;
}