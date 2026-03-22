package com.language.reservation.service;

import com.language.reservation.entity.Course;
import com.language.reservation.entity.CourseTemplate;
import com.language.reservation.entity.Schedule;
import com.language.reservation.exception.BusinessException;
import com.language.reservation.exception.ResourceNotFoundException;
import com.language.reservation.mapper.CourseMapper;
import com.language.reservation.mapper.ScheduleMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 课程与排期管理服务，对应设计2.2.2 课程与排期管理模块所有接口的业务逻辑
 * 涵盖课程模板、教师课程、课程排期的增删改查，严格遵循权限校验和数据校验规则
 */
@Service
public class CourseService {

    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private ScheduleMapper scheduleMapper;

    // 日期格式化工具，对应通用校验规则-时间格式（YYYY-MM-DD HH:mm:ss）
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    /**
     * 创建课程模板，对应设计2.2.2 课程模板创建接口，仅管理员可操作
     */
    @Transactional
    public Map<String, String> addTemplate(CourseTemplate template) {
        // 校验课程模板唯一性（语言类型+难度等级唯一，对应通用校验规则-唯一性）
        if (courseMapper.selectTemplateByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel()) != null) {
            throw new BusinessException("该语言类型+难度等级的课程模板已存在");
        }
        // 生成唯一模板ID（UUID），对应通用校验规则-ID类参数
        String templateId = UUID.randomUUID().toString();
        template.setTemplateId(templateId);
        // 插入课程模板到数据库
        courseMapper.insertTemplate(template);
        // 组装返回数据（对应设计2.2.2 模板创建返回数据）
        Map<String, String> resultMap = Map.of("templateId", templateId);
        return resultMap;
    }

    /**
     * 教师创建课程，对应设计2.2.2 教师课程创建接口，仅教师可操作
     */
    @Transactional
    public Map<String, String> addCourse(Course course) {
        // 校验课程模板是否存在（对应设计2.2.2 课程关联模板规则）
        CourseTemplate template = courseMapper.selectTemplateById(course.getTemplateId());
        if (template == null) {
            throw new ResourceNotFoundException("课程模板不存在，请先选择正确的模板");
        }
        // 生成唯一课程ID（UUID）
        String courseId = UUID.randomUUID().toString();
        course.setCourseId(courseId);
        // 插入教师课程到数据库
        courseMapper.insertCourse(course);
        // 组装返回数据（对应设计2.2.2 课程创建返回数据）
        Map<String, String> resultMap = Map.of("courseId", courseId);
        return resultMap;
    }

    /**
     * 设置课程排期，对应设计2.2.2 排期设置接口，仅教师可操作
     */
    @Transactional
    public void setSchedule(Schedule schedule) {
        // 1. 校验课程是否存在
        Course course = courseMapper.selectCourseById(schedule.getCourseId());
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在，无法设置排期");
        }
        // 2. 校验时间格式和逻辑（对应通用校验规则-时间）
        validateScheduleTime(schedule.getStartTime(), schedule.getEndTime());
        // 3. 校验重复排期规则（isRepeat=true时，repeatWeek必填且为1-7）
        if (schedule.getIsRepeat()) {
            if (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7) {
                throw new BusinessException("重复排期需指定每周重复日期（1-7，对应周一至周日）");
            }
        } else {
            // 非重复排期，校验该时间段是否已存在排期（避免冲突）
            if (scheduleMapper.selectScheduleByTime(schedule.getCourseId(), schedule.getStartTime(), schedule.getEndTime()) != null) {
                throw new BusinessException("该时间段已存在排期，请勿重复设置");
            }
        }
        // 4. 生成唯一排期ID，设置默认状态为available（可预约）
        String scheduleId = UUID.randomUUID().toString();
        schedule.setScheduleId(scheduleId);
        schedule.setStatus("available");
        // 5. 插入排期到数据库
        scheduleMapper.insertSchedule(schedule);
    }

    /**
     * 更新课程排期，对应设计2.2.2 排期更新接口，仅教师可操作
     */
    @Transactional
    public void updateSchedule(Schedule schedule) {
        // 1. 校验排期是否存在
        Schedule existingSchedule = scheduleMapper.selectScheduleById(schedule.getScheduleId());
        if (existingSchedule == null) {
            throw new ResourceNotFoundException("排期不存在，无法更新");
        }
        // 2. 校验时间格式和逻辑
        validateScheduleTime(schedule.getStartTime(), schedule.getEndTime());
        // 3. 校验重复排期规则
        if (schedule.getIsRepeat()) {
            if (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7) {
                throw new BusinessException("重复排期需指定每周重复日期（1-7，对应周一至周日）");
            }
        }
        // 4. 更新排期信息（仅允许更新时间和重复规则，状态由系统控制）
        existingSchedule.setStartTime(schedule.getStartTime());     
    }
}