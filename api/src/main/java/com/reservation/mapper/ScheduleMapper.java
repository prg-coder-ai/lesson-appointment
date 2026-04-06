package com.reservation.mapper; 
import com.reservation.entity.Schedule;

import com.baomidou.mybatisplus.core.mapper.BaseMapper; 
 
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

 
import java.util.Optional;
import java.util.List;
import java.util.Map; 
import java.util.Date;
 

@Mapper
public interface ScheduleMapper extends BaseMapper<Schedule> {
    void insertSchedule(Schedule schedule);

    Schedule selectScheduleById(String scheduleId);

    List<Schedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);

    void updateSchedule(Schedule existingSchedule);
    // 无需编写SQL，BaseMapper已提供CRUD方法
}
