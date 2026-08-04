package com.reservation.mapper;

import com.reservation.entity.*;
import com.reservation.dto.*;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;

@Mapper
public interface CourseScheduleMapper {
    // 插入排期
    String insert(CourseSchedule schedule);
    
    // 根据ID查询
    CourseSchedule selectById(String id);
    

    List<CourseSchedule> selectList(ScheduleCreateDTO  filterJson);

    String updateScheduleSites(IncSiteBody opPara);
    //根据输入的非空参数更新
    void update(CourseSchedule newData);
    void updateStatus(StatusBody scheduleStatus);
    void updateSites(IncSiteBody scheduleSitsInc);  
    
    // 查询某排期的所有例外日期
    List<ScheduleException> selectExceptionsByScheduleId(Long scheduleId);

    void insertSchedule(CourseSchedule schedule);
    List<CourseSchedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);
 
     // 删除指定id的排期 deleteById
    void deleteById(@Param("id") String id);
    int deleteByCourseId(@Param("courseId") String courseId);
}
