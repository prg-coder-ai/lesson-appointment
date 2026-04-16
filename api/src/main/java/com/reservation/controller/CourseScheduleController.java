package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.CourseScheduleCreateDTO; 
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.entity.SchedulePO;
import com.reservation.entity.ScheduleVO;
import com.reservation.entity.ScheduleGenerateDTO;

import com.reservation.service.CourseScheduleService; 
import  com.reservation.common.ScheduleGenerator; 
import com.reservation.utils.PermissionCheck;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import javax.annotation.Resource;
import java.util.List;
import java.util.Map;
import java.time.*;

@RestController
@RequestMapping("/course/schedule")
public class CourseScheduleController {

    @Resource
    private CourseScheduleService scheduleService;
    @Autowired
    private PermissionCheck permissionCheck;
    // 创建排期
    @PostMapping("/create")
    @ResponseBody
    public Result<Map<String, String>>  createSchedule(@Validated @RequestBody CourseScheduleCreateDTO dto,
                                                   @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
         Map<String, String> resultMap = scheduleService.createSchedule(dto);//////TBD: local->UTC switch
        return Result.success(resultMap,"ok");
    }

    // 修改排期
    @PostMapping("/update")
    @ResponseBody
    public Result<Map<String, String>> updateSchedule(@Validated @RequestBody CourseScheduleCreateDTO dto,
                                                   @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
        String scheduleId = scheduleService.update(dto);//////TBD: local->UTC switch
        return Result.success( );
    }

 // 更新可用数incSiteBody { "inc":1、-1 ，"id":scheduleId)
    @PostMapping("/incSite")
    @ResponseBody
    public Result<Void> ScheduleIncSite(@Validated @RequestBody IncSiteBody dto,
                                    @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
        String scheduleId = scheduleService.updateScheduleSites(dto);
        return Result.success(null,scheduleId);
    }
    
    // 更新状态 (scheduleId，status)
    @PostMapping("/updateStatus")
     @ResponseBody
    public Result<Void> updateStatus(@Validated @RequestBody StatusBody dto) {

        String scheduleId = scheduleService.updateStatus(dto);////TBD: local->UTC switch
       
        return Result.success(null,scheduleId);
    }
    
    // 查询排期详情（含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
     @ResponseBody
    public Result<CourseSchedule> getScheduleDetail(@PathVariable String id) {
        CourseSchedule schedule = scheduleService.selectById(id);////TBD: UTC-->local switch
        return Result.success(   schedule,"ok");
    }

//输入可能的检索参数，暂保留
    @GetMapping("/list")
     @ResponseBody
    public Result<List<CourseScheduleCreateDTO>> getScheduleList(@Validated @RequestBody CourseScheduleCreateDTO dto,
                   @RequestHeader("Authorization") String token) {
        List<CourseScheduleCreateDTO> schedules = scheduleService.selectList(dto); //TBD: UTC-->local switch
        return Result.success(schedules,"ok");
    }

    @GetMapping("/selectByCourseId/{courseId}")
     @ResponseBody
    public Result<List<CourseScheduleCreateDTO>> getScheduleByCourseId(@PathVariable String courseId, @RequestHeader("Authorization") String token) {
              CourseScheduleCreateDTO dto = new CourseScheduleCreateDTO();
              dto.setCourseId(courseId); // courseId
              List<CourseScheduleCreateDTO> schedules = scheduleService.selectList(dto); 

       return Result.success(schedules,"ok");
    } 
 
  /**
   * 生成用户时区下的排期列表（POST /generate）
   * @param dto   前端传入的排期表单（包含起止日期、重复类型、周期等）
   * @param token 鉴权token（校园管理员或者教师）
   * @return      Result<List<ScheduleVO>> 返回选定时区下的日期+时间集合
   * 
   * 语法分析：
   * - @PostMapping("/generate")   标记该方法处理/generate的POST请求
   * - @ResponseBody               方法返回值序列化为JSON响应
   * - 参数：
   *      @RequestBody ScheduleGenerateDTO dto  从请求体JSON反序列化为业务DTO
   *      @RequestHeader("Authorization") String token  从header获取token参数
   * - 权限校验：
   *      permissionCheck.checkTeacherOrAdmin(token); // 检查用户为老师/管理员
   * - 业务调用/数据转换：
   *      List<ScheduleVO> userZoneList = ScheduleGenerator.generateUserZoneSchedule(dto);
   *        // 由工具类根据前端请求、时区等参数生成前端需要的排期列表
   * - 返回结构：
   *      Result.success(userZoneList,"localtime list");
   *      // 返回成功响应，含排期列表和消息
   */
  @PostMapping("/generate")
  @ResponseBody
  public Result<List<ScheduleVO>> generateList(@RequestBody ScheduleGenerateDTO dto, @RequestHeader("Authorization") String token) {
      // 1. 校验身份（老师/管理员权限）
      permissionCheck.checkTeacherOrAdmin(token);

      // 2. 根据表单内容与时区配置，生成对应的排期
      List<ScheduleVO> userZoneList = ScheduleGenerator.generateUserZoneSchedule(dto);

      // 3. 打印日志（便于开发调试，实际生产可去除）
      System.out.println("ret:" + Result.success(userZoneList, "localtime list"));

      // 4. 返回统一数据结构（包含 code/message/data 字段）
      return Result.success(userZoneList, "localtime list");
  }

}



 