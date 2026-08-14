package com.reservation.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.reservation.entity.TeacherAvailableTime;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 教师可预约时间段 Mapper
 * 继承 BaseMapper 获得内置 CRUD
 */
@Mapper
public interface TeacherAvailableTimeMapper extends BaseMapper<TeacherAvailableTime> {

    /**
     * 按教师ID查询全部时间段（周模板优先，再按 day_of_week 排序）
     */
    @Select("SELECT * FROM teacher_available_time WHERE teacher_id = #{teacherId} ORDER BY time_type ASC, day_of_week ASC, specific_date ASC, start_time ASC")
    List<TeacherAvailableTime> listByTeacherId(@Param("teacherId") String teacherId);

    /**
     * 按教师ID删除全部时间段（修改时先删后插）
     */
    @Delete("DELETE FROM teacher_available_time WHERE teacher_id = #{teacherId}")
    int deleteByTeacherId(@Param("teacherId") String teacherId);
}
