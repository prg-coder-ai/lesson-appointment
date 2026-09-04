package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.entity.PackageTemplate;
import com.reservation.query.PackageTemplateQueryPage;
import com.reservation.service.PackageTemplateService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 套餐模板管理控制器（平台管理）
 * 接口前缀: /package/template/*
 * 权限: 仅平台管理员可增删改；管理员可查询（用于下拉选择）
 */
@RestController
@RequestMapping("/package/template")
public class PackageTemplateController {

    @Autowired
    private PackageTemplateService packageTemplateService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 新增套餐模板
     */
    @PostMapping("/insert")
    public Result<Map<String, Long>> insert(@RequestBody PackageTemplate template,
                                            @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = packageTemplateService.insertTemplate(template);
        return Result.success(Map.of("templateId", id), "套餐模板创建成功");
    }

    /**
     * 修改套餐模板
     */
    @PostMapping("/update")
    public Result<Map<String, Long>> update(@RequestBody PackageTemplate template,
                                            @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = packageTemplateService.updateTemplate(template);
        return Result.success(Map.of("templateId", id), "套餐模板修改成功");
    }

    /**
     * 删除套餐模板（有租户引用时拒绝）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = packageTemplateService.deleteTemplate(id);
        return rows > 0 ? Result.success(true, "套餐模板删除成功")
                        : Result.success(false, "删除失败，记录不存在");
    }

    /**
     * 套餐模板详情
     */
    @GetMapping("/{id}")
    public Result<PackageTemplate> getById(@PathVariable Long id,
                                           @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        PackageTemplate template = packageTemplateService.getById(id);
        if (template == null) {
            return Result.fail(404, "套餐模板不存在");
        }
        return Result.success(template, "查询成功");
    }

    /**
     * 分页查询
     */
    @PostMapping("/page")
    public Result<PageResult<PackageTemplate>> page(@RequestBody PackageTemplateQueryPage query,
                                                    @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(packageTemplateService.getTemplateListByPage(query), "查询成功");
    }

    /**
     * 全部模板
     */
    @GetMapping("/list")
    public Result<List<PackageTemplate>> listAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(packageTemplateService.listAll(), "查询成功");
    }

    /**
     * 启用的模板（下拉选择用）
     */
    @GetMapping("/list-enabled")
    public Result<List<PackageTemplate>> listEnabled(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(packageTemplateService.listEnabled(), "查询成功");
    }
}
