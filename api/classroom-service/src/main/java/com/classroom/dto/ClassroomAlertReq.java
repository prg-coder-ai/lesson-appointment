package com.classroom.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 课堂异常告警（出向，教学服务 → 预约系统）。
 * 对应需求 F7-03。
 */
@Data
public class ClassroomAlertReq {
    private String scheduleId;
    private String courseId;
    private String alertType;
    private String severity;
    private String message;
    private LocalDateTime occurredAt;
}