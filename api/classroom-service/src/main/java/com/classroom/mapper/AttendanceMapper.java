package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.dto.AttendanceHistoryVO;
import com.classroom.entity.Attendance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * 签到记录 Mapper。
 *
 * <p><b>为什么必须自己写 updateByKey</b>：{@code classroom_attendance} 是
 * {@code (schedule_id,user_id)} 复合主键，实体上没有 {@code @TableId}，
 * MyBatis-Plus 因此<b>不生成</b> {@code updateById} 语句——运行时调用会抛
 * {@code Invalid bound statement (not found) ... updateById}。
 * 这个坑很隐蔽：{@code insert} 不需要主键所以正常，只有更新路径会炸，
 * 而更新路径恰恰是下课收尾（出勤结论、有效时长）的唯一落库方式。
 *
 * <p>这里显式写全字段更新（含 null 覆盖），语义比 {@code UpdateWrapper} 更直白，
 * 也避免「MP 默认忽略 null」导致「离开时间清不掉」这类问题。
 */
@Mapper
public interface AttendanceMapper extends BaseMapper<Attendance> {

    @Update("UPDATE classroom_attendance SET "
            + "attendance_status = #{a.attendanceStatus}, "
            + "check_in_at = #{a.checkInAt}, "
            + "check_out_at = #{a.checkOutAt}, "
            + "effective_minutes = #{a.effectiveMinutes}, "
            + "late = #{a.late}, "
            + "manual_adjust = #{a.manualAdjust}, "
            + "adjust_reason = #{a.adjustReason}, "
            + "adjust_by = #{a.adjustBy} "
            + "WHERE schedule_id = #{a.scheduleId} AND user_id = #{a.userId}")
    int updateByKey(@Param("a") Attendance a);

    /**
     * 学生维度历史出勤查询（F2-07）：跨课堂聚合该用户全部出勤记录，
     * 关联 {@code classroom} 取课程名与上课时间，按发生时间倒序。
     * SQL 显式别名 AS 驼峰，与 {@link AttendanceHistoryVO} 字段精确匹配。
     */
    @Select("SELECT a.schedule_id AS scheduleId, c.course_name AS courseName, c.start_time AS startTime, "
            + "c.end_time AS endTime, a.attendance_status AS attendanceStatus, "
            + "a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt, "
            + "a.effective_minutes AS effectiveMinutes, a.late AS late "
            + "FROM classroom_attendance a LEFT JOIN classroom c ON a.schedule_id = c.schedule_id "
            + "WHERE a.user_id = #{userId} "
            + "ORDER BY COALESCE(a.check_in_at, a.check_out_at) DESC")
    List<AttendanceHistoryVO> selectHistoryByUserId(@Param("userId") String userId);
}
