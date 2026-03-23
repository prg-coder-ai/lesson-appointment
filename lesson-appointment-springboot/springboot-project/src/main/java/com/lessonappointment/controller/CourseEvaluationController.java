package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.CourseEvaluation;
import com.lessonappointment.service.CourseEvaluationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/course-evaluations")
@RequiredArgsConstructor
public class CourseEvaluationController {

    private final CourseEvaluationService courseEvaluationService;

    @GetMapping
    public Result<List<CourseEvaluation>> list(
            @RequestParam(required = false) String studentId,
            @RequestParam(required = false) String teacherId,
            @RequestParam(required = false) String courseId) {
        if (studentId != null) {
            return Result.success(courseEvaluationService.findByStudentId(studentId));
        }
        if (teacherId != null) {
            return Result.success(courseEvaluationService.findByTeacherId(teacherId));
        }
        if (courseId != null) {
            return Result.success(courseEvaluationService.findByCourseId(courseId));
        }
        return Result.success(courseEvaluationService.findAll());
    }

    @GetMapping("/{id}")
    public Result<CourseEvaluation> getById(@PathVariable String id) {
        return courseEvaluationService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("CourseEvaluation not found: " + id));
    }

    @GetMapping("/booking/{bookingId}")
    public Result<CourseEvaluation> getByBookingId(@PathVariable String bookingId) {
        return courseEvaluationService.findByBookingId(bookingId)
                .map(Result::success)
                .orElse(Result.notFound("Evaluation not found for booking: " + bookingId));
    }

    @PostMapping
    public Result<CourseEvaluation> create(@RequestBody CourseEvaluation evaluation) {
        try {
            return Result.success(courseEvaluationService.create(evaluation));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<CourseEvaluation> update(@PathVariable String id, @RequestBody CourseEvaluation evaluation) {
        try {
            return Result.success(courseEvaluationService.update(id, evaluation));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            courseEvaluationService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
