package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.CourseScheduleCreateDTO;
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.service.CourseScheduleService;

import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.validation.annotation.Validated;
import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

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
         Map<String, String> resultMap = scheduleService.createSchedule(dto);
        return Result.success(resultMap,"ok");
    }

    // 修改排期
    @PostMapping("/update")
    @ResponseBody
    public Result<Map<String, String>> createSchedule(@Validated @RequestBody CourseSchedule dto,
                                                   @RequestHeader("Authorization") String token) {
         permissionCheck.checkTeacherOrAdmin(token);
        String scheduleId = scheduleService.update(dto);
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

        String scheduleId = scheduleService.updateStatus(dto);
       
        return Result.success(null,scheduleId);
    }
    
    // 查询排期详情（含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
     @ResponseBody
    public Result<CourseSchedule> getScheduleDetail(@PathVariable String id) {
        CourseSchedule schedule = scheduleService.selectById(id);
        return Result.success(   schedule,"ok");
    }

//输入可能的检索参数，暂保留
    @GetMapping("/list")
     @ResponseBody
    public Result<List<CourseSchedule>> getScheduleList(@Validated @RequestBody CourseScheduleCreateDTO dto,
                   @RequestHeader("Authorization") String token) {
        List<CourseSchedule> schedules = scheduleService.selectList(dto); 
        return Result.success(schedules,"ok");
    }

    @GetMapping("/selectByCourseId")
     @ResponseBody
    public Result<List<CourseSchedule>> getScheduleByCourseId(@PathVariable CourseScheduleCreateDTO dto, @RequestHeader("Authorization") String token) {
            // CourseScheduleCreateDTO dto;
            // dto.setCourseid(cid);
             List<CourseSchedule> schedules = scheduleService.selectList(dto);
           
       return Result.success(schedules,"ok");
    } 
}