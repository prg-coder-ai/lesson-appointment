package com.reservation.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 课次实例（排期按重复规则展开后的「第 N 次课」）。
 *
 * <p>2026-11-13 新增，供前端「我的课堂」使用：教师/学生点开一条排期，看到的是
 * 具体课次列表，而不是抽象的「排期」。课堂、资料、回放、出勤在课堂服务里都是
 * **课次级**数据，标识为 {@code scheduleId~classIndex}（见 common/ClassroomKey。
 * 第 1 课次刻意保持裸 id 以兼容历史数据）。
 *
 * <p><b>时间口径</b>：{@code startTime/endTime} 是**排期时区的墙钟时间串**
 * （yyyy-MM-dd HH:mm:ss），与 {@link com.reservation.common.ScheduleInstances#expand}
 * 返回的形态一致，也与推送给课堂服务的载荷一致——不要在别处再做时区换算，
 * 否则「列表显示 20:00、课堂 21:00 开始」这类问题会非常难查。
 *
 * <p><b>为什么不给前端自己算</b>：课次展开规则（每 N 周 + 星期几集合、每月 + 日期集合、
 * 跨时区墙钟）只有 {@code ScheduleInstances} 一份权威实现，前端复刻必然与之漂移。
 */
@Data
public class ClassInstanceVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 课次序号，从 1 开始（与 appointment.class_index、ClassroomKey 同口径） */
    private Integer classIndex;

    /** 所属排期 id（裸 id） */
    private String scheduleId;

    /**
     * 课次级课堂标识：第 1 课次 = 裸 scheduleId，第 2 课次起 = {@code scheduleId~classIndex}。
     * 前端拿它进课堂 / 拉资料 / 查回放 / 查课堂状态。
     */
    private String classroomKey;

    /** 上课开始时间（排期时区墙钟，yyyy-MM-dd HH:mm:ss） */
    private String startTime;

    /** 上课结束时间（= startTime + 课时分钟数） */
    private String endTime;

    /** 单课时长（分钟） */
    private Integer durationMinutes;

    /** 该排期展开出的课次总数，便于前端显示「第 3/10 次」 */
    private Integer classCount;

    /**
     * 课次状态（按排期时区的当前时刻推算）：
     * {@code upcoming} 未开始 / {@code ongoing} 进行中 / {@code finished} 已结束。
     * 它是**时间态**，不是课堂服务里的业务状态（那要看 /classrooms/{key}/status）。
     */
    private String state;

    /** 是否为往期课次（已结束）——前端据此显示「回放」而不是「进入课堂」 */
    private Boolean past;
}
