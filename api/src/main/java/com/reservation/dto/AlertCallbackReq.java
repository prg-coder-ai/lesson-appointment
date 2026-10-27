package com.reservation.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * classroom-service 异常告警回调请求体。
 * 课堂运行中的异常情况（如设备故障、网络中断、人数超限等），
 * 通过 HMAC 签名 POST 到 /api/v1/classrooms/alerts。
 */
@Data
public class AlertCallbackReq {
    private String alertId;
    private String scheduleId;
    private String classroomId;
    /** 告警级别：info / warning / critical */
    private String level;
    /** 告警类型：device_failure / network_issue / capacity_exceeded / rtc_error 等 */
    private String alertType;
    private String message;
    private LocalDateTime alertTime;
    /** 触发告警的用户 ID（可为空，如系统级告警） */
    private String userId;
}