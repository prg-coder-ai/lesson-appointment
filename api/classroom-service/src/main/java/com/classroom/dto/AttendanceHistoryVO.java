package com.classroom.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学生维度历史出勤视图（F2-07）。
 * 由 {@code AttendanceMapper#selectHistoryByUserId} 的 JOIN 查询结果映射，字段与 SQL 别名一一对应。
 */
@Data
public class AttendanceHistoryVO {
    private String scheduleId;
    private String courseName;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String attendanceStatus;
    private LocalDateTime checkInAt;
    private LocalDateTime checkOutAt;
    private Integer effectiveMinutes;
    private Boolean late;
}
