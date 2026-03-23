package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.CourseFeedback;
import com.lessonappointment.service.CourseFeedbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/course-feedbacks")
@RequiredArgsConstructor
public class CourseFeedbackController {

    private final CourseFeedbackService courseFeedbackService;

    @GetMapping
    public Result<List<CourseFeedback>> list(
            @RequestParam(required = false) String courseId,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String handleStatus) {
        if (courseId != null) {
            return Result.success(courseFeedbackService.findByCourseId(courseId));
        }
        if (userId != null) {
            return Result.success(courseFeedbackService.findByUserId(userId));
        }
        if (handleStatus != null) {
            return Result.success(courseFeedbackService.findByHandleStatus(handleStatus));
        }
        return Result.success(courseFeedbackService.findAll());
    }

    @GetMapping("/{id}")
    public Result<CourseFeedback> getById(@PathVariable String id) {
        return courseFeedbackService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("CourseFeedback not found: " + id));
    }

    @PostMapping
    public Result<CourseFeedback> create(@RequestBody CourseFeedback feedback) {
        try {
            return Result.success(courseFeedbackService.create(feedback));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<CourseFeedback> update(@PathVariable String id, @RequestBody CourseFeedback feedback) {
        try {
            return Result.success(courseFeedbackService.update(id, feedback));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            courseFeedbackService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
