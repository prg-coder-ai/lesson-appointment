package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.service.LessonLedgerService;
import com.reservation.utils.PermissionCheck;
import com.reservation.vo.LessonBalanceVO;
import com.reservation.vo.LessonFlowVO;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 「我的课时」查询端点（2026-10-28，课时扣减方案 v2 的前端落地）。
 *
 * <p><b>只读</b>。充值/改判属写操作，需要运营后台页面，本轮未开放对外端点
 * （{@code LessonDeductionService#manualAdjust} 已就绪，缺 UI 与权限配置）。
 *
 * <p>路径前缀选 {@code /api/v1/lesson} 而不是 {@code /api/v1/lesson-attendance}：
 * 后者是课堂回流表名，语义上属于"课堂出勤"，与"课时账本"是两件事；
 * 也刻意避开了 {@code /api/v1/message} 这类会被授权守卫跳过的前缀。
 */
@RestController
@RequestMapping("/api/v1/lesson")
public class LessonLedgerController {

    private final LessonLedgerService lessonLedgerService;
    private final PermissionCheck permissionCheck;

    public LessonLedgerController(LessonLedgerService lessonLedgerService,
                                  PermissionCheck permissionCheck) {
        this.lessonLedgerService = lessonLedgerService;
        this.permissionCheck = permissionCheck;
    }

    /**
     * 当前登录用户的课时账户。学生自己看、教师/管理员看自己的（教师也可能有课时账本）。
     */
    @GetMapping("/balance")
    public Result<LessonBalanceVO> myBalance(@RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(lessonLedgerService.getBalance(tenantId, userId), "查询成功");
    }

    /**
     * 当前登录用户的课时流水（分页，新的在前）。
     */
    @GetMapping("/flows")
    public Result<PageResult<LessonFlowVO>> myFlows(@RequestHeader("Authorization") String token,
                                                    @RequestParam(defaultValue = "1") int pageNum,
                                                    @RequestParam(defaultValue = "20") int pageSize) {
        String userId = permissionCheck.getUserIdFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(lessonLedgerService.pageFlows(tenantId, userId, pageNum, pageSize), "查询成功");
    }

    /**
     * 教师/管理员查指定学生的课时账户 + 最近流水（用于答疑与对账）。
     *
     * <p>越权靠两个层次拦住：{@code AuthzRules} 只放行 teacher/admin/platform_admin；
     * 学生归属由 {@link LessonLedgerService#assertStudentVisible} 按租户校验（跨租户 → 404）。
     */
    @GetMapping("/students/{studentId}/balance")
    public Result<Map<String, Object>> studentBalance(@RequestHeader("Authorization") String token,
                                                      @PathVariable String studentId,
                                                      @RequestParam(defaultValue = "10") int flowLimit) {
        permissionCheck.checkTeacherOrAdmin(token);
        lessonLedgerService.assertStudentVisible(studentId);

        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("balance", lessonLedgerService.getBalance(tenantId, studentId));
        int limit = Math.min(Math.max(flowLimit, 1), 50);
        data.put("flows", lessonLedgerService.pageFlows(tenantId, studentId, 1, limit).getRows());
        return Result.success(data, "查询成功");
    }
}
