package src.main.java.com.reservation.mapper;

import src.main.java.com.reservation.entity.Schedule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * ScheduleMapper接口，对应schedule表CRUD操作，匹配CourseService中的方法
 */
@Mapper
public interface ScheduleMapper {

    /**
     * 根据排期ID查询排期
     * @param scheduleId 排期ID
     * @return 排期信息
     */
    Schedule selectScheduleById(@Param("scheduleId") String scheduleId);

    /**
     * 校验非重复排期的时间冲突（同一课程，同一时间段不可重复）
     * @param courseId 课程ID
     * @param startTime 开始时间
     * @param endTime 结束时间
     * @return 冲突的排期信息（无冲突则返回null）
     */
    Schedule selectScheduleByTime(@Param("courseId") String courseId, @Param("startTime") String startTime, @Param("endTime") String endTime);

    /**
     * 根据排期ID查询关联的教师ID（用于排期归属校验）
     * @param scheduleId 排期ID
     * @return 教师ID
     */
    String selectTeacherIdByScheduleId(@Param("scheduleId") String scheduleId);

    /**
     * 插入课程排期
     * @param schedule 排期实体
     * @return 影响行数
     */
    int insertSchedule(Schedule schedule);

    /**
     * 更新课程排期
     * @param schedule 排期实体（含更新的字段）
     * @return 影响行数
     */
    int updateSchedule(Schedule schedule);
}
