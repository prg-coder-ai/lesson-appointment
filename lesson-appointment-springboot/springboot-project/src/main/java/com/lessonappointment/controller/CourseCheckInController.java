package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.CourseCheckIn;
import com.lessonappointment.service.CourseCheckInService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/course-check-ins")
@RequiredArgsConstructor
public class CourseCheckInController {

    private final CourseCheckInService courseCheckInService;

    @GetMapping
    public Result<List<CourseCheckIn>> list(@RequestParam(required = false) String bookingId) {
        if (bookingId != null) {
            return Result.success(courseCheckInService.findByBookingId(bookingId));
        }
        return Result.success(courseCheckInService.findAll());
    }

    @GetMapping("/{id}")
    public Result<CourseCheckIn> getById(@PathVariable String id) {
        return courseCheckInService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("CourseCheckIn not found: " + id));
    }

    @PostMapping
    public Result<CourseCheckIn> create(@RequestBody CourseCheckIn checkIn) {
        try {
            return Result.success(courseCheckInService.create(checkIn));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<CourseCheckIn> update(@PathVariable String id, @RequestBody CourseCheckIn checkIn) {
        try {
            return Result.success(courseCheckInService.update(id, checkIn));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            courseCheckInService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
