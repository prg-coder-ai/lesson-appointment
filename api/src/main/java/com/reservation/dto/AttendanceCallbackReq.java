package com.reservation.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * classroom-service 出勤回流回调请求体（出向：教学服务 → 预约系统）。
 *
 * <p><b>字段口径以需求《在线教学微服务需求文档》8.3 节为准</b>，且必须与
 * classroom-service 的 {@code com.classroom.dto.AttendanceCallbackReq} <b>逐字段对齐</b>——
 * 两侧是同一个 JSON 的两端，任何一方增删改名都会让回流静默丢字段。
 *
 * <p>历史坑（2026-10-28 修复）：旧版本本 DTO 用的是
 * {@code classroomId/startTime/endTime/durationMinutes/items[status,onlineMinutes,joinTime,leaveTime]}，
 * 与教学服务侧的 {@code courseId/classroomStatus/actualStart/actualEnd/
 * items[attendanceStatus,checkInAt,checkOutAt,effectiveMinutes]} 完全是两套命名，
 * 只有 scheduleId 能对上。叠加当时「反序列化后再序列化来验签」的做法，
 * 回调要么 403、要么字段全 null。改字段名前请先看对方 DTO，不要凭「更自然的名字」重命名。
 *
 * <p>时间口径：{@code actualStart/actualEnd/checkInAt/checkOutAt} 均为课堂服务侧的
 * <b>本地墙钟</b>（Asia/Shanghai），与主系统 {@code appointment.appointment_datetime}（UTC）
 * 不同源，跨源比对前必须换算。
 */
@Data
public class AttendanceCallbackReq {

    /** 排期ID（=课堂ID） */
    private String scheduleId;

    /** 课程ID */
    private String courseId;

    /** 回流时课堂状态：CLOSED / CANCELLED 等 */
    private String classroomStatus;

    /** 实际开课时间（课堂侧墙钟） */
    private LocalDateTime actualStart;

    /** 实际下课时间（课堂侧墙钟） */
    private LocalDateTime actualEnd;

    /** 学生维度出勤明细 */
    private List<AttendanceItem> items;

    /** 课时消耗版本号，递增；预约系统据此丢弃旧版本（防乱序覆盖），为空按 1 处理 */
    private Integer consumptionVersion;

    @Data
    public static class AttendanceItem {
        /** 学生用户ID */
        private String userId;
        /** 角色：student / teacher */
        private String role;
        /** 出勤状态：present / late / absent / left / rejoined */
        private String attendanceStatus;
        /** 签到时间（课堂侧墙钟） */
        private LocalDateTime checkInAt;
        /** 离开时间（课堂侧墙钟） */
        private LocalDateTime checkOutAt;
        /** 有效课时（分钟，已扣抖动并封顶课时时长） */
        private Integer effectiveMinutes;
    }
}
