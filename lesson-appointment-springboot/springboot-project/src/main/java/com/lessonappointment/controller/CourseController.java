package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.Course;
import com.lessonappointment.service.CourseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/courses")
@RequiredArgsConstructor
public class CourseController {

    private final CourseService courseService;

    @GetMapping
    public Result<List<Course>> list(
            @RequestParam(required = false) String teacherId,
            @RequestParam(required = false) String templateId) {
        if (teacherId != null) {
            return Result.success(courseService.findByTeacherId(teacherId));
        }
        if (templateId != null) {
            return Result.success(courseService.findByTemplateId(templateId));
        }
        return Result.success(courseService.findAll());
    }

    @GetMapping("/{id}")
    public Result<Course> getById(@PathVariable String id) {
        return courseService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("Course not found: " + id));
    }

    @PostMapping
    public Result<Course> create(@RequestBody Course course) {
        try {
            return Result.success(courseService.create(course));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<Course> update(@PathVariable String id, @RequestBody Course course) {
        try {
            return Result.success(courseService.update(id, course));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            courseService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
