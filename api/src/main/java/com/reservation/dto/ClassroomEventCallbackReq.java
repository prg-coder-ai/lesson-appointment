package com.reservation.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * classroom-service 课堂事件回调请求体。
 * 课堂运行期间的签到/退出/迟到等事件，通过 HMAC 签名 POST 到 /api/v1/classrooms/events。
 */
@Data
public class ClassroomEventCallbackReq {
    private String eventId;
    private String scheduleId;
    private String classroomId;
    /** 事件类型：join / leave / late / kick / rollcall / rollcall_answer */
    private String eventType;
    private String userId;
    private LocalDateTime eventTime;
    /** 附加数据（如 rollcallId、kickReason 等） */
    private Map<String, Object> metadata;
}