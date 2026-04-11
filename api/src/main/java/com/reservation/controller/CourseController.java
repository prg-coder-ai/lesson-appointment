package com.reservation.controller;

import com.reservation.common.Result;
import  com.reservation.entity.Course;
import  com.reservation.entity.CourseTemplate;
import  com.reservation.entity.Schedule;
import  com.reservation.service.CourseService;
import  com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 操作       对接接口地址      请求方式        接口说明
 获取模板列表 course/template/list GET 支持语言类型、难度等级筛选
 新增模板    course/template/add   Template POST 管理员创建标准化模板
 修改模板    course/template/edit   Template  POST 管理员创建标准化模板
 修改/发布/回收 course/manage  PUT  传operation=edit+对应参数
 删除模板       course/manage  PUT 传operation=delete+模板ID
新建课程        course/add post   Course
新建排期     course/schedule/add  post  Schedule
更新排期     course/schedule/edit   Schedule

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
    @PostMapping("/template/insert")
     @ResponseBody
    public Result<Map<String, String>> insertTemplate(@Validated @RequestBody CourseTemplate template,
                                                   @RequestHeader("Authorization") String token) {
        // 权限校验：仅管理员可操作（对应设计2.3 安全设计-权限控制）
        permissionCheck.checkAdmin(token);
        // 调用服务层创建模板，返回templateId（对应设计2.2.2 模板创建返回数据）
        Map<String, String> resultMap = courseService.insertTemplate(template);
        return Result.success(resultMap, "课程模板创建成功");
    }

    @PostMapping("/template/update")
     @ResponseBody
    public Result<Map<String, String>> updateTemplate(@Validated @RequestBody CourseTemplate template,
                                                   @RequestHeader("Authorization") String token) {
        // 权限校验：仅管理员可操作（对应设计2.3 安全设计-权限控制）
        permissionCheck.checkAdmin(token);
        // 调用服务层创建模板，返回templateId（对应设计2.2.2 模板创建返回数据）
           courseService.updateTemplate(template);
        return Result.success(null, "课程模板修改成功");
    }

  /**
   * 模板状态更新接口（正确的写法：需要定义DTO接收JSON BODY，不要用多个@RequestBody参数）
   * 修正说明：
   *  - SpringMVC只允许一个@RequestBody参数。
   *  - 推荐前端POST JSON对象（如 { "templateid":"T001", "status":"active" }），后端定义DTO类接收。
   *  - 原因：此类报错多因方法参数写了两个@RequestBody，Spring无法匹配。
   */
  public static class UpdateTemplateStatusRequest {
      private String templateid;
      private String status;

      // getter/setter
      public String getTemplateid() { return templateid; }
      public void setTemplateid(String templateid) { this.templateid = templateid; }
      public String getStatus() { return status; }
      public void setStatus(String status) { this.status = status; }
  }

  @PostMapping("/template/updateStatus")
  @ResponseBody
  public Result<Void> updateTemplateStatus(@Validated @RequestBody UpdateTemplateStatusRequest req,
                                          @RequestHeader("Authorization") String token) {
      // 权限校验：仅管理员可操作
      permissionCheck.checkAdmin(token);
      courseService.updateTemplateStatus(req.getTemplateid(), req.getStatus());
      return Result.success(null, "课程模板状态修改成功");
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

    /**
     * 教师创建课程，对应设计2.2.2 接口：/api/v1/course/teacher/add（教师权限）
     */
    @PostMapping("/insert")
    public Result<Map<String, String>> addCourse(@Validated @RequestBody Course course,
                                                   @RequestHeader("Authorization") String token) {
        // 权限校验：教师、管理员均可操作
        permissionCheck.checkTeacherOrAdmin(token);
        // 校验教师ID与Token中的用户ID一致（对应设计2.3 安全设计-权限控制）
        String teacherId = permissionCheck.getUserIdFromToken(token);
        //如果当前操作者是admin，则直接使用代入的老师，否则使用当前登录者
         String role = permissionCheck.getRoleFromToken(token);
          if ("teacher".equals(role))  {
           course.setTeacherId(teacherId);
          }
        // 调用服务层创建课程，返回courseId（对应设计2.2.2 课程创建返回数据）
        Map<String, String> resultMap = courseService.addCourse(course);
        return Result.success(resultMap, "课程创建成功");
    }
     
    /**
     * 课程管理：发布、删除、回收->修改模板状态
     * 接口: /api/v1/course/manage
     * 输入参数: courseId, opertion=[active 发布、delete删除、inactive回收]
     * 权限: 仅教师可操作，且只能操作自己的课程
     */
    @PostMapping("/updateStatus")
    public Result<Void> updateCourseStatus(
           @Validated @RequestBody UpdateCourseStatusRequest req,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        String courseid = req.getCourseid();
        // 校验课程归属， 检查课程归属权，若courseId不存在或非teacherId归属，抛出业务异常
        String teacherId = permissionCheck.getUserIdFromToken(token);
        courseService.checkCourseOwner(courseid, teacherId); 

        // 执行对应操作
        courseService.updateCourseStatus(courseid, req.getStatus()); 
        return Result.success(null, "课程状态修改成功");
    }

    @PostMapping("/update")
    public Result<Void> updateCourse(
           @Validated @RequestBody Course req,
            @RequestHeader("Authorization") String token) {
        // 权限校验： 
        permissionCheck.checkTeacherOrAdmin(token);
        // 校验课程归属
        String courseId = req.getCourseId();
        String teacherId = permissionCheck.getUserIdFromToken(token);
        courseService.checkCourseOwner(courseId, teacherId); 

        // 执行对应操作
        courseService.update(req); 
        return Result.success(null, "课程修改成功");
    }

    /**
     * 查询课程列表，对应设计2.2.2 接口：/api/v1/course/list（教师、管理员权限）
     */
    @GetMapping("/list")
    public Result<Map<String, List<Course>>> getCourseList(@RequestBody(required = false) Map<String, Object> searchParams, 
                                                          @RequestHeader("Authorization") String token) {
        // 权限校验：教师或管理员可操作
        permissionCheck.checkTeacherOrAdmin(token);
        // 调用服务层查询课程列表
        List<Course> courseList = courseService.getCourseList(searchParams);
        Map<String, List<Course>> resultMap = Map.of("courses", courseList);
        return Result.success(resultMap, "查询成功");
    }

      public static class UpdateCourseStatusRequest {
      private String courseid;
      private String status;

      // getter/setter
      public String getCourseid() { return courseid; }
      public void setCourseid(String courseid) { this.courseid = courseid; }
      public String getStatus() { return status; }
      public void setStatus(String status) { this.status = status; }
  }
    

    /**
     * 设置课程排期，对应设计2.2.2 接口：/api/v1/course/schedule/set（教师权限）
     */
    @PostMapping("/schedule/add")
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
    @PutMapping("/schedule/edit")
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

}