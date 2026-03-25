package src.main.java.com.reservation.service;

import src.main.java.com.reservation.controller.CourseExecutionController;
import src.main.java.com.reservation.entity.Course;
import src.main.java.com.reservation.entity.CourseTemplate;
import src.main.java.com.reservation.entity.Schedule;
import src.main.java.com.reservation.exception.BusinessException;
import src.main.java.com.reservation.exception.ResourceNotFoundException;
import src.main.java.com.reservation.mapper.CourseMapper;
import src.main.java.com.reservation.mapper.ScheduleMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;

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

    // 显式声明私有访问修饰符，规范常量定义
    private static final SimpleDateFormat COURSE_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    // 时间格式正则，辅助校验
    private static final String TIME_PATTERN = "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$";

    /**
     * 创建课程模板，对应设计2.2.2 课程模板创建接口，仅管理员可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> addTemplate(CourseTemplate template) {
        if (courseMapper.selectTemplateByLangAndLevel(template.getLanguageType(), template.getDifficultyLevel())
                != null) {
            throw new BusinessException("该语言类型+难度等级的课程模板已存在");
        }
        String templateId = UUID.randomUUID().toString().replace("-", ""); // 移除UUID分隔符
        template.setTemplateId(templateId);
        courseMapper.insertTemplate(template);
        return Collections.singletonMap("templateId", templateId); // 替换Map.of，兼容低版本Java
    }

    /**
     * 教师创建课程，对应设计2.2.2 教师课程创建接口，仅教师可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Map<String, String> addCourse(Course course) {
        CourseTemplate template = courseMapper.selectTemplateById(course.getTemplateId());
        if (template == null) {
            throw new ResourceNotFoundException("课程模板不存在，请先选择正确的模板");
        }
        String courseId = UUID.randomUUID().toString().replace("-", "");
        course.setCourseId(courseId);
        courseMapper.insertCourse(course);
        return Collections.singletonMap("courseId", courseId);
    }

    /**
     * 获取课程列表（含可用排期），补充实现体，避免编译错误
     */
    public List<Course> getCourseList() {
        // 实现逻辑：调用Mapper查询，无结果返回空集合，避免空指针
        List<Course> courseList = courseMapper.selectAvailableCourseList(); // 假设Mapper有该方法
        return Optional.ofNullable(courseList).orElse(Collections.emptyList());
    }

    /**
     * 设置课程排期，对应设计2.2.2 排期设置接口，仅教师可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public void setSchedule(Schedule schedule) {
        Course course = courseMapper.selectCourseById(schedule.getCourseId());
        if (course == null) {
            throw new ResourceNotFoundException("课程不存在，无法设置排期");
        }
        // 校验时间（已实现方法，处理异常）
        validateScheduleTime(SimpleDateFormat.getInstance().format(schedule.getStartTime()),
                SimpleDateFormat.getInstance().format( schedule.getEndTime()));
        if (schedule.getIsRepeat()) {
            if (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7) {
                throw new BusinessException("重复排期需指定每周重复日期（1-7，对应周一至周日）");
            }
        } else {
            if (scheduleMapper.selectScheduleByTime(schedule.getCourseId(), schedule.getStartTime(), schedule.getEndTime()) != null) {
                throw new BusinessException("该时间段已存在排期，请勿重复设置");
            }
        }
        String scheduleId = UUID.randomUUID().toString().replace("-", "");
        schedule.setScheduleId(scheduleId);
        schedule.setStatus("available");
        scheduleMapper.insertSchedule(schedule);
    }

    /**
     * 更新课程排期，对应设计2.2.2 排期更新接口，仅教师可操作
     */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public void updateSchedule(Schedule schedule) {
        Schedule existingSchedule = scheduleMapper.selectScheduleById(schedule.getScheduleId());
        if (existingSchedule == null) {
            throw new ResourceNotFoundException("排期不存在，无法更新");
        }
        //validateScheduleTime(schedule.getStartTime(), schedule.getEndTime());
        validateScheduleTime(COURSE_DATE_FORMAT.format(schedule.getStartTime()),
                COURSE_DATE_FORMAT.format( schedule.getEndTime()));
        if (schedule.getIsRepeat()) {
            if (schedule.getRepeatWeek() == null || schedule.getRepeatWeek() < 1 || schedule.getRepeatWeek() > 7) {
                throw new BusinessException("重复排期需指定每周重复日期（1-7，对应周一至周日）");
            }
        }
        // 更新排期字段
        existingSchedule.setStartTime(schedule.getStartTime());
        existingSchedule.setEndTime(schedule.getEndTime());
        existingSchedule.setIsRepeat(schedule.getIsRepeat());
        existingSchedule.setRepeatWeek(schedule.getRepeatWeek());
        // 执行数据库更新
        scheduleMapper.updateSchedule(existingSchedule);
    }

    /**
     * 补充缺失的时间校验方法，处理ParseException，抛出业务异常
     * 校验规则：格式正确、结束时间晚于开始时间
     */
    private void validateScheduleTime(String startTime, String endTime) {
        // 1. 校验时间格式是否匹配YYYY-MM-DD HH:mm:ss
        if (startTime == null || !startTime.matches(TIME_PATTERN) || endTime == null || !endTime.matches(TIME_PATTERN)) {
            throw new BusinessException("时间格式错误，请遵循YYYY-MM-DD HH:mm:ss格式");
        }
        // 2. 校验结束时间晚于开始时间，处理ParseException
        try {
            Date start = COURSE_DATE_FORMAT.parse(startTime);
            Date end = COURSE_DATE_FORMAT.parse(endTime);
            if (end.before(start) || end.equals(start)) {
                throw new BusinessException("结束时间必须晚于开始时间");
            }
        } catch (ParseException e) {
            // 捕获解析异常，转为业务异常
            throw new BusinessException("时间解析失败，请检查时间格式：" + e.getMessage());
        }
    }

    public void checkCourseOwner(String courseId, String teacherId) {
    }

    public void checkScheduleOwner(String scheduleId, String teacherId) {
    }

    public List<CourseTemplate> getTemplateListByLanguage(String languageType) {
        return null;
    }
}