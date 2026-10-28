package com.classroom.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.classroom.entity.Attendance;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

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
            + "adjust_reason = #{a.adjustReason} "
            + "WHERE schedule_id = #{a.scheduleId} AND user_id = #{a.userId}")
    int updateByKey(@Param("a") Attendance a);
}
