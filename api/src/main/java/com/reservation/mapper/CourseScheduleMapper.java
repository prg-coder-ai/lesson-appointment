package com.reservation.mapper;

import com.reservation.entity.*;
import com.reservation.dto.*;
import com.reservation.query.*;
import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
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

    /**
     * 查询指定教师的所有活跃排期，**忽略租户隔离**——供公开接口 /schedule/getAvailableSchedule 使用。
     *
     * <p>注意：原先还有一个「带租户条件」的同名版本（selectActiveSchedulesByTeacherId），
     * 因公开入口是唯一调用方、拆分后即成死代码，已删除——留着它只会让后人误以为
     * 公开入口该调那个，从而把本 bug 带回来。
     *
     * <p>该接口在 SecurityConfig / JwtAuthenticationFilter / WebMvcConfig 三处白名单里，
     * 是「免登录的公开预约入口」（家长或学生从公开链接进来选排期），请求没有租户上下文，
     * TenantContext.getTenantId() 为 null，租户插件会把 null 兜底成 -1 并给
     * course_schedule 与 course **两张表各追加一次** tenant_id = -1，恒不命中选择出空列表。
     *
     * <p>为什么在方法名里明写 IgnoreTenant 而不靠注释说明：将来若有人要为管理端
     * （教师看自己的排期）加同功能查询，方法名会逼他先想清楚要不要隔离——
     * 直接复用这个名字就等于默认公开，那是错的。
     */
    @InterceptorIgnore(tenantLine = "true")
    @Select("SELECT cs.* FROM course_schedule cs "
            + "INNER JOIN course c ON cs.course_id = c.course_id "
            + "WHERE c.teacher_id = #{teacherId} "
            + "AND cs.status = 'active' AND c.status = 'active' "
            + "ORDER BY cs.start_time ASC")
    List<CourseSchedule> selectActiveSchedulesByTeacherIdIgnoreTenant(@Param("teacherId") String teacherId);
}
