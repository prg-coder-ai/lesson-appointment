package com.reservation.controller;

import com.reservation.common.*;
import  com.reservation.entity.Course;
import  com.reservation.query.*;
import  com.reservation.dto.CourseQueryParam;
import com.reservation.service.CourseService;
import com.reservation.utils.PermissionCheck;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
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
     * 教师创建课程，对应设计2.2.2 接口：/api/v1/course/teacher/add（教师权限）
     * TBD：管理员添加课程的情况，增加teacherId参数
     */
    @PostMapping("/insert")
    @Audit(action = AuditAction.COURSE_CREATE, resourceType = "course")
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
    public Result<Boolean> updateCourseStatus(
           @Validated @RequestBody UpdateCourseStatusRequest req,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
         String courseId = req.getCourseid(); 
        // 执行对应操作
        courseService.updateCourseStatus(courseId, req.getStatus()); 
        return Result.success(true, "课程状态修改成功");
    }

    @PostMapping("/updateStatusByLastId/{id}")
    public Result<Integer> updateCourseStatusByLastId(
           @PathVariable String id,
           @RequestParam("status") String status,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        // 执行对应操作
        Integer rows = courseService.updateCourseStatusByLastId(id, status);
        return Result.success(rows, "课程状态修改成功");
    }


    @PostMapping("/update")
    public Result<Boolean > updateCourse(
           @Validated @RequestBody Course req,
            @RequestHeader("Authorization") String token) {
        // 权限校验： 
        permissionCheck.checkTeacherOrAdmin(token);
        // 校验课程归属
       // String courseId = req.getCourseId();
        //String teacherId = permissionCheck.getUserIdFromToken(token);
        //courseService.checkCourseOwner(courseId, teacherId); 
         try{
        // 执行对应操作
        courseService.update(req); 
        return Result.success(true, "课程修改成功");
         }  catch (Exception e) {
           return Result.success(false, "课程修失败: " + e.getMessage());      
       }
    }


   // 对应的Controller接口定义应为：
   @DeleteMapping("/deleteById/{id}")
   @Audit(action = AuditAction.COURSE_DELETE, resourceType = "course", resourceId = "id")
   public Result<Integer> deleteCourse(@PathVariable String id, @RequestHeader("Authorization") String token) {
       // 校验权限：只能教师或管理员有权限删除.教师只删除自己的课程
        permissionCheck.checkTeacherOrAdmin(token);
     try {
        // 实际删除操作
          int result = courseService.deleteById(id);
        
           return Result.success(result, "课程删除成功");
       } catch (Exception e) {
           return Result.success(0, "课程删除失败: " + e.getMessage());      
       }
   }

    @DeleteMapping("/deleteByTemplateId/{id}")
   public Result<Integer> deleteCourseByTemplateId(@PathVariable String id,
              @RequestHeader("Authorization") String token) {
       // 校验权限：只能教师或管理员有权限删除.教师只删除自己的课程
        permissionCheck.checkTeacherOrAdmin(token);
       try{
        // 实际删除操作
         int result = courseService.deleteByTemplateId(id);
         return Result.success(result, "课程删除成功");
       
       } catch (Exception e) {
           return Result.success(0, "课程删除失败: " + e.getMessage());      
       }
   }

    /**
     * 查询课程列表，对应设计2.2.2 接口：/api/v1/course/list（教师、管理员权限）
     * 
     * TBD: courseName: document.getElementById('courseName').value,
      languageType: document.getElementById('language').value,
      difficultyLevel: document.getElementById('difficulty').value,
      teacher: document.getElementById('teacher').value
      复合查询--关联模板库、user库--->课程难度、语言、老师等信息
     */
    @GetMapping("/list")
    @ResponseBody
        // 权限校验：教师或管理员、学生均可操作  //@Validated @RequestBody(required = false) 
   public Result<List<Course>> getCourseList(CourseQueryParam params,
                                                          @RequestHeader("Authorization") String token) {
        permissionCheck.checkTeacherOrAdmin(token);
        // 调用服务层查询课程列表
         System.out.println("getCourseList controller: " + params);
        List<Course> courseList = courseService.getCourseList(params);
        //Map<String, List<Course>> resultMap = Map.of("courses", courseList);
        return Result.success(courseList, "查询成功");
    }

    @GetMapping("/page")
    @ResponseBody
    /* 返回收据
    private List<T> rows;      // 当前页数据
    private Long total;        // 总记录数
    private Integer pageNum;   // 当前页码
    private Integer pageSize;  // 每页条数
    private Integer totalPages;// 总页数
    */
   public Result<PageResult<Course>> getCourseListByPage(CourseQueryPage query, 
                                                          @RequestHeader("Authorization") String token) {

        //   System.out.println("getCourseListByPage input:" + query);                                                   
        //permissionCheck.checkTeacherOrAdmin(token);
        // 调用服务层查询课程列表
       //  System.out.println("getCourseList controller: " + query);
        PageResult<Course> courseList = courseService.getCoursePage( query);
        //Map<String, List<Course>> resultMap = Map.of("courses", courseList);
       // System.out.println("getCourseListByPage output:" + courseList);
        return Result.success(courseList, "查询成功");
    }
    //
    @GetMapping("/{courseid}")
    @ResponseBody
        // 权限校验：教师或管理员、学生均可操作
   public Result<Course> getCourseById(@PathVariable String courseid,
                                                          @RequestHeader("Authorization") String token) {
        //permissionCheck.checkTeacherOrAdmin(token);
        // 调用服务层查询课程列表
        // System.out.println("getCourseByID controller: " + courseid);
         Course  course  = courseService.getCourseById(courseid);
        //Map<String, List<Course>> resultMap = Map.of("courses", courseList);
        return Result.success(course, "查询成功");
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
   * 根据课程ID查询课程形式
   * 前端调用: GET /course/classform?courseId=T001
   * 返回: "一对一"
   */
  @GetMapping("/classform")
  @ResponseBody
  public Result<String> getClassFormByCourseId(
          @RequestParam("courseId") String courseId) {
           // System.err.println("getClassFormByCourseId:"+courseId+","+classForm  );
    String classForm = courseService.getClassFormByCourseId(courseId);
    //System.err.println("getClassFormByCourseId:"+courseId+","+classForm  );
    return Result.success(classForm, "查询成功");
  }

    /**
     * 按月统计已发布课程数
     * 前端调用: GET /course/statistical/byMonth?year=2024&month=6
     * 返回: { "courseMonthStart": 10, "courseMonthEnd": 12 }
     */
    @GetMapping("/statistical/byMonth")
    @ResponseBody
    public Result<Map<String, Integer>> getCourseStaticsByMonth(
            @RequestParam("year") int year,
            @RequestParam("month") int month
    ) {
        // 计算当月起止日期
        java.time.LocalDate monthStart = java.time.LocalDate.of(year, month, 1);
        java.time.LocalDate monthEnd = monthStart.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());

        // 统计截至月初0点已发布课程数（含月初当天0点）；截至月末23:59:59已发布课程数
        int courseMonthStart = courseService.countPublishedCourseAtDate(monthStart.atStartOfDay());
        int courseMonthEnd = courseService.countPublishedCourseAtDate(monthEnd.atTime(23, 59, 59));

        Map<String, Integer> data = new java.util.HashMap<>();
        data.put("courseMonthStart", courseMonthStart);
        data.put("courseMonthEnd", courseMonthEnd);

        return Result.success(data, "查询成功");
    }
}