package com.reservation.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

/**
 * classroom-service 出勤回流回调请求体。
 * 课堂关闭后 classroom-service 通过 HMAC 签名 POST 到 /api/v1/classrooms/attendance，
 * 主系统据此更新课次出勤记录与课时消耗。
 */
@Data
public class AttendanceCallbackReq {
    private String scheduleId;
    private String classroomId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer durationMinutes;
    private List<AttendanceItem> items;

    @Data
    public static class AttendanceItem {
        private String userId;
        /** 出勤状态：present / absent / late / leave_early */
        private String status;
        /** 实际在线时长（分钟） */
        private Integer onlineMinutes;
        /** 有效课时（分钟，扣除迟到/早退） */
        private Integer effectiveMinutes;
        /** 签到时间 */
        private LocalDateTime joinTime;
        /** 离开时间 */
        private LocalDateTime leaveTime;
    }
}