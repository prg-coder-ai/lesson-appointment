package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.entity.CourseScheduleCreateDTO;
import com.reservation.entity.IncSiteBody;
import com.reservation.entity.StatusBody;
import com.reservation.service.CourseScheduleService;

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

    // 创建排期
    @PostMapping("/create")
    public Result<String> createSchedule(@Validated @RequestBody CourseScheduleCreateDTO dto) {
        String scheduleId = scheduleService.createSchedule(dto);
        return Result.success(scheduleId);
    }

    // 修改排期
    @PostMapping("/update")
    public Result<String> createSchedule(@Validated @RequestBody CourseSchedule dto) {
        String scheduleId = scheduleService.update(dto);
        return Result.success(scheduleId);
    }

 // 更新可用数incSiteBody { "inc":1、-1 ，"id":scheduleId)
    @PostMapping("/incSite")
    public Result<String> createSchedule(@Validated @RequestBody IncSiteBody dto) {
        String scheduleId = scheduleService.updateScheduleSites(dto);
        return Result.success( );
    }
    
    // 更新状态 (scheduleId，status)
    @PostMapping("/updateStatus")
    public Result<String> updateStatus(@Validated @RequestBody StatusBody dto) {

        String scheduleId = scheduleService.updateStatus(dto);
        return Result.success( );
    }
    
    // 查询排期详情（含展开后的实例，用于前端展示）
    @GetMapping("/detail/{id}")
    public Result<CourseSchedule> getScheduleDetail(@PathVariable String id) {
        CourseSchedule schedule = scheduleService.selectById(id);
        return Result.success( );
    }

//输入可能的检索参数，暂保留
    @GetMapping("/list")
    public Result<List<CourseSchedule>> getScheduleList(@Validated @RequestBody CourseScheduleCreateDTO dto) {
        List<CourseSchedule> schedules = scheduleService.selectList(dto);
        Map<String, List<CourseSchedule>> resultMap = Map.of("schedules", schedules);
        return Result.success(resultMap);
    }
}