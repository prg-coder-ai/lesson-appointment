package src.main.java.com.reservation.controller;

import src.main.java.com.reservation.common.Result;
import  src.main.java.com.reservation.entity.Course;
import  src.main.java.com.reservation.entity.CourseTemplate;
import  src.main.java.com.reservation.entity.Schedule;
import  src.main.java.com.reservation.service.CourseService;
import  src.main.java.com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 课程与排期管理控制器，对应设计2.2.2 所有接口
 */
@RestController
@RequestMapping("/course")
@Validated
public class CourseController {

    @Autowired
    private CourseService courseService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 创建课程模板，对应设计2.2.2 接口：/api/v1/course/template/add（管理员权限）
     */
    @PostMapping("/template/add")
    public Result<Map<String, String>> addTemplate(@Validated @RequestBody CourseTemplate template,
                                                   @RequestHeader("Authorization") String token) {
        // 权限校验：仅管理员可操作（对应设计2.3 安全设计-权限控制）
        permissionCheck.checkAdmin(token);
        // 调用服务层创建模板，返回templateId（对应设计2.2.2 模板创建返回数据）
        Map<String, String> resultMap = courseService.addTemplate(template);
        return Result.success(resultMap, "课程模板创建成功");
    }

    /**
     * 教师创建课程，对应设计2.2.2 接口：/api/v1/course/teacher/add（教师权限）
     */
    @PostMapping("/teacher/add")
    public Result<Map<String, String>> addCourse(@Validated @RequestBody Course course,
                                                   @RequestHeader("Authorization") String token) {
        // 权限校验：仅教师可操作
        permissionCheck.checkTeacher(token);
        // 校验教师ID与Token中的用户ID一致（对应设计2.3 安全设计-权限控制）
        String teacherId = permissionCheck.getUserIdFromToken(token);
        course.setTeacherId(teacherId);
        // 调用服务层创建课程，返回courseId（对应设计2.2.2 课程创建返回数据）
        Map<String, String> resultMap = courseService.addCourse(course);
        return Result.success(resultMap, "课程创建成功");
    }

    /**
     * 设置课程排期，对应设计2.2.2 接口：/api/v1/course/schedule/set（教师权限）
     */
    @PostMapping("/schedule/set")
    public Result<Void> setSchedule(@Validated @RequestBody Schedule schedule,
                                    @RequestHeader("Authorization") String token) {
        // 权限校验：仅教师可操作
        permissionCheck.checkTeacher(token);
        // 校验课程属于当前教师
        String teacherId = permissionCheck.getUserIdFromToken(token);
        courseService.checkCourseOwner(schedule.getCourseId(), teacherId);
        // 调用服务层设置排期（对应设计2.2.2 排期设置功能说明）
        courseService.setSchedule(schedule);
        return Result.success(null, "排期设置成功");
    }

    /**
     * 更新课程排期，对应设计2.2.2 接口：/api/v1/course/schedule/update（教师权限）
     */
    @PutMapping("/schedule/update")
    public Result<Void> updateSchedule(@Validated @RequestBody Schedule schedule,
                                       @RequestHeader("Authorization") String token) {
        // 权限校验：仅教师可操作
        permissionCheck.checkTeacher(token);
        // 校验排期属于当前教师
        String teacherId = permissionCheck.getUserIdFromToken(token);
        courseService.checkScheduleOwner(schedule.getScheduleId(), teacherId);
        // 调用服务层更新排期（对应设计2.2.2 排期更新功能说明）
        courseService.updateSchedule(schedule);
        return Result.success(null, "排期更新成功");
    }

    /**
     * 查询课程模板列表，对应设计2.2.2 接口：/api/v1/course/template/list（教师、管理员权限）
     */
    @GetMapping("/template/list")
    public Result<Map<String, List<CourseTemplate>>> getTemplateList(
            String languageType, @RequestHeader("Authorization") String token) {
        // 权限校验：教师或管理员可操作
        permissionCheck.checkTeacherOrAdmin(token);
        // 调用服务层查询模板（支持按languageType筛选，对应设计2.2.2 模板查询功能说明）
        List<CourseTemplate> templates = courseService.getTemplateListByLanguage(languageType);
        Map<String, List<CourseTemplate>> resultMap = Map.of("templates", templates);
        return Result.success(resultMap, "查询成功");
    }
}