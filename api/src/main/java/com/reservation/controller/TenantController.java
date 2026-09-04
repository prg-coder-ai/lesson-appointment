package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.entity.Industry;
import com.reservation.entity.Tenant;
import com.reservation.mapper.IndustryMapper;
import com.reservation.query.TenantQueryPage;
import com.reservation.service.TenantQuotaService;
import com.reservation.service.TenantService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 租户管理控制器（平台管理）
 * 接口前缀: /tenant/*
 * 权限说明：
 * - platform_admin：管理全部租户（增删改、状态流转、续期、套餐变更、软删除/恢复）
 * - 租户管理员及普通用户：仅可只读查看自己所属租户的信息
 */
@RestController
@RequestMapping("/tenant")
public class TenantController {

    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private PermissionCheck permissionCheck;
    @Autowired
    private IndustryMapper industryMapper;

    /**
     * 分页查询租户列表
     * 平台管理员：全部；其他角色：强制只看自己所属租户
     */
    @PostMapping("/page")
    public Result<PageResult<Tenant>> getTenantByPage(@RequestBody TenantQueryPage query,
                                                      @RequestHeader("Authorization") String token) {
        if (!permissionCheck.isPlatformAdmin(token)) {
            Long tenantId = permissionCheck.getTenantIdFromToken(token);
            query.setDeleted(0);
            query.setStatus(null);
            query.setKeyword(null);
            query.setExpireStart(null);
            query.setExpireEnd(null);
            query.setTenantIdFilter(tenantId);
        }
        return Result.success(tenantService.getTenantListByPage(query), "查询成功");
    }

    /**
     * 查询租户详情
     */
    @GetMapping("/{id}")
    public Result<Tenant> getTenant(@PathVariable Long id,
                                    @RequestHeader("Authorization") String token) {
        permissionCheck.checkTenantRead(token, id);
        Tenant tenant = tenantService.getById(id);
        if (tenant == null) {
            return Result.fail(404, "租户不存在");
        }
        return Result.success(tenant, "查询成功");
    }

    /**
     * 查询当前登录者所属租户（只读，各角色可用）
     */
    @GetMapping("/current")
    public Result<Tenant> getCurrentTenant(@RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            return Result.fail(404, "未查询到所属租户信息");
        }
        return Result.success(tenant, "查询成功");
    }

    /**
     * 查询租户所属行业编码（前端据此调用 switchIndustry() 切换行业词表）
     * GET /tenant/industry?tenantCode=TENANT_A
     *
     * 返回：{ tenantCode, tenantId, industryId, industryCode, industryName }
     * industryCode 取自 sys_industry.code（如 education / legal / counseling），需与前端 TERM_DICT 的 key 对齐。
     *
     * 权限：
     * - platform_admin：可按 code 查任意租户（平台租户 code=platform 无 sys_tenant 记录，返回 null）
     * - 其余角色：强制用 token 所属租户，忽略传入的 tenantCode，防止借本接口探测其他租户的行业
     */
    @GetMapping("/industry")
    public Result<Map<String, Object>> getIndustry(@RequestParam(required = false) String tenantCode,
                                                   @RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Tenant tenant;
        if (permissionCheck.isPlatformAdmin(token)) {
            tenant = (tenantCode == null || tenantCode.trim().isEmpty())
                    ? null : tenantService.getByCode(tenantCode.trim());
        } else {
            tenant = tenantService.getById(tenantId);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("tenantCode", tenant != null ? tenant.getTenantCode() : tenantCode);
        data.put("tenantId", tenant != null ? tenant.getId() : tenantId);
        if (tenant == null) {
            data.put("industryId", null);
            data.put("industryCode", null);
            data.put("industryName", null);
            return Result.success(data, "查询成功");
        }

        Long industryId = tenant.getIndustryId();
        data.put("industryId", industryId);
        String code = null;
        String name = null;
        if (industryId != null && industryId > 0) {
            Industry ind = industryMapper.selectById(industryId);
            if (ind != null) {
                code = ind.getCode();
                name = ind.getName();
            }
        }
        data.put("industryCode", code);
        data.put("industryName", name);
        return Result.success(data, "查询成功");
    }

    /**
     * 全部租户列表（平台管理员）
     */
    @GetMapping("/list")
    public Result<List<Tenant>> listAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(tenantService.listAll(), "查询成功");
    }

    /**
     * 新增租户
     */
    @PostMapping("/insert")
    public Result<Map<String, Long>> insertTenant(@RequestBody Tenant tenant,
                                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantService.insertTenant(tenant);
        return Result.success(Map.of("tenantId", id), "租户创建成功");
    }

    /**
     * 修改租户信息
     */
    @PostMapping("/update")
    public Result<Tenant> updateTenant(@RequestBody Tenant tenant,
                                       @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantService.updateTenant(tenant);
        Tenant updated = tenantService.getById(id);
        return Result.success(updated, "租户修改成功");
    }

    /**
     * 删除租户（软删除，数据保留可恢复）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> deleteTenant(@PathVariable Long id,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.softDelete(id);
        return rows > 0 ? Result.success(true, "租户已删除（数据保留，可恢复）")
                        : Result.success(false, "删除失败，记录不存在");
    }

    /**
     * 恢复已删除的租户
     */
    @PostMapping("/{id}/restore")
    public Result<Boolean> restoreTenant(@PathVariable Long id,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.restore(id);
        return rows > 0 ? Result.success(true, "租户已恢复")
                        : Result.success(false, "恢复失败，记录不存在");
    }

    /**
     * 状态流转：status=1启用 2停用 3退租
     */
    @PostMapping("/{id}/status")
    public Result<Boolean> changeStatus(@PathVariable Long id,
                                        @RequestParam Integer status,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.changeStatus(id, status);
        return rows > 0 ? Result.success(true, "状态更新成功")
                        : Result.success(false, "状态更新失败");
    }

    /**
     * 续期
     */
    @PostMapping("/{id}/renew")
    public Result<Boolean> renew(@PathVariable Long id,
                                 @RequestParam Integer months,
                                 @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.renew(id, months);
        return rows > 0 ? Result.success(true, "续期成功")
                        : Result.success(false, "续期失败");
    }

    /**
     * 变更套餐模板：套用模板限额并更新 sys_tenant.package_id
     * 降级时若已用量超出新模板限额将被拒绝
     */
    @PostMapping("/{id}/package")
    public Result<Boolean> changePackage(@PathVariable Long id,
                                         @RequestParam Long templateId,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        tenantQuotaService.switchTemplate(id, templateId);
        return Result.success(true, "套餐变更成功");
    }
}
