package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.LessonAttendance;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 课堂出勤回流 Mapper。
 *
 * <p><b>为什么每个方法都 {@code @InterceptorIgnore}</b>：写入方是 classroom-service 的
 * HMAC 回调，走的是免登录白名单，请求线程里没有 {@code TenantContext}。
 * {@code TenantLineInnerInterceptor} 在 tenantId 为 null 时兜底拼 {@code tenant_id = -1}
 * （见 MyBatisPlusConfig 注释），会让人以为"没数据"而不是"被过滤了"——这类 bug 只在
 * 免登录路径复现，带 token 本地测全绿，排查代价极高。
 * 因此这里统一跳过插件，租户由 {@code LessonAttendanceService} 显式传入并在 SQL 里落地。
 */
@Mapper
public interface LessonAttendanceMapper extends BaseMapper<LessonAttendance> {

    /** 按 (scheduleId, userId) 取现有回流行（幂等判定用） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM lesson_attendance WHERE schedule_id = #{scheduleId} AND user_id = #{userId} LIMIT 1")
    LessonAttendance selectOneIgnoreTenant(@Param("scheduleId") String scheduleId,
                                           @Param("userId") String userId);

    /** 新增回流行（显式 tenant_id） */
    @InterceptorIgnore(tenantLine = "true")
    @Insert("INSERT INTO lesson_attendance (tenant_id, schedule_id, course_id, user_id, role, attendance_status,"
            + " check_in_at, check_out_at, effective_minutes, classroom_status, actual_start, actual_end,"
            + " consumption_version, source)"
            + " VALUES (#{tenantId}, #{scheduleId}, #{courseId}, #{userId}, #{role}, #{attendanceStatus},"
            + " #{checkInAt}, #{checkOutAt}, #{effectiveMinutes}, #{classroomStatus}, #{actualStart}, #{actualEnd},"
            + " #{consumptionVersion}, #{source})")
    int insertExplicitTenant(LessonAttendance row);

    /** 覆盖既有回流行（显式按业务键定位，避免依赖自增 id） */
    @InterceptorIgnore(tenantLine = "true")
    @Update("UPDATE lesson_attendance SET course_id = #{courseId}, role = #{role},"
            + " attendance_status = #{attendanceStatus}, check_in_at = #{checkInAt}, check_out_at = #{checkOutAt},"
            + " effective_minutes = #{effectiveMinutes}, classroom_status = #{classroomStatus},"
            + " actual_start = #{actualStart}, actual_end = #{actualEnd},"
            + " consumption_version = #{consumptionVersion}, source = #{source}, updated_at = NOW()"
            + " WHERE schedule_id = #{scheduleId} AND user_id = #{userId}")
    int updateByKeyIgnoreTenant(LessonAttendance row);

    /** 某课堂的全部出勤回流行 */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM lesson_attendance WHERE schedule_id = #{scheduleId} ORDER BY user_id")
    List<LessonAttendance> listByScheduleIgnoreTenant(@Param("scheduleId") String scheduleId);

    /**
     * 回写结算结果（S3）：{@code appointment_id} 是锚点，
     * {@code consumed_lessons / consumption_state} 是账务结论，{@code settled_at} 是生效时间。
     *
     * <p>这些列与 {@code student_lesson_flow} 分工明确：本表记「这一课次扣了多少」，
     * 流水记「账上动了几笔」。改判时两边都要改，对账靠流水唯一键。
     */
    @InterceptorIgnore(tenantLine = "true")
    @org.apache.ibatis.annotations.Update("UPDATE lesson_attendance SET"
            + " appointment_id = #{appointmentId}, class_index = #{classIndex},"
            + " consumed_lessons = #{consumedLessons}, consumption_state = #{consumptionState},"
            + " settled_at = #{settledAt}, updated_at = NOW()"
            + " WHERE schedule_id = #{scheduleId} AND user_id = #{userId}")
    int updateSettlementIgnoreTenant(@Param("scheduleId") String scheduleId,
                                     @Param("userId") String userId,
                                     @Param("appointmentId") Integer appointmentId,
                                     @Param("classIndex") Integer classIndex,
                                     @Param("consumedLessons") java.math.BigDecimal consumedLessons,
                                     @Param("consumptionState") String consumptionState,
                                     @Param("settledAt") java.time.LocalDateTime settledAt);
}
