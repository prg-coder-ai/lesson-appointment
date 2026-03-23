package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.Schedule;
import com.lessonappointment.service.ScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService scheduleService;

    @GetMapping
    public Result<List<Schedule>> list(
            @RequestParam(required = false) String courseId,
            @RequestParam(required = false) String status) {
        if (courseId != null && status != null) {
            return Result.success(scheduleService.findByCourseIdAndStatus(courseId, status));
        }
        if (courseId != null) {
            return Result.success(scheduleService.findByCourseId(courseId));
        }
        if (status != null) {
            return Result.success(scheduleService.findByStatus(status));
        }
        return Result.success(scheduleService.findAll());
    }

    @GetMapping("/{id}")
    public Result<Schedule> getById(@PathVariable String id) {
        return scheduleService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("Schedule not found: " + id));
    }

    @PostMapping
    public Result<Schedule> create(@RequestBody Schedule schedule) {
        try {
            return Result.success(scheduleService.create(schedule));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<Schedule> update(@PathVariable String id, @RequestBody Schedule schedule) {
        try {
            return Result.success(scheduleService.update(id, schedule));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            scheduleService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
