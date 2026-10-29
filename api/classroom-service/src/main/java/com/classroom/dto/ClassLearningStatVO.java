package com.classroom.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 学情报表：单课堂聚合行（F7-04）。
 *
 * <p>{@code present} 不在 SQL 里算，而由 total - absent 得出：
 * 出勤状态存在 LEFT/REJOINED 这类过程态（未收尾的课堂会残留），
 * 用「总数减缺勤」比枚举「哪些状态算出勤」更不容易漏。
 */
@Data
public class ClassLearningStatVO {
    private String scheduleId;
    private String courseName;
    private String teacherName;
    private LocalDateTime startTime;
    private String status;
    private Long tenantId;

    private Integer total;
    private Integer absent;
    private Integer late;
    /** 出勤人数 = total - absent（Java 侧计算） */
    private Integer present;

    private BigDecimal avgMinutes;
    private Integer rollcallAnswered;
    private Integer submissions;
}
