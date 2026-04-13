import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CourseScheduleMapper {
    // 插入排期
    int insert(CourseSchedule schedule);
    
    // 根据ID查询
    CourseSchedule selectById(Long id);
    List<CourseSchedule> selectList(CourseSchedule filterJson);
    String updateScheduleSites(incSiteBody opPara);
    //根据输入的非空参数更新
    String update(CourseSchedule newData);

    // 查询时间区间内的冲突排期（用于冲突检测）
    List<CourseSchedule> selectConflictingSchedules(
        @Param("teacherId") Long teacherId,
        @Param("classroomId") Long classroomId,
        @Param("startTime") LocalDateTime startTime,
        @Param("endTime") LocalDateTime endTime,
        @Param("excludeScheduleId") Long excludeScheduleId // 排除当前排期（修改时用）
    );
    
    // 查询某排期的所有例外日期
    List<ScheduleException> selectExceptionsByScheduleId(Long scheduleId);

}

@Mapper
public interface ScheduleExceptionMapper {
    int insert(ScheduleException exception);
}
 