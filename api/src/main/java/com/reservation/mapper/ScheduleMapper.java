package com.reservation.mapper;

import com.reservation.entity.CourseSchedule;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
 
import java.util.Optional;
import java.util.List;
import java.util.Map; 
import java.util.Date;
 

@Mapper
public interface ScheduleMapper extends BaseMapper<CourseSchedule> {
    void insertSchedule(CourseSchedule schedule);

    CourseSchedule selectScheduleById(String scheduleId);

    List<CourseSchedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);

    void updateSchedule(CourseSchedule existingSchedule);
    // 无需编写SQL，BaseMapper已提供CRUD方法
}
