package com.reservation.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * classroom-service 异常告警回调请求体（教师未到 / 课堂中断 / 大面积掉线）。
 *
 * <p><b>字段必须与 classroom-service 的 {@code com.classroom.dto.ClassroomAlertReq} 逐字段对齐</b>。
 * 历史坑：旧版本这里用的是 {@code alertId/classroomId/level/alertTime}，
 * 而教学服务发的是 {@code courseId/severity/occurredAt}——字段对不上，告警内容会静默丢一半
 * （只留下 alertType 与 message）。改名前先看对方 DTO。
 *
 * <p>送达路径：{@code POST /api/v1/classroom-callback/alerts}（HMAC 验签）。
 */
@Data
public class AlertCallbackReq {

    /** 排期ID（=课堂ID） */
    private String scheduleId;

    /** 课程ID */
    private String courseId;

    /** 告警类型：teacher_absent / class_interrupted / mass_disconnect 等 */
    private String alertType;

    /** 严重级别：info / warning / critical */
    private String severity;

    /** 告警描述 */
    private String message;

    /** 发生时间（课堂侧墙钟） */
    private LocalDateTime occurredAt;
}
