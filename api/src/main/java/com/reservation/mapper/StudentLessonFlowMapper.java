package com.reservation.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.StudentLessonFlow;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.util.List;

/**
 * 课时流水 Mapper。
 *
 * <p>唯一键 {@code uk_slf_biz(tenant_id, biz_key)} 是防重复扣费的核心：
 * 插入撞键即代表该课次已结算过。调用方捕获 {@code DuplicateKeyException} 按幂等成功处理，
 * 不要去「先查再插」——并发下两个线程都会查不到。
 */
@Mapper
public interface StudentLessonFlowMapper extends BaseMapper<StudentLessonFlow> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COUNT(1) FROM student_lesson_flow WHERE tenant_id = #{tenantId} AND biz_key = #{bizKey}")
    int countByBizKey(@Param("tenantId") Long tenantId, @Param("bizKey") String bizKey);

    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM student_lesson_flow WHERE tenant_id = #{tenantId} AND biz_key = #{bizKey} LIMIT 1")
    StudentLessonFlow selectByBizKey(@Param("tenantId") Long tenantId, @Param("bizKey") String bizKey);

    /**
     * 显式插流水（显式 tenant_id）。冲突由唯一键抛 DuplicateKeyException，调用方按幂等处理。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Insert("INSERT INTO student_lesson_flow"
            + " (tenant_id, flow_id, student_id, booking_id, schedule_id, class_index, appointment_id,"
            + "  change_lessons, remaining_after, source, biz_key, reason, operator_id)"
            + " VALUES (#{tenantId}, #{flowId}, #{studentId}, #{bookingId}, #{scheduleId}, #{classIndex},"
            + "  #{appointmentId}, #{changeLessons}, #{remainingAfter}, #{source}, #{bizKey}, #{reason}, #{operatorId})")
    int insertExplicit(StudentLessonFlow flow);

    /** 对账：某学生全部流水合计（应与 balance.used_lessons 相等） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COALESCE(SUM(change_lessons), 0) FROM student_lesson_flow"
            + " WHERE tenant_id = #{tenantId} AND student_id = #{studentId}")
    BigDecimal sumChangeByStudent(@Param("tenantId") Long tenantId, @Param("studentId") String studentId);

    /** 某课次的全部流水（排查重复扣费用） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT * FROM student_lesson_flow WHERE appointment_id = #{appointmentId} ORDER BY id")
    List<StudentLessonFlow> listByAppointment(@Param("appointmentId") Integer appointmentId);

    // ==================== 我的课时（2026-10-28 展示层） ====================

    /**
     * 学生流水分页（含课程名）。
     *
     * <p>课程名要经 {@code booking → course_schedule} 反查：流水表只存了 booking_id，
     * 而学生认识的是课程名，不是 id。
     *
     * <p>显式 {@code @InterceptorIgnore} + 显式 {@code f.tenant_id} 过滤：
     * 本语句带 LEFT JOIN，交给插件自动拼租户列容易拼错表别名（会拼到 booking 上而不是 f 上），
     * 反而查不到或串数据。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT f.id AS id,"
            + "       f.change_lessons AS changeLessons,"
            + "       f.remaining_after AS remainingAfter,"
            + "       f.source AS source,"
            + "       f.reason AS reason,"
            + "       f.class_index AS classIndex,"
            + "       cs.name AS courseName,"
            + "       f.create_time AS createTime"
            + "  FROM student_lesson_flow f"
            + "  LEFT JOIN booking b ON b.booking_id = f.booking_id"
            + "  LEFT JOIN course_schedule cs ON cs.schedule_id = b.schedule_id"
            + " WHERE f.tenant_id = #{tenantId} AND f.student_id = #{studentId}"
            + " ORDER BY f.id DESC"
            + " LIMIT #{offset}, #{limit}")
    List<com.reservation.vo.LessonFlowVO> pageByStudent(@Param("tenantId") Long tenantId,
                                                        @Param("studentId") String studentId,
                                                        @Param("offset") int offset,
                                                        @Param("limit") int limit);

    /** 学生流水总数（与 {@link #pageByStudent} 同口径，勿改成查 balance） */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT COUNT(1) FROM student_lesson_flow WHERE tenant_id = #{tenantId} AND student_id = #{studentId}")
    long countByStudent(@Param("tenantId") Long tenantId, @Param("studentId") String studentId);
}
