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