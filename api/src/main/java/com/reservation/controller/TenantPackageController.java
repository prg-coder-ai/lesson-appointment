package com.reservation.controller;

import com.reservation.common.*;
import com.reservation.entity.TenantPackage;
import com.reservation.query.TenantPackageQueryPage;
import com.reservation.service.TenantPackageService;
import com.reservation.service.MessageNotifyService;
import com.reservation.service.TenantQuotaService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 租户套餐管理控制器（平台管理）
 * 接口前缀: /tenant/package/*
 *
 * 说明：这里管理的是「某租户实际持有的套餐」（sys_tenant_package，一租户一条）；
 *      套餐模板（规格定义）的管理入口在 PackageTemplateController（/package/template/*）。
 *
 * 权限: 仅平台管理员
 */
@RestController
@RequestMapping("/tenant/package")
public class TenantPackageController {

    @Autowired
    private TenantPackageService tenantPackageService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private PermissionCheck permissionCheck;
    @Autowired
    private MessageNotifyService messageNotifyService;

    /**
     * 创建租户套餐（管理员权限）
     */
    @PostMapping("/insert")
    public Result<Map<String, Long>> insertPackage(@RequestBody TenantPackage pkg,
                                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantPackageService.insertPackage(pkg);
        // 系统自动通知：平台管理员创建租户套餐 → 该租户管理员
        messageNotifyService.notifyTenantPackageChanged(pkg.getTenantId(), "创建");
        return Result.success(Map.of("packageId", id), "租户套餐创建成功");
    }

    /**
     * 修改租户套餐限额（管理员权限）
     */
    @PostMapping("/update")
    public Result<Map<String, Long>> updatePackage(@RequestBody TenantPackage pkg,
                                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantPackageService.updatePackage(pkg);
        // 系统自动通知：平台管理员修改租户套餐配额 → 该租户管理员
        messageNotifyService.notifyTenantPackageChanged(pkg.getTenantId(), "修改");
        return Result.success(Map.of("packageId", id), "租户套餐修改成功");
    }

    /**
     * 删除租户套餐（管理员权限）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> deletePackage(@PathVariable Long id,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
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
     * 分页查询租户套餐列表
     */
    @PostMapping("/page")
    public Result<PageResult<TenantPackage>> getPackageByPage(@RequestBody TenantPackageQueryPage query,
                                                              @RequestHeader("Authorization") String token) {
        PageResult<TenantPackage> result = tenantPackageService.getPackageListByPage(query);
        return Result.success(result, "查询成功");
    }

    /**
     * 按套餐模板为租户创建套餐（租户首次开通）
     */
    @PostMapping("/create-from-template")
    public Result<Map<String, Long>> createFromTemplate(@RequestParam Long tenantId,
                                                        @RequestParam(required = false) Long templateId,
                                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantPackageService.createFromTemplate(tenantId, templateId);
        // 系统自动通知：平台管理员按模板创建租户套餐 → 该租户管理员
        messageNotifyService.notifyTenantPackageChanged(tenantId, "创建");
        return Result.success(Map.of("packageId", id), "租户套餐创建成功");
    }

    /**
     * 变更租户选用的套餐模板（降级时已用量超限会被拒绝）
     */
    @PostMapping("/{tenantId}/switch-template")
    public Result<Boolean> switchTemplate(@PathVariable Long tenantId,
                                          @RequestParam Long templateId,
                                          @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        tenantQuotaService.switchTemplate(tenantId, templateId);
        // 系统自动通知：平台管理员切换租户套餐模板 → 该租户管理员
        messageNotifyService.notifyTenantPackageChanged(tenantId, "切换模板");
        return Result.success(true, "套餐模板变更成功");
    }

    /**
     * 单租户额度对账：把当前数量校正为实际统计值
     */
    @PostMapping("/reconcile/{tenantId}")
    public Result<Boolean> reconcile(@PathVariable Long tenantId,
                                     @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        boolean changed = tenantQuotaService.reconcile(tenantId);
        return Result.success(changed, changed ? "发现偏差并已校正" : "数据一致，无需校正");
    }

    /**
     * 全量额度对账
     */
    @PostMapping("/reconcile-all")
    public Result<Map<String, Integer>> reconcileAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int fixed = tenantQuotaService.reconcileAll();
        return Result.success(Map.of("fixedTenants", fixed), "对账完成");
    }

    /**
     * 查询全部租户套餐列表
     */
    @GetMapping("/list")
    public Result<List<TenantPackage>> listAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        List<TenantPackage> list = tenantPackageService.listAll();
        return Result.success(list, "查询成功");
    }
}
