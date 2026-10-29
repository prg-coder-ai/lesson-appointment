package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.metrics.BizMetrics;
import com.classroom.metrics.PrometheusTextWriter;
import com.classroom.security.AuthContext;
import com.classroom.service.MonitorService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 实时监控与部署健康（F8-01）+ 指标暴露（F8-07）。
 *
 * <p>独立于 {@code AdminConsoleController}（那边只有课堂列表与远程结束），
 * 这里回答运营真正会问的三个问题：现在几节课在跑、多少人真在线、有没有异常堆着。
 */
@RestController
@RequestMapping("/api/v1/admin/monitor")
public class AdminMonitorController {

    private final MonitorService monitorService;
    private final BizMetrics bizMetrics;

    public AdminMonitorController(MonitorService monitorService, BizMetrics bizMetrics) {
        this.monitorService = monitorService;
        this.bizMetrics = bizMetrics;
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

    /**
     * Prometheus 抓取端点（文本格式）。
     *
     * <p><b>为什么不挂在 {@code /actuator/prometheus}</b>：actuator 的暴露清单是
     * {@code health,info}，刻意收得很紧（{@code env/beans/configprops} 都关了）。
     * 若为指标把它改成 {@code prometheus}，等于同时放开一个匿名可访问的端点——
     * 课堂服务的部署往往直接对公网。这里走业务鉴权路径（仅管理员），
     * 抓取方用服务账号 token 即可，不需要为监控单独开匿名口子。
     *
     * <p><b>为什么用 ResponseEntity 而不是 Result</b>：Prometheus 只认纯文本，
     * 套一层 {@code {code,data,message}} 会让抓取直接失败（解析报错，
     * 且报错信息只会说"格式错误"，很难联想到是包装层）。
     */
    @GetMapping(value = "/prometheus", produces = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8")
    public ResponseEntity<String> prometheus() {
        if (!AuthContext.isManager()) {
            // 抓取方看到 403 就知道是权限问题；这里不能返回 JSON，否则对方会当成格式错误
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN).body("# forbidden\n");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8"))
                .body(PrometheusTextWriter.render(bizMetrics.registry()));
    }

    private Long resolveTenant(Long requested) {
        if (AuthContext.isPlatformAdmin()) return requested;
        Long own = AuthContext.currentTenantId();
        return own == null ? -1L : own;
    }
}
