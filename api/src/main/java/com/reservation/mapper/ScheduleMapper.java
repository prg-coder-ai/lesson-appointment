package src.main.java.com.reservation.mapper; 

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import src.main.java.com.reservation.entity.Schedule;
import org.apache.ibatis.annotations.Mapper;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Date;
import java.util.List;

@Mapper
public interface ScheduleMapper extends BaseMapper<Schedule> {
    void insertSchedule(Schedule schedule);

    Schedule selectScheduleById(String scheduleId);

    List<Schedule> selectScheduleByTime(String courseId, Date startTime, Date endTime);

    void updateSchedule(Schedule existingSchedule);
    // 无需编写SQL，BaseMapper已提供CRUD方法
}
