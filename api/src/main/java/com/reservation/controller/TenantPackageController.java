package com.reservation.controller;

import com.reservation.common.*;
import com.reservation.entity.TenantPackage;
import com.reservation.query.TenantPackageQueryPage;
import com.reservation.service.TenantPackageService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 租户套餐额度管理控制器
 * 接口前缀: /tenant/package/*
 * 权限: 平台管理员（增删改）、管理员（查询）
 */
@RestController
@RequestMapping("/tenant/package")
public class TenantPackageController {

    @Autowired
    private TenantPackageService tenantPackageService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 创建租户套餐（管理员权限）
     */
    @PostMapping("/insert")
    public Result<Map<String, Long>> insertPackage(@RequestBody TenantPackage pkg,
                                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long id = tenantPackageService.insertPackage(pkg);
        return Result.success(Map.of("packageId", id), "租户套餐创建成功");
    }

    /**
     * 修改租户套餐限额（管理员权限）
     */
    @PostMapping("/update")
    public Result<Map<String, Long>> updatePackage(@RequestBody TenantPackage pkg,
                                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long id = tenantPackageService.updatePackage(pkg);
        return Result.success(Map.of("packageId", id), "租户套餐修改成功");
    }

    /**
     * 删除租户套餐（管理员权限）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> deletePackage(@PathVariable Long id,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        int rows = tenantPackageService.deletePackage(id);
        if (rows > 0) {
            return Result.success(true, "套餐删除成功");
        }
        return Result.success(false, "套餐删除失败，记录不存在");
    }

    /**
     * 按套餐ID查询详情
     */
    @GetMapping("/{id}")
    public Result<TenantPackage> getPackage(@PathVariable Long id,
                                            @RequestHeader("Authorization") String token) {
        TenantPackage pkg = tenantPackageService.getById(id);
        if (pkg == null) {
            return Result.fail(404, "套餐记录不存在");
        }
        return Result.success(pkg, "查询成功");
    }

    /**
     * 按租户ID查询套餐
     */
    @GetMapping("/tenant/{tenantId}")
    public Result<TenantPackage> getPackageByTenant(@PathVariable Long tenantId,
                                                    @RequestHeader("Authorization") String token) {
        TenantPackage pkg = tenantPackageService.getByTenantId(tenantId);
        if (pkg == null) {
            return Result.fail(404, "该租户尚未配置套餐");
        }
        return Result.success(pkg, "查询成功");
    }

    /**
     * 分页查询套餐列表，支持按租户ID筛选
     */
    @PostMapping("/page")
    public Result<PageResult<TenantPackage>> getPackageByPage(@RequestBody TenantPackageQueryPage query,
                                                              @RequestHeader("Authorization") String token) {
        PageResult<TenantPackage> result = tenantPackageService.getPackageListByPage(query);
        return Result.success(result, "查询成功");
    }

    /**
     * 查询全部套餐列表
     */
    @GetMapping("/list")
    public Result<List<TenantPackage>> listAll(@RequestHeader("Authorization") String token) {
        List<TenantPackage> list = tenantPackageService.listAll();
        return Result.success(list, "查询成功");
    }
}
