package com.reservation.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 教师个人中心统计（只读聚合）。
 *
 * <p>teacher 与 course / booking 的归属关系：course.teacher_id、booking.teacher_id 均是
 * 教师 userId；排期表本身没有 teacher_id，需经 course_schedule.course_id 关联 course 反查。
 *
 * <p>租户隔离：以下全部为普通 SQL，由 MyBatis-Plus 的 TenantLineInnerInterceptor 自动拼接
 * tenant_id 条件（教师端有租户上下文），无需在此手写 tenant 过滤，也不能加
 * {@code @InterceptorIgnore}——那会让教师跨租户看到别家数据。
 */
@Mapper
public interface TeacherStatsMapper {

    /** 教师名下课程数量（含各状态，软删状态由业务层另行约定，此处按表内全量计） */
    @Select("SELECT COUNT(*) FROM course WHERE teacher_id = #{teacherId}")
    int countCoursesByTeacher(@Param("teacherId") String teacherId);

    /** 教师名下排期数量（经 course_id 关联课程反查归属） */
    @Select("SELECT COUNT(*) FROM course_schedule cs "
            + "INNER JOIN course c ON cs.course_id = c.course_id "
            + "WHERE c.teacher_id = #{teacherId}")
    int countSchedulesByTeacher(@Param("teacherId") String teacherId);

    /**
     * 预订过该教师排期的学生人数（按 student_id 去重）。
     *
     * <p>excludedStatuses 传「不占席位」的状态集合（BookingStatus.NON_OCCUPYING + delete），
     * 这样候补/已取消/被拒/已删除的学生不会被算成「预订人数」。
     */
    @Select("<script>"
            + "SELECT COUNT(DISTINCT b.student_id) FROM booking b "
            + "WHERE b.teacher_id = #{teacherId} "
            + "<if test='excludedStatuses != null and excludedStatuses.size() > 0'>"
            + "AND b.status NOT IN "
            + "<foreach collection='excludedStatuses' item='st' open='(' separator=',' close=')'>#{st}</foreach>"
            + "</if>"
            + "</script>")
    int countBookedStudentsByTeacher(@Param("teacherId") String teacherId,
                                     @Param("excludedStatuses") List<String> excludedStatuses);

    /**
     * 指定时间段内该教师已完成（status=completed）的课次数量。
     *
     * <p>时间窗入参是 UTC（appointment.appointment_datetime 自 2026-10-08 起统一存 UTC），
     * 区间左闭右开 [from, to)，由调用方按用户本地时区换算月界后传入。
     */
    @Select("SELECT COUNT(*) FROM appointment a "
            + "INNER JOIN booking b ON a.booking_id = b.booking_id "
            + "WHERE b.teacher_id = #{teacherId} "
            + "AND a.status = 'completed' "
            + "AND a.appointment_datetime >= #{from} "
            + "AND a.appointment_datetime < #{to}")
    int countCompletedLessonsByTeacher(@Param("teacherId") String teacherId,
                                       @Param("from") LocalDateTime from,
                                       @Param("to") LocalDateTime to);
}
