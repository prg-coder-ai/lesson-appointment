package com.reservation.mapper;

import com.reservation.entity.*;
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

    List<CourseSchedule> selectList(CourseScheduleCreateDTO  filterJson);

    String updateScheduleSites(IncSiteBody opPara);
    //根据输入的非空参数更新
    String update(CourseSchedule newData);
    void updateStatus(StatusBody scheduleStatus);
    void updateSites(IncSiteBody scheduleSitsInc);
    // 查询时间区间内的冲突排期（用于冲突检测）
    List<CourseSchedule> selectConflictingSchedules(
        @Param("teacherId") String teacherId,
        @Param("classroomId") String classroomId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime,
        @Param("excludeScheduleId") String excludeScheduleId // 排除当前排期（修改时用）
    );
    
    // 查询某排期的所有例外日期
    List<ScheduleException> selectExceptionsByScheduleId(Long scheduleId);

    void insertSchedule(CourseSchedule schedule);
    List<CourseSchedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);
}
