package com.classroom.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 出勤回流请求（出向，教学服务 → 预约系统）。
 * 对应需求 F2-06, F7-02。
 */
@Data
public class AttendanceCallbackReq {

    private String scheduleId;
    private String courseId;
    private String classroomStatus;
    private LocalDateTime actualStart;
    private LocalDateTime actualEnd;
    private List<AttendanceItem> items;
    private Integer consumptionVersion;

    @Data
    public static class AttendanceItem {
        private String userId;
        private String role;
        private String attendanceStatus;
        private LocalDateTime checkInAt;
        private LocalDateTime checkOutAt;
        private Integer effectiveMinutes;
    }
}