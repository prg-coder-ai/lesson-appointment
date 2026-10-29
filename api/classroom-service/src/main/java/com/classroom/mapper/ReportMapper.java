package com.classroom.mapper;

import com.classroom.dto.ClassLearningStatVO;
import com.classroom.dto.StudentLearningStatVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 运营报表聚合查询（F7-04 / F8-04）。
 *
 * <p><b>为什么用相关子查询而不是多表 JOIN</b>：出勤、点名、作品是三张与课堂一对多的表，
 * 直接 JOIN 会出现笛卡尔放大（一节课 20 人 × 3 次点名 × 5 份作品 = 300 行），
 * 后续所有 COUNT 都得挂 DISTINCT，稍不留神就算错。相关子查询在「一次查几十到几百节课」
 * 这个量级上开销可接受，且口径一眼可读。
 */
@Mapper
public interface ReportMapper {

    /**
     * 按课堂聚合：出勤/迟到/缺勤/平均有效时长/点名应答/作品数。
     *
     * <p>时间维度用 {@code start_time}（计划开课时间）：学情报表是按「哪一天的课」看，
     * 而不是「哪一天收尾的课」——用 actual_end 会把跨零点的课算到第二天。
     */
    @Select("<script>"
            + "SELECT c.schedule_id AS scheduleId, c.course_name AS courseName, c.teacher_name AS teacherName, "
            + "  c.start_time AS startTime, c.status AS status, c.tenant_id AS tenantId, "
            + "  (SELECT COUNT(*) FROM classroom_attendance a WHERE a.schedule_id = c.schedule_id) AS total, "
            + "  (SELECT COUNT(*) FROM classroom_attendance a WHERE a.schedule_id = c.schedule_id "
            + "      AND a.attendance_status = 'ABSENT') AS absent, "
            + "  (SELECT COUNT(*) FROM classroom_attendance a WHERE a.schedule_id = c.schedule_id "
            + "      AND (a.attendance_status = 'LATE' OR a.late = 1)) AS late, "
            + "  (SELECT AVG(a.effective_minutes) FROM classroom_attendance a WHERE a.schedule_id = c.schedule_id "
            + "      AND a.attendance_status &lt;&gt; 'ABSENT') AS avgMinutes, "
            + "  (SELECT COUNT(*) FROM classroom_rollcall r WHERE r.schedule_id = c.schedule_id "
            + "      AND r.status = 'ANSWERED') AS rollcallAnswered, "
            + "  (SELECT COUNT(*) FROM classroom_submission s WHERE s.schedule_id = c.schedule_id) AS submissions "
            + "FROM classroom c "
            + "WHERE c.start_time &gt;= #{from} AND c.start_time &lt; #{to} "
            + "<if test='tenantId != null'> AND c.tenant_id = #{tenantId} </if>"
            + "ORDER BY c.start_time DESC"
            + "</script>")
    List<ClassLearningStatVO> selectByClass(@Param("from") LocalDateTime from,
                                            @Param("to") LocalDateTime to,
                                            @Param("tenantId") Long tenantId);

    /** 按学生聚合（跨课堂），缺勤多的排前面——运营最该先看的是这批人 */
    @Select("<script>"
            + "SELECT a.user_id AS userId, COUNT(*) AS total, "
            + "  SUM(CASE WHEN a.attendance_status = 'ABSENT' THEN 1 ELSE 0 END) AS absent, "
            + "  SUM(CASE WHEN a.attendance_status = 'LATE' OR a.late = 1 THEN 1 ELSE 0 END) AS late, "
            + "  AVG(CASE WHEN a.attendance_status &lt;&gt; 'ABSENT' THEN a.effective_minutes END) AS avgMinutes "
            + "FROM classroom_attendance a JOIN classroom c ON a.schedule_id = c.schedule_id "
            + "WHERE c.start_time &gt;= #{from} AND c.start_time &lt; #{to} "
            + "<if test='tenantId != null'> AND c.tenant_id = #{tenantId} </if>"
            + "GROUP BY a.user_id "
            + "ORDER BY absent DESC, total DESC "
            + "LIMIT 200"
            + "</script>")
    List<StudentLearningStatVO> selectByStudent(@Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to,
                                                @Param("tenantId") Long tenantId);

    /** 导出用：逐行出勤明细（CSV 流式输出） */
    @Select("<script>"
            + "SELECT a.schedule_id AS scheduleId, c.course_name AS courseName, c.teacher_name AS teacherName, "
            + "  c.start_time AS startTime, c.status AS status, "
            + "  a.user_id AS userId, a.attendance_status AS attendanceStatus, "
            + "  a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt, "
            + "  a.effective_minutes AS effectiveMinutes, a.late AS late, "
            + "  a.manual_adjust AS manualAdjust, a.adjust_reason AS adjustReason, a.adjust_by AS adjustBy "
            + "FROM classroom_attendance a JOIN classroom c ON a.schedule_id = c.schedule_id "
            + "WHERE c.start_time &gt;= #{from} AND c.start_time &lt; #{to} "
            + "<if test='tenantId != null'> AND c.tenant_id = #{tenantId} </if>"
            + "ORDER BY c.start_time, a.user_id"
            + "</script>")
    List<java.util.Map<String, Object>> selectAttendanceRows(@Param("from") LocalDateTime from,
                                                             @Param("to") LocalDateTime to,
                                                             @Param("tenantId") Long tenantId);

    /** 导出用：录制清单 */
    @Select("<script>"
            + "SELECT r.recording_id AS recordingId, r.schedule_id AS scheduleId, c.course_name AS courseName, "
            + "  r.start_time AS startTime, r.end_time AS endTime, r.status AS status, "
            + "  r.retention_days AS retentionDays, r.expire_at AS expireAt, r.oss_key AS ossKey "
            + "FROM classroom_recording r LEFT JOIN classroom c ON r.schedule_id = c.schedule_id "
            + "WHERE r.start_time &gt;= #{from} AND r.start_time &lt; #{to} "
            + "ORDER BY r.start_time DESC"
            + "</script>")
    List<java.util.Map<String, Object>> selectRecordingRows(@Param("from") LocalDateTime from,
                                                            @Param("to") LocalDateTime to);
}
