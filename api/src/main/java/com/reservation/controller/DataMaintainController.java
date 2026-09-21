package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.Result;
import com.reservation.entity.Appointment;
import com.reservation.entity.Booking;
import com.reservation.entity.Course;
import com.reservation.entity.CourseSchedule;
import com.reservation.mapper.AppointmentMapper;
import com.reservation.mapper.BookingMapper;
import com.reservation.mapper.CourseMapper;
import com.reservation.mapper.CourseScheduleMapper;
import com.reservation.mapper.CourseTemplateMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;

/**
 * 数据维护页「清理已删」批量物理删除接口。
 *
 * 业务背景：其他页面的删除多为软删（把 status 置为 frozen，课程历史用 delete），
 * 数据维护页的删除为硬删。本 Controller 提供按类型「清理」被软删除记录的能力，
 * 物理删除 status IN ('frozen','delete') 的记录，并返回影响行数。
 *
 * 租户隔离：course / course_template / course_schedule / booking / appointment 均为租户表，
 * 租户插件（TenantLineInnerInterceptor）会自动在 DELETE 语句上追加 tenant_id 条件，
 * 因此只会清理当前租户下的软删记录。
 *
 * 注意：清理按依赖顺序（模板→课程→排期→预定→预约）更安全，避免外键约束导致清理失败。
 */
@RestController
@RequestMapping("/api/v1/data-maintain")
public class DataMaintainController {

    @Autowired
    private CourseMapper courseMapper;
    @Autowired
    private CourseScheduleMapper courseScheduleMapper;
    @Autowired
    private BookingMapper bookingMapper;
    @Autowired
    private AppointmentMapper appointmentMapper;
    @Autowired
    private CourseTemplateMapper courseTemplateMapper;

    @PostMapping("/purge/template")
    public Result<Integer> purgeTemplate() {
        int rows = courseTemplateMapper.purgeDeleted();
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/course")
    public Result<Integer> purgeCourse() {
        int rows = courseMapper.delete(
                new QueryWrapper<Course>().in("status", Arrays.asList("frozen", "delete")));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/schedule")
    public Result<Integer> purgeSchedule() {
        int rows = courseScheduleMapper.delete(
                new QueryWrapper<CourseSchedule>().in("status", Arrays.asList("frozen", "delete")));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/booking")
    public Result<Integer> purgeBooking() {
        int rows = bookingMapper.delete(
                new QueryWrapper<Booking>().in("status", Arrays.asList("frozen", "delete")));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }

    @PostMapping("/purge/appointment")
    public Result<Integer> purgeAppointment() {
        int rows = appointmentMapper.delete(
                new QueryWrapper<Appointment>().in("status", Arrays.asList("frozen", "delete")));
        return Result.success(rows, "成功清理 " + rows + " 行");
    }
}
