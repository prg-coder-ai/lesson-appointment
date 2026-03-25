package src.main.java.com.reservation.service.impl; 

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import src.main.java.com.reservation.entity.Schedule;
import src.main.java.com.reservation.mapper.ScheduleMapper;
import src.main.java.com.reservation.service.ScheduleService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.Date;
import java.util.List;

@Service
public class ScheduleServiceImpl extends ServiceImpl<ScheduleMapper, Schedule> implements ScheduleService {

    /**
     * 1. 创建排期
     */
    @Override
    public boolean createSchedule(Schedule schedule) {
        // 1. 基础校验
        validateSchedule(schedule);

        // 2. 默认状态：可用
        if (!StringUtils.hasText(schedule.getStatus())) {
            schedule.setStatus("available");
        }

        // 3. 插入数据库
        return this.save(schedule);
    }

    /**
     * 2. 修改排期
     */
    @Override
    public boolean updateSchedule(Schedule schedule) {
        // 1. 校验排期ID必须存在
        if (!StringUtils.hasText(schedule.getScheduleId())) {
            throw new RuntimeException("排期ID不能为空");
        }

        // 2. 校验排期参数
        validateSchedule(schedule);

        // 3. 更新数据库
        return this.updateById(schedule);
    }

    /**
     * 3. 根据ID查询单条排期
     */
    @Override
    public Schedule getScheduleById(String scheduleId) {
        if (!StringUtils.hasText(scheduleId)) {
            throw new RuntimeException("排期ID不能为空");
        }
        return this.getById(scheduleId);
    }

    /**
     * 4. 查询排期列表
     * 支持按：课程ID、状态、重复标识筛选
     */
    @Override
    public List<Schedule> listSchedule(Schedule schedule) {
        LambdaQueryWrapper<Schedule> wrapper = new LambdaQueryWrapper<>();

        // 拼接查询条件
        wrapper.eq(StringUtils.hasText(schedule.getCourseId()), Schedule::getCourseId, schedule.getCourseId());
        wrapper.eq(StringUtils.hasText(schedule.getStatus()), Schedule::getStatus, schedule.getStatus());
        wrapper.eq(schedule.getIsRepeat() != null, Schedule::getIsRepeat, schedule.getIsRepeat());

        // 按开始时间正序排序
        wrapper.orderByAsc(Schedule::getStartTime);

        return this.list(wrapper);
    }

    // ==================== 通用校验方法 ====================
    private void validateSchedule(Schedule schedule) {
        // 1. 时间校验：结束时间必须大于开始时间
        Date startTime = schedule.getStartTime();
        Date endTime = schedule.getEndTime();
        if (startTime == null || endTime == null) {
            throw new RuntimeException("开始时间/结束时间不能为空");
        }
        if (endTime.before(startTime)) {
            throw new RuntimeException("结束时间不能早于开始时间");
        }

        // 2. 重复周次校验：开启重复时，周次必须填写（1-7）
        Boolean isRepeat = schedule.getIsRepeat();
        if (isRepeat != null && isRepeat) {
            Integer repeatWeek = schedule.getRepeatWeek();
            if (repeatWeek == null || repeatWeek < 1 || repeatWeek > 7) {
                throw new RuntimeException("重复周次必须为1-7之间的数字");
            }
        }
    }
}