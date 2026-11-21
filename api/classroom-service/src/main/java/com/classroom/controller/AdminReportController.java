package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.ReconcileDiff;
import com.classroom.reconcile.ReconcileDiffHandler;
import com.classroom.security.AuthContext;
import com.classroom.service.ExportService;
import com.classroom.service.LearningReportService;
import com.classroom.service.ReconcileService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 运营数据台（F7-04 学情报表 / F7-05 对账差异 / F8-04 数据导出）。
 *
 * <p>租户口径一律「服务端定」：{@code platform_admin} 可看全量或指定租户，
 * 其余管理员只能看自己租户 —— 客户端传什么 tenantId 都不作数（防越权窥探他租户学情）。
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin")
public class AdminReportController {

    private final LearningReportService learningReportService;
    private final ReconcileService reconcileService;
    private final ReconcileDiffHandler diffHandler;
    private final ExportService exportService;

    public AdminReportController(LearningReportService learningReportService,
                                 ReconcileService reconcileService,
                                 ReconcileDiffHandler diffHandler,
                                 ExportService exportService) {
        this.learningReportService = learningReportService;
        this.reconcileService = reconcileService;
        this.diffHandler = diffHandler;
        this.exportService = exportService;
    }

    /** 学情报表：出勤率/迟到率/互动次数，按课堂与学生两个维度 */
    @GetMapping("/reports/learning")
    public Result<Map<String, Object>> learning(@RequestParam(required = false) String from,
                                                @RequestParam(required = false) String to,
                                                @RequestParam(required = false) Long tenantId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看学情报表");
        }
        LocalDateTime fromTs = startOf(from);
        LocalDateTime toTs = endOf(to);
        if (fromTs.isAfter(toTs)) {
            return Result.fail(400, "开始时间不能晚于结束时间");
        }
        return Result.ok(learningReportService.build(fromTs, toTs, resolveTenant(tenantId)));
    }

    /** 对账差异列表（默认只看 OPEN） */
    @GetMapping("/reconcile/diffs")
    public Result<List<ReconcileDiff>> diffs(@RequestParam(required = false, defaultValue = "OPEN") String status,
                                             @RequestParam(required = false, defaultValue = "7") int days) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看对账差异");
        }
        return Result.ok(diffHandler.list(status, days));
    }

    /** 处置差异：RESOLVED（已修）/ IGNORED（确认无害） */
    @PostMapping("/reconcile/diffs/{diffId}/resolve")
    public Result<Void> resolve(@PathVariable Long diffId, @RequestBody(required = false) ResolveReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可处置对账差异");
        }
        boolean ignore = req != null && Boolean.TRUE.equals(req.getIgnore());
        String note = req == null ? null : req.getNote();
        if (!diffHandler.resolve(diffId, AuthContext.currentUserId(), note, ignore)) {
            return Result.fail(404, "差异记录不存在");
        }
        return Result.success();
    }

    /** 手动跑一次日终对账（联调/补跑用；定时任务每天 01:00 自动跑） */
    @PostMapping("/reconcile/run")
    public Result<Map<String, Object>> runReconcile() {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可触发对账");
        }
        return Result.ok(reconcileService.dailyReconcile());
    }

    /**
     * 数据导出（CSV）。type=attendance|recordings。
     *
     * <p>用流式响应而非先落盘：运营点导出就该立刻开始下载，不能等整份生成完。
     */
    @GetMapping("/exports/{type}")
    public ResponseEntity<StreamingResponseBody> export(@PathVariable String type,
                                                        @RequestParam(required = false) String from,
                                                        @RequestParam(required = false) String to,
                                                        @RequestParam(required = false) Long tenantId) {
        if (!AuthContext.isManager()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        LocalDateTime fromTs = startOf(from);
        LocalDateTime toTs = endOf(to);
        Long scopedTenant = resolveTenant(tenantId);
        String fileName = type + "_" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE) + ".csv";

        StreamingResponseBody body = out -> exportService.writeCsv(type, fromTs, toTs, scopedTenant, out);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(body);
    }

    /** 平台管理员可指定租户或看全量；租户管理员强制本租户 */
    private Long resolveTenant(Long requested) {
        if (AuthContext.isPlatformAdmin()) return requested;
        Long own = AuthContext.currentTenantId();
        return own == null ? -1L : own;
    }

    /** from 为空默认近 30 天 */
    private LocalDateTime startOf(String date) {
        if (isBlank(date)) return LocalDate.now().minusDays(30).atStartOfDay();
        return LocalDate.parse(date.trim()).atStartOfDay();
    }

    /** to 为「含当天」语义：解析成次日 0 点作为开区间上界 */
    private LocalDateTime endOf(String date) {
        if (isBlank(date)) return LocalDate.now().plusDays(1).atStartOfDay();
        return LocalDate.parse(date.trim()).plusDays(1).atStartOfDay();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    @Data
    public static class ResolveReq {
        private String note;
        private Boolean ignore;
    }
}
