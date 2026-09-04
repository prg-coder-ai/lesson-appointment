package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.dto.TenantUsageDTO;
import com.reservation.entity.Tenant;
import com.reservation.query.TenantQueryPage;
import com.reservation.service.DashboardService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 平台看板控制器：运行管理 + 运营统计
 * 接口前缀: /dashboard/*
 * 权限: 平台管理员看全平台；租户管理员仅可查看本租户用量
 */
@RestController
@RequestMapping("/dashboard")
public class DashboardController {

    @Autowired
    private DashboardService dashboardService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 运行管理：各租户用量与额度占比（分页）
     */
    @PostMapping("/tenant/usage/page")
    public Result<PageResult<TenantUsageDTO>> usagePage(@RequestBody TenantQueryPage query,
                                                        @RequestHeader("Authorization") String token) {
        if (!permissionCheck.isPlatformAdmin(token)) {
            query.setTenantIdFilter(permissionCheck.getTenantIdFromToken(token));
            query.setDeleted(0);
            query.setStatus(null);
            query.setKeyword(null);
            query.setExpireStart(null);
            query.setExpireEnd(null);
        }
        return Result.success(dashboardService.getTenantUsagePage(query), "查询成功");
    }

    /**
     * 运行管理：单租户用量详情（含与上月的变化）
     */
    @GetMapping("/tenant/{tenantId}/usage")
    public Result<TenantUsageDTO> tenantUsage(@PathVariable Long tenantId,
                                              @RequestHeader("Authorization") String token) {
        permissionCheck.checkTenantRead(token, tenantId);
        TenantUsageDTO dto = dashboardService.getTenantUsage(tenantId);
        if (dto == null) {
            return Result.fail(404, "租户不存在");
        }
        return Result.success(dto, "查询成功");
    }

    /**
     * 运营统计：平台总览（租户数、新增、退租、用户数、在线数、到期预警）
     */
    @GetMapping("/overview")
    public Result<Map<String, Object>> overview(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(dashboardService.getOverview(), "查询成功");
    }

    /**
     * 运营统计：租户增减趋势
     */
    @GetMapping("/tenant/trend")
    public Result<List<Map<String, Object>>> tenantTrend(@RequestHeader("Authorization") String token,
                                                         @RequestParam(defaultValue = "12") int months) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(dashboardService.getTenantTrend(months), "查询成功");
    }

    /**
     * 运营统计：在线人数（总数 + 各租户分布）
     */
    @GetMapping("/online")
    public Result<Map<String, Object>> online(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(dashboardService.getOnline(), "查询成功");
    }

    /**
     * 运营统计：到期预警租户名单
     */
    @GetMapping("/expire-warning")
    public Result<List<Tenant>> expireWarning(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(dashboardService.getExpireWarning(), "查询成功");
    }
}
