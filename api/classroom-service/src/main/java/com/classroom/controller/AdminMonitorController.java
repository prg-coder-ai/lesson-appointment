package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.security.AuthContext;
import com.classroom.service.MonitorService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 实时监控与部署健康（F8-01）。
 *
 * <p>独立于 {@code AdminConsoleController}（那边只有课堂列表与远程结束），
 * 这里回答运营真正会问的三个问题：现在几节课在跑、多少人真在线、有没有异常堆着。
 */
@RestController
@RequestMapping("/api/v1/admin/monitor")
public class AdminMonitorController {

    private final MonitorService monitorService;

    public AdminMonitorController(MonitorService monitorService) {
        this.monitorService = monitorService;
    }

    /** 实时概览：并发课堂、在线人数、今日水位、活跃课堂明细 */
    @GetMapping("/overview")
    public Result<Map<String, Object>> overview(@RequestParam(required = false) Long tenantId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看实时监控");
        }
        return Result.ok(monitorService.overview(resolveTenant(tenantId)));
    }

    /** 告警聚合：未处置对账差异 + 卡在 LIVE 的课堂 */
    @GetMapping("/alerts")
    public Result<Map<String, Object>> alerts(@RequestParam(required = false) Long tenantId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看告警");
        }
        return Result.ok(monitorService.alerts(resolveTenant(tenantId)));
    }

    /** 部署健康：RTC/录制/存储的实际选型与降级情况 */
    @GetMapping("/metrics")
    public Result<Map<String, Object>> metrics() {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看部署状态");
        }
        return Result.ok(monitorService.metrics());
    }

    private Long resolveTenant(Long requested) {
        if (AuthContext.isPlatformAdmin()) return requested;
        Long own = AuthContext.currentTenantId();
        return own == null ? -1L : own;
    }
}
