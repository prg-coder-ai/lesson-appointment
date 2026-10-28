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
 * <p><b>与 appointment 的关系</b>：本表只记录「这堂课实际上成什么样」，不改
 * {@code appointment.status}，也不扣 {@code student_balance}——课时扣减属账务动作，
 * 需与请假/退费档位（refund_snapshot）统一口径后再接，避免账实不符。
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

    /** 数据来源 */
    private String source;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
