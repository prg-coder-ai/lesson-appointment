package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 课堂出勤回流（classroom-service → booking-api）。
 *
 * <p>由 {@code POST /api/v1/classroom-callback/attendance} 写入，是「课时消耗」在预约系统侧的
 * 落库凭证（需求 F2-06 / F7-01 / F7-02）。课堂服务是出勤的唯一真相源，本表只做**幂等镜像**：
 * 同一 (scheduleId, userId) 只保留最新结论，{@code consumption_version} 更小的整条丢弃。
 *
 * <p><b>与 appointment 的关系</b>：本表记录「这堂课实际上成什么样」。
 * 2026-10-28（S3）起，出勤结论会驱动 {@code appointment.status} 推进
 * （进过课堂 → completed，从未进入 → absent），并按「有没有请假」扣减课时
 * （见 {@code LessonSettlementService}）。两件事在本表都有留痕：
 * {@code appointmentId} 是锚点，{@code consumedLessons / consumptionState} 是账务结果。
 *
 * <p><b>扣减与出场时长无关</b>：只要学生没走请假流程，缺席也扣 1 课时
 * （用户 2026-10-28 拍板）。本表的 {@code effectiveMinutes} 只用于记录事实与统计。
 *
 * <p><b>时间口径</b>：{@code checkInAt/checkOutAt/actualStart/actualEnd} 是课堂服务侧的
 * 本地墙钟（Asia/Shanghai）；{@code appointment.appointment_datetime} 是 UTC。
 * 跨源比对必须先换算，禁止直接相减。
 *
 * <p><b>租户隔离</b>：本表所有读写都在免登录回调线程里发生，此时
 * {@code TenantContext} 为空，租户插件会兜底拼 {@code tenant_id = -1} 而恒不命中。
 * 故 Mapper 方法一律 {@code @InterceptorIgnore(tenantLine="true")} + 显式传 tenantId，
 * tenantId 由 {@code course_schedule} 反查得出，**绝不采信回调载荷**。
 */
@Data
@TableName("lesson_attendance")
public class LessonAttendance implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（由 schedule 反查，非客户端上报） */
    private Long tenantId;

    /** 排期ID（=课堂ID） */
    private String scheduleId;

    /** 课程ID */
    private String courseId;

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

    /** 有效课时（分钟） */
    private Integer effectiveMinutes;

    /** 回流时课堂状态 */
    private String classroomStatus;

    /** 实际开课时间 */
    private LocalDateTime actualStart;

    /** 实际下课时间 */
    private LocalDateTime actualEnd;

    /** 课时消耗版本号 */
    private Integer consumptionVersion;

    /** 课次序号（排期展开的第几次；课次级结算用） */
    private Integer classIndex;

    /** 对应 appointment.id —— 结算与状态推进的锚点 */
    private Integer appointmentId;

    /** 本次计扣课时：0=请假/取消，1=未请假 */
    private java.math.BigDecimal consumedLessons;

    /** 结算状态：pending 待结算 / settled 已扣减 / waived 已免除 */
    private String consumptionState;

    /** 扣减生效时间 */
    private LocalDateTime settledAt;

    /** 人工改判原因 */
    private String adjustReason;

    /** 数据来源 */
    private String source;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
