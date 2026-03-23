package com.lessonappointment.controller;

import com.lessonappointment.common.Result;
import com.lessonappointment.entity.CourseTemplate;
import com.lessonappointment.service.CourseTemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/course-templates")
@RequiredArgsConstructor
public class CourseTemplateController {

    private final CourseTemplateService courseTemplateService;

    @GetMapping
    public Result<List<CourseTemplate>> list(
            @RequestParam(required = false) String languageType,
            @RequestParam(required = false) String difficultyLevel) {
        if (languageType != null) {
            return Result.success(courseTemplateService.findByLanguageType(languageType));
        }
        if (difficultyLevel != null) {
            return Result.success(courseTemplateService.findByDifficultyLevel(difficultyLevel));
        }
        return Result.success(courseTemplateService.findAll());
    }

    @GetMapping("/{id}")
    public Result<CourseTemplate> getById(@PathVariable String id) {
        return courseTemplateService.findById(id)
                .map(Result::success)
                .orElse(Result.notFound("CourseTemplate not found: " + id));
    }

    @PostMapping
    public Result<CourseTemplate> create(@RequestBody CourseTemplate template) {
        try {
            return Result.success(courseTemplateService.create(template));
        } catch (IllegalArgumentException e) {
            return Result.badRequest(e.getMessage());
        }
    }

    @PutMapping("/{id}")
    public Result<CourseTemplate> update(@PathVariable String id, @RequestBody CourseTemplate template) {
        try {
            return Result.success(courseTemplateService.update(id, template));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        try {
            courseTemplateService.delete(id);
            return Result.success();
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }
}
