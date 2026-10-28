package com.classroom.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 排期事件请求（入向，预约系统 → 教学服务）。
 * 对应需求 F1-01。
 */
@Data
public class ScheduleEventReq {

    @NotBlank
    private String eventId;

    @NotBlank
    private String eventType;

    @NotBlank
    private String scheduleId;

    /**
     * 课次序号（2026-10-28 S5）。
     *
     * <p>一个排期会按重复规则展开成 N 个课次（{@code appointment.class_index}）。
     * 课堂必须按课次建，否则一个每周排期只有 1 个课堂、1 条出勤，
     * 第 3 次与第 8 次的出勤无法区分，扣课时必然重复或漏扣。
     *
     * <p>缺省为 1（兼容未升级的推送方与历史数据）。课堂侧用它编码出
     * 课次级标识 {@code scheduleId~classIndex}，见 {@code ClassroomKey}。
     */
    private Integer classIndex;

    /**
     * 租户 id（排期归属）。
     *
     * <p>修复前本字段不存在、消费端写死 {@code tenantId=0L}，后果是租户管理员
     * 按租户查课堂监控列表恒空。这里不设 {@code @NotNull}：
     * 平台级/未绑定租户的排期可以没有租户，用 0 兜底。
     */
    private Long tenantId;

    @NotBlank
    private String courseId;

    @NotBlank
    private String courseName;

    @NotNull
    private TeacherInfo teacher;

    private List<StudentInfo> students;

    @NotNull
    private LocalDateTime startTime;

    @NotNull
    private LocalDateTime endTime;

    private Integer duration;

    private Integer version;

    @Data
    public static class TeacherInfo {
        private String userId;
        private String name;
        private String avatar;
    }

    @Data
    public static class StudentInfo {
        private String userId;
        private String name;
    }
}