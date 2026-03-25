//提供创建、修改、删除、检索Schedule的接口，供Controller调用
package src.main.java.com.reservation.service;

import src.main.java.com.reservation.entity.CourseQueryParam;
import src.main.java.com.reservation.entity.Schedule;
import java.util.List;
import java.util.Map;

/**
 * 课程排期 业务接口
 */
public interface ScheduleService {

    static List<Map<String, Object>> getCourseList(CourseQueryParam queryParam) ;

    /**
     * 创建排期
     */
    boolean createSchedule(Schedule schedule);

    /**
     * 修改排期
     */
    boolean updateSchedule(Schedule schedule);

    /**
     * 根据ID查询单条排期
     */
    Schedule getScheduleById(String scheduleId);

    /**
     * 查询排期列表（可根据课程ID/状态筛选）
     */
    List<Schedule> listSchedule(Schedule schedule);
}

