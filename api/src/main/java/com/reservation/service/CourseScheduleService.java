package com.reservation.service;

import com.reservation.entity.CourseSchedule;
import com.reservation.entity.CourseScheduleCreateDTO;
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.ScheduleExceptionMapper;

import jakarta.validation.constraints.NotBlank;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.BeanUtils;
import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CourseScheduleService {

    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private ScheduleExceptionMapper exceptionMapper;

    // 创建排期（含冲突检测）
    @Transactional(rollbackFor = Exception.class)
    public Map<String, String> createSchedule(CourseScheduleCreateDTO dto) {
        // 1. 基础校验：结束时间 > 开始时间
        if (dto.getEndTime().isBefore(dto.getStartTime())) {
            throw new IllegalArgumentException("结束时间必须晚于开始时间");
        }

        // 2. 转换DTO为实体
        CourseSchedule schedule = new CourseSchedule();
        BeanUtils.copyProperties(dto, schedule);
        // 将repeatDays数组转为逗号分隔的字符串
        if (dto.getRepeatDays() != null && !dto.getRepeatDays().isEmpty()) {
            schedule.setRepeatDays(dto.getRepeatDays().stream()
                .map(String::valueOf)
                .collect(Collectors.joining(",")));
        }

        // 3. 冲突检测：先展开重复规则，检查每个实例是否冲突
        List<LocalDateTime[]> scheduleInstances = expandScheduleInstances(schedule);
        for (LocalDateTime[] instance : scheduleInstances) {
            LocalDateTime start = instance[0];
            LocalDateTime end = instance[1];
            List<CourseSchedule> conflicts = scheduleMapper.selectConflictingSchedules(
                dto.getTeacherId(), dto.getClassroomId(), start, end, null
            );
            if (!conflicts.isEmpty()) {
                throw new IllegalArgumentException("时间冲突：" + start + " 至 " + end + " 教师或教室已被占用");
            }
        }
        String  Id = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        schedule.setScheduleId( Id);
        // 4. 插入排期
        scheduleMapper.insertSchedule(schedule);
       
        return  Collections.singletonMap("Id", Id);
    }

    // 展开重复规则，生成所有排期实例（返回 [开始时间, 结束时间] 的列表）
    private List<LocalDateTime[]> expandScheduleInstances(CourseSchedule schedule) {
        List<LocalDateTime[]> instances = new ArrayList<>();
        @NotBlank(message = "开始时间不能为空") LocalDateTime currentStart = schedule.getStartTime();
        @NotBlank(message = "结束时间不能为空") LocalDateTime currentEnd = schedule.getEndTime();
        long durationMinutes = java.time.Duration.between(currentStart, currentEnd).toMinutes();

        // 不重复：直接添加
        if (schedule.getRepeatType() == 0) {
            instances.add(new LocalDateTime[]{currentStart, currentEnd});
            return instances;
        }

        // 重复排期：循环生成直到结束时间
        LocalDateTime endT;
        LocalDate endDate =schedule.getRepeatEndDate();
        // 把endDate转为包含时间的endT
        if (endDate != null) {
            // 用排期的起始时间的小时分钟秒补全endDate
            endT = endDate.atTime(currentStart.getHour(), currentStart.getMinute(), currentStart.getSecond());
        } else {
            endT = null;
        }
        LocalDateTime repeatEnd = endT != null ? endT : currentStart.plusYears(1); // 默认重复1年
        List<Integer> repeatDaysList = parseRepeatDays(schedule.getRepeatDays());

        while (currentStart.isBefore(repeatEnd)) {
            // 每周重复：检查当前日期是否在repeatDays中
            if (schedule.getRepeatType() == 2) {
                int dayOfWeek = currentStart.getDayOfWeek().getValue(); // 1=周一...7=周日
                if (!repeatDaysList.contains(dayOfWeek)) {
                    currentStart = currentStart.plusDays(1);
                    currentEnd = currentStart.plusMinutes(durationMinutes);
                    continue;
                }
            }

            // 添加当前实例
            instances.add(new LocalDateTime[]{currentStart, currentEnd});

            // 移动到下一个重复周期
            switch (schedule.getRepeatType()) {
                case 1: // 每天
                    currentStart = currentStart.plusDays(schedule.getRepeatInterval());
                    break;
                case 2: // 每周
                    currentStart = currentStart.plusWeeks(schedule.getRepeatInterval());
                    break;
                case 3: // 每月
                    currentStart = currentStart.plusMonths(schedule.getRepeatInterval());
                    break;
            }
            currentEnd = currentStart.plusMinutes(durationMinutes);
        }

        return instances;
    }

    // 解析repeatDays字符串为整数列表
    private List<Integer> parseRepeatDays(String repeatDays) {
        if (repeatDays == null || repeatDays.isEmpty()) {
            return new ArrayList<>();
        }
        return Arrays.stream(repeatDays.split(","))
            .map(Integer::parseInt)
            .collect(Collectors.toList());
    }

    
@Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public   String updateStatus (StatusBody data) {       
         System.out.println("updateStatus called with scheduleId: " + data);
         scheduleMapper.updateStatus(data);
        return  data.getScheduleId();
    }

  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String update(CourseSchedule Obj) { 
         System.out.println("update : " +Obj);         
         scheduleMapper.update(Obj);
        return Obj.getScheduleId();
    }

//更新可用数 incSiteBody { "inc":1、-1 ，"id":scheduleId)
  @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public String updateScheduleSites(IncSiteBody Obj) {
         System.out.println("updateScheduleSites : " +Obj);         
         scheduleMapper.updateSites(Obj);
        return Obj.getScheduleId();
    }


// 
  @Transactional(propagation = Propagation.REQUIRED )
    public CourseSchedule selectById(String id) { 
            
         return scheduleMapper.selectById(id);
    }

@Transactional(propagation = Propagation.REQUIRED)
    public List<CourseSchedule> selectList(CourseScheduleCreateDTO obj) {
            
         return scheduleMapper.selectList(obj); 
    }
}


// checkScheduleOwner：
// 用于检查排期(scheduleId)是否归属于指定教师(teacherId)。先查找排期，若不存在则抛出“排期不存在”；
// 再取排期对应课程ID，校验课程有效且归属该教师，否则抛出无权限或资源不存在等业务异常。
/*
    public void checkScheduleOwner(String scheduleId, String teacherId) {
        CourseSchedule schedule = scheduleMapper.selectById(scheduleId);
        if (schedule == null) {
            throw new ResourceNotFoundException("排期不存在");
        }
        String courseId = schedule.getCourseId();
        if (courseId == null) {
            throw new BusinessException("排期关联的课程无效");
        }
        Course course = courseMapper.selectCourseById(courseId);
        if (course == null) {
            throw new ResourceNotFoundException("排期关联的课程不存在");
        }
        if (!teacherId.equals(course.getTeacherId())) {
            throw new BusinessException("没有操作该排期的权限");
        }
    }
*/
/**
 * 分析: BeanCreationException 和 SAXParseException 很可能是 CourseScheduleMapper.xml 配置错误（如 XML 第32行有非法字符、标签不闭合等）。
 * 1. 通常是 XML 配置里 <resultMap>、<select>、<update>、<sql> 等标签书写有误，引发 SAX 解析异常。
 * 2. 修复方法:
 *    - 仔细检查 CourseScheduleMapper.xml 第32行左右是否有:
 *      a. 非法字符（如 &、<、> 未转义等）
 *      b. 标签未闭合或写法错误（如 <if test="..."> 未正确结束、缺</if>）
 *      c. 属性拼写/引号丢失
 *    - 通常MyBatis相关Bean注入失败均为XML配置或Mapper接口/注解问题，与Service层无关。
 * 3. 建议:
 *   - 打开 CourseScheduleMapper.xml，用带行号的编辑器定位第32行，逐一排查。
 *   - 确认所有 XML 标签已闭合，字符实体(&)等已转义，SQL片段无冗余尖括号。
 * 4. 该 Service 层无需额外代码（问题在Mapper XML层），建议修复XML后重启服务即可。
 */