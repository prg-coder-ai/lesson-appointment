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

    /**
     * 按ID加行锁读取排期（FOR UPDATE）。
     *
     * <p>用途：把所有「占席位」的写路径（学生预定 / 改订 / 指定学生 / 候补递补）串行化到
     * 同一把排期行锁上。名额校验读的是「其他行的聚合计数」，随后的占位写入却是本行——
     * 不加锁时两个并发递补者会各自读到“还有空位”，各自 CAS 成功，最终同一排期两个 booked、超出总席位。
     */
    CourseSchedule selectByIdForUpdate(@Param("scheduleId") String scheduleId);
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
