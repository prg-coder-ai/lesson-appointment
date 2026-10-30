# 课程排期实现方案 Spring Boot + MyBatis + Thymeleaf

我将结合你的 **Spring Boot + MyBatis + Thymeleaf** 技术栈，提供一套**可直接落地、覆盖核心功能**的课程排期实现方案，包含**数据库设计、实体类、Service层（含冲突检测、重复规则展开）、Controller层、前端展示**全流程代码。

---

# 一、核心设计思路

1. **数据存储**：用**简化重复规则**（满足80%课程排期需求）+ **例外日期表**（处理调课/停课），后期可无缝升级为 iCalendar RRULE 标准。

2. **核心功能**：

    - 支持单次/重复排期（每天/每周/每月）

    - 教师/教室冲突检测

    - 例外日期处理（取消/调课）

    - 排期实例展开（将重复规则转换为具体日程）

3. **技术选型**：

    - 日期时间：Java 8+ `java.time` 包（`LocalDateTime`、`DayOfWeek`）

    - 数据库：MySQL（`datetime` 类型存储时间）

    - 简化代码：Lombok

---

# 二、第一步：数据库表设计

```SQL

-- 1. 课程排期主表
CREATE TABLE course_schedule (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '排期ID',
    course_id BIGINT NOT NULL COMMENT '课程ID',
    teacher_id BIGINT NOT NULL COMMENT '教师ID',
    classroom_id BIGINT NOT NULL COMMENT '教室ID',
    
    -- 基础时间（单次排期直接用，重复排期作为起始时间）
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME NOT NULL COMMENT '结束时间',
    
    -- 简化重复规则
    repeat_type TINYINT DEFAULT 0 COMMENT '重复类型：0=不重复，1=每天，2=每周，3=每月',
    repeat_interval INT DEFAULT 1 COMMENT '重复间隔（如每2周一次=2）',
    repeat_days VARCHAR(255) COMMENT '重复的星期几：1=周一，2=周二...7=周日，逗号分隔（仅repeat_type=2时有效）',
    repeat_end_date DATETIME COMMENT '重复结束时间',
    
    -- 业务字段
    status TINYINT DEFAULT 1 COMMENT '0=已取消，1=正常',
    description VARCHAR(500) COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_course_id (course_id),
    INDEX idx_teacher_id (teacher_id),
    INDEX idx_classroom_id (classroom_id),
    INDEX idx_time_range (start_time, end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程排期主表';

-- 2. 排期例外日期表（处理调课/停课）
CREATE TABLE schedule_exception (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    schedule_id BIGINT NOT NULL COMMENT '关联的排期ID',
    original_date DATE NOT NULL COMMENT '原排期日期',
    exception_type TINYINT NOT NULL COMMENT '0=取消，1=调课',
    new_start_time DATETIME COMMENT '调课的新开始时间（exception_type=1时必填）',
    new_end_time DATETIME COMMENT '调课的新结束时间（exception_type=1时必填）',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_schedule_id (schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排期例外日期表';
```

---

# 三、第二步：实体类与DTO

## 1. 实体类（Entity）

```Java

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class CourseSchedule {
    private Long id;
    private Long courseId;
    private Long teacherId;
    private Long classroomId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer repeatType; // 0=不重复，1=每天，2=每周，3=每月
    private Integer repeatInterval;
    private String repeatDays; // 逗号分隔的星期几：1=周一...7=周日
    private LocalDateTime repeatEndDate;
    private Integer status;
    private String description;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

@Data
public class ScheduleException {
    private Long id;
    private Long scheduleId;
    private LocalDate originalDate;
    private Integer exceptionType; // 0=取消，1=调课
    private LocalDateTime newStartTime;
    private LocalDateTime newEndTime;
    private LocalDateTime createTime;
}
```

## 2. DTO（接收前端创建/修改排期的参数）

```Java

import lombok.Data;
import javax.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class CourseScheduleCreateDTO {
    @NotNull(message = "课程ID不能为空")
    private Long courseId;
    
    @NotNull(message = "教师ID不能为空")
    private Long teacherId;
    
    @NotNull(message = "教室ID不能为空")
    private Long classroomId;
    
    @NotNull(message = "开始时间不能为空")
    private LocalDateTime startTime;
    
    @NotNull(message = "结束时间不能为空")
    private LocalDateTime endTime;
    
    private Integer repeatType = 0;
    private Integer repeatInterval = 1;
    private List<Integer> repeatDays; // 前端传数组，如 [1,3,5]
    private LocalDateTime repeatEndDate;
    private String description;
}
```

---

# 四、第三步：Mapper层（MyBatis）

## 1. Mapper接口

```Java

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
```

## 2. Mapper XML

```XML

<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.mapper.CourseScheduleMapper">

    <insert id="insert" parameterType="com.example.entity.CourseSchedule" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO course_schedule (course_id, teacher_id, classroom_id, start_time, end_time, repeat_type, repeat_interval, repeat_days, repeat_end_date, description)
        VALUES (#{courseId}, #{teacherId}, #{classroomId}, #{startTime}, #{endTime}, #{repeatType}, #{repeatInterval}, #{repeatDays}, #{repeatEndDate}, #{description})
    </insert>

    <select id="selectById" resultType="com.example.entity.CourseSchedule">
        SELECT * FROM course_schedule WHERE id = #{id}
    </select>

    <!-- 冲突检测核心SQL：查询时间区间有交集的排期 -->
    <select id="selectConflictingSchedules" resultType="com.example.entity.CourseSchedule">
        SELECT * FROM course_schedule
        WHERE status = 1
        AND (teacher_id = #{teacherId} OR classroom_id = #{classroomId})
        AND start_time &lt; #{endTime}  -- 新排期开始 < 已有排期结束
        AND end_time > #{startTime}    -- 新排期结束 > 已有排期开始
        <if test="excludeScheduleId != null">
            AND id != #{excludeScheduleId}
        </if>
    </select>

    <select id="selectExceptionsByScheduleId" resultType="com.example.entity.ScheduleException">
        SELECT * FROM schedule_exception WHERE schedule_id = #{scheduleId}
    </select>

</mapper>
```

---

# 五、第四步：Service层（核心业务逻辑）

## 1. 排期创建与冲突检测

```Java

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.BeanUtils;
import javax.annotation.Resource;
import java.time.LocalDateTime;
import java.time.DayOfWeek;
import java.util.List;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.stream.Collectors;

@Service
public class CourseScheduleService {

    @Resource
    private CourseScheduleMapper scheduleMapper;
    @Resource
    private ScheduleExceptionMapper exceptionMapper;

    // 创建排期（含冲突检测）
    @Transactional(rollbackFor = Exception.class)
    public Long createSchedule(CourseScheduleCreateDTO dto) {
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

        // 4. 插入排期
        scheduleMapper.insert(schedule);
        return schedule.getId();
    }

    // 展开重复规则，生成所有排期实例（返回 [开始时间, 结束时间] 的列表）
    private List<LocalDateTime[]> expandScheduleInstances(CourseSchedule schedule) {
        List<LocalDateTime[]> instances = new ArrayList<>();
        LocalDateTime currentStart = schedule.getStartTime();
        LocalDateTime currentEnd = schedule.getEndTime();
        long durationMinutes = java.time.Duration.between(currentStart, currentEnd).toMinutes();

        // 不重复：直接添加
        if (schedule.getRepeatType() == 0) {
            instances.add(new LocalDateTime[]{currentStart, currentEnd});
            return instances;
        }

        // 重复排期：循环生成直到结束时间
        LocalDateTime repeatEnd = schedule.getRepeatEndDate() != null ? schedule.getRepeatEndDate() : currentStart.plusYears(1); // 默认重复1年
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
}
```

---

# 六、第五步：Controller层

```Java

import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import javax.annotation.Resource;

@RestController
@RequestMapping("/api/course/schedule")
public class CourseScheduleController {

    @Resource
    private CourseScheduleService scheduleService;

    // 创建排期
    @PostMapping("/create")
    public Result<Long> createSchedule(@Validated @RequestBody CourseScheduleCreateDTO dto) {
        Long scheduleId = scheduleService.createSchedule(dto);
        return Result.success(scheduleId);
    }

    // 查询排期详情（含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
    public Result<CourseSchedule> getScheduleDetail(@PathVariable Long id) {
        CourseSchedule schedule = scheduleService.selectById(id);
        return Result.success(schedule);
    }
}
```

---

# 七、第六步：前端展示（Thymeleaf + FullCalendar）

在 Thymeleaf 页面中集成 **FullCalendar**（最成熟的开源日历库），展示排期：

```HTML

<!DOCTYPE html>
<html lang="zh-CN" xmlns:th="http://www.thymeleaf.org">
<head>
    <meta charset="UTF-8">
    <title>课程排期管理</title>
    <!-- FullCalendar CSS -->
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" rel="stylesheet">
</head>
<body>
    <div id="calendar" style="max-width: 1200px; margin: 50px auto;"></div>

    <!-- FullCalendar JS -->
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>

    <script th:inline="javascript">
        // 初始化日历
        document.addEventListener('DOMContentLoaded', function() {
            const calendarEl = document.getElementById('calendar');
            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'timeGridWeek', // 周视图
                locale: 'zh-cn', // 中文
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                events: function(fetchInfo, successCallback, failureCallback) {
                    // 从后端获取排期数据（需补充查询接口）
                    axios.get('/api/course/schedule/list', {
                        params: {
                            start: fetchInfo.startStr,
                            end: fetchInfo.endStr
                        }
                    }).then(res => {
                        // 转换为FullCalendar事件格式
                        const events = res.data.data.map(schedule => ({
                            title: '课程' + schedule.courseId,
                            start: schedule.startTime,
                            end: schedule.endTime
                        }));
                        successCallback(events);
                    }).catch(err => {
                        failureCallback(err);
                    });
                }
            });
            calendar.render();
        });
    </script>
</body>
</html>
```

---

# 八、核心功能总结

1. **排期创建**：支持单次/重复排期，自动检测教师/教室冲突

2. **重复规则展开**：将“每周一三五”转换为具体的排期实例

3. **例外处理**：可扩展支持调课/停课（需补充例外日期的Service逻辑）

4. **前端展示**：集成FullCalendar，直观展示排期

需要我帮你补充**例外日期处理**、**排期列表查询**或**前端创建排期的表单**代码吗？
> （注：文档部分内容可能由 AI 生成）