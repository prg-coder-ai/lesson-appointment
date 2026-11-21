package com.classroom.dto;

import jakarta.validation.groups.Default;
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

    /**
     * 「整排期取消」专用校验组（2026-10-28）。
     *
     * <p>预约系统删排期是<b>先删行、再推取消事件</b>（{@code CourseScheduleService#deleteById}
     * 在 {@code deleteById} 之后才 {@code pushAfterCommit(...,"cancelled")}）。等事件发出时
     * 排期行已经没了，课程、教师、起止时间一概查不到。若取消事件也要求这些必填，
     * 删除排期就永远推不出取消事件——课堂会<b>永久残留</b>在监控列表里，
     * 而「删掉排期」恰恰是最需要取消课堂的场景。
     *
     * <p>因此取消只校验 eventId / eventType / scheduleId（取消语义只需要这三个），
     * created / updated 仍走 {@link Default} 组，课程与教师时间照旧必填。
     */
    public interface CancelGroup {
    }

    @NotBlank(groups = {Default.class, CancelGroup.class})
    private String eventId;

    @NotBlank(groups = {Default.class, CancelGroup.class})
    private String eventType;

    @NotBlank(groups = {Default.class, CancelGroup.class})
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
     * 该排期的课次总数（2026-10-28 多课次推送）。
     *
     * <p>只在 {@code updated} 事件里有意义：排期规则改短（10 周 → 5 周）后，
     * 本侧已建的第 6..10 课次课堂不会被任何事件覆盖，必须由这个总数反推出
     * 「超出范围的课次」并主动取消，否则孤儿课堂会永远挂在监控列表里。
     *
     * <p>{@code null} 表示推送方未告知（旧版推送方），此时不做任何清理。
     */
    private Integer classCount;

    /**
     * 租户 id（排期归属）。
     *
     * <p>修复前本字段不存在、消费端写死 {@code tenantId=0L}，后果是租户管理员
     * 按租户查课堂监控列表恒空。这里不设 {@code @NotNull}：
     * 平台级/未绑定租户的排期可以没有租户，用 0 兜底。
     */
    private Long tenantId;

    @NotBlank(groups = Default.class)
    private String courseId;

    @NotBlank(groups = Default.class)
    private String courseName;

    @NotNull(groups = Default.class)
    private TeacherInfo teacher;

    private List<StudentInfo> students;

    @NotNull(groups = Default.class)
    private LocalDateTime startTime;

    @NotNull(groups = Default.class)
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