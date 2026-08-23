package com.reservation.mapper;

import com.reservation.entity.*;
import com.reservation.dto.*;
import com.reservation.query.*;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;

@Mapper
public interface CourseScheduleMapper extends BaseMapper<CourseSchedule> {
    // 同课程下按 ScheduleCreateDTO 条件查询排期（避免与 BaseMapper.selectList(Wrapper) 同名冲突）
    List<CourseSchedule> selectByCreateDto(ScheduleCreateDTO filterJson);
    List<CourseSchedule> selectListByPage(ScheduleQueryPage query);

    Integer selectCountByCondition(@Param("query") ScheduleQueryPage query);
    
    int updateStatus(StatusBody scheduleStatus);
    int updateSites(IncSiteBody scheduleSitsInc);
    
    // 查询某排期的所有例外日期
    List<ScheduleException> selectExceptionsByScheduleId(Long scheduleId);

    void insertSchedule(CourseSchedule schedule);
    List<CourseSchedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);
 
    int deleteByCourseId(@Param("courseId") String courseId);

    // 查询指定教师的所有活跃排期（通过JOIN course表过滤teacherId）
    List<CourseSchedule> selectActiveSchedulesByTeacherId(@Param("teacherId") String teacherId);
}
