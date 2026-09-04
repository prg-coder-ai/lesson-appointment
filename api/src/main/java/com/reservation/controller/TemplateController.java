package com.reservation.controller;

import com.reservation.common.*;
import com.reservation.entity.CourseTemplate;
import com.reservation.query.*;
import com.reservation.service.CourseService;
import com.reservation.utils.PermissionCheck;
import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 课程模板管理控制器
 * 接口前缀: /course/template/*
 * 权限: 管理员（创建/修改/删除）、教师或管理员（查询）
 */
@RestController
@RequestMapping("/course/template")
@Validated
public class TemplateController {

    @Autowired
    private CourseService courseService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 创建课程模板（管理员权限）
     */
    @PostMapping("/insert")
    @Audit(action = AuditAction.TEMPLATE_CREATE, resourceType = "template")
    @ResponseBody
    public Result<Map<String, String>> insertTemplate(@Validated @RequestBody CourseTemplate template,
                                                   @RequestHeader("Authorization") String token) {
        Map<String, String> resultMap = courseService.insertTemplate(template);
        return Result.success(resultMap, "课程模板创建成功");
    }

    /**
     * 修改课程模板（管理员权限）
     */
    @PostMapping("/update")
    @ResponseBody
    public Result<Map<String, String>> updateTemplate(@Validated @RequestBody CourseTemplate template,
                                                   @RequestHeader("Authorization") String token) {
        Map<String, String> id = courseService.updateTemplate(template);
        if (id != null)
            return Result.success(id, "课程模板修改成功");
        else
            return Result.success(null, "课程模板修改不成功");
    }

    /**
     * 修改模板状态（发布/回收等，管理员权限）
     */
    @PostMapping("/updateStatus")
    @ResponseBody
    public Result<Map<String, String>> updateTemplateStatus(@Validated @RequestBody UpdateTemplateStatusRequest req,
                                          @RequestHeader("Authorization") String token) {
        Map<String, String> status = courseService.updateTemplateStatus(req.getTemplateid(), req.getStatus());
        return Result.success(status, "课程模板状态修改成功");
    }

    /**
     * 删除课程模板（管理员权限）
     */
    @DeleteMapping("/{id}")
    @Audit(action = AuditAction.TEMPLATE_DELETE, resourceType = "template", resourceId = "id")
    public Result<Boolean> deleteTemplate(@PathVariable String id, @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        int rowsDeleted = courseService.deleteTemplate(id);
        if (rowsDeleted > 0) {
            return Result.success(true, "模板删除成功");
        } else {
            return Result.success(false, "模板删除失败");
        }
    }

    /**
     * 查询课程模板列表（教师、管理员权限）
     * 支持按语言类型筛选
     */
    @GetMapping("/list")
    public Result<List<CourseTemplate>> getTemplateList(
            @RequestParam(defaultValue = "all") String languageType,
            @RequestHeader("Authorization") String token) {
        List<CourseTemplate> templates = courseService.getTemplateListByLanguage(languageType);
        return Result.success(templates, "查询成功");
    }

    /**
     * 分页查询课程模板列表
     */
    @PostMapping("/page")
    public Result<PageResult<CourseTemplate>> getTemplateListBypage(
            @RequestBody TemplateQueryPage query,
            @RequestHeader("Authorization") String token) {
        PageResult<CourseTemplate> templates = courseService.getTemplateListBypage(query);
        return Result.success(templates, "查询成功");
    }

    /**
     * 模板状态更新DTO
     */
    public static class UpdateTemplateStatusRequest {
        private String templateid;
        private String status;

        public String getTemplateid() { return templateid; }
        public void setTemplateid(String templateid) { this.templateid = templateid; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
    }
}
