package com.reservation.controller;

import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.common.NotifyAudience;
import com.reservation.common.NotifyStage;
import com.reservation.common.Result;
import com.reservation.dto.NotifyRuleDTO;
import com.reservation.entity.NotificationDispatchLog;
import com.reservation.service.NotifyDispatchService;
import com.reservation.service.NotifyRuleService;
import com.reservation.utils.PermissionCheck;
import com.reservation.vo.NotifyPlanVO;
import com.reservation.vo.NotifyRuleVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 上课通知规则接口（租户管理员「系统配置 → 通知规则」）。
 *
 * <p>前缀 {@code /api/v1/notify-rule}：
 * <ul>
 *   <li>{@code /list}、{@code /detail}、{@code /save}、{@code /delete}、{@code /course-options}、
 *       {@code /options} —— 规则的读写与下拉选项；</li>
 *   <li>{@code /preview} —— 试算各档应发时刻（传 appointmentId 走真实课次，传 courseId + lessonTime 走假设值）；</li>
 *   <li>{@code /manual-send}、{@code /dispatch-log} —— 管理员手动补发一条 / 查看某课次的发送流水。</li>
 * </ul>
 *
 * <p>本接口不在 SecurityConfig 白名单内，所有请求都带租户上下文，
 * 租户隔离由 MyBatis-Plus 租户插件自动完成。
 *
 * <p>注意：{@code checkAdmin} 也放行平台管理员（tenantId=0），而租户插件对 tenantId=0
 * 会完全跳过租户条件，因此服务层另有一道 {@code requireTenantContext()} 硬校验——
 * 通知规则按租户隔离，平台管理员不应读到别家租户的配置。
 */
@RestController
@RequestMapping("/api/v1/notify-rule")
public class NotifyRuleController {

    @Autowired
    private NotifyRuleService notifyRuleService;
    @Autowired
    private NotifyDispatchService notifyDispatchService;
    @Autowired
    private PermissionCheck permissionCheck;

    /** 本租户全部通知规则：默认规则置顶 + 各课程覆盖（均含时间点明细） */
    @GetMapping("/list")
    public Result<List<NotifyRuleVO>> list(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(notifyRuleService.listRules(), "查询成功");
    }

    /**
     * 单个作用域的规则明细（含已停用档位）。
     *
     * @param courseId 课程ID；为空/不传 = 租户默认规则
     */
    @GetMapping("/detail")
    public Result<NotifyRuleVO> detail(@RequestParam(value = "courseId", required = false) String courseId,
                                       @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(notifyRuleService.getRule(courseId), "查询成功");
    }

    /**
     * 整组保存规则。
     *
     * <p>时间点收「数值 + 粒度」（如 3 + day），由服务端统一换算成分钟；
     * 服务端按提前量降序重排档位并校验严格递减、去重、非空。
     */
    @PostMapping("/save")
    @Audit(action = AuditAction.NOTIFY_RULE_UPDATE, resourceType = "notify_rule")
    public Result<Boolean> save(@RequestBody NotifyRuleDTO dto,
                                @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long ruleId = notifyRuleService.save(dto);
        return Result.success(ruleId != null, "通知规则已保存");
    }

    /** 删除课程级覆盖；租户默认规则不允许删除（停用请用「启用」开关） */
    @PostMapping("/delete")
    @Audit(action = AuditAction.NOTIFY_RULE_DELETE, resourceType = "notify_rule")
    public Result<Boolean> delete(@RequestBody Map<String, String> body,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        String courseId = body == null ? null : body.get("courseId");
        int rows = notifyRuleService.deleteRule(courseId);
        return rows > 0
                ? Result.success(true, "课程通知规则已删除，该课程将改用租户默认规则")
                : Result.fail(400, "规则不存在或已被删除");
    }

    /** 本租户课程下拉选项（供「新增课程覆盖」选择课程用） */
    @GetMapping("/course-options")
    public Result<List<Map<String, Object>>> courseOptions(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(notifyRuleService.listCourseOptions(), "查询成功");
    }

    /**
     * 枚举下拉选项：档位码 / 接收人 / 录入粒度。
     *
     * <p>由服务端下发而非前端写死：档位码一旦新增（例如以后加「课后回访」），
     * 只有服务端这一处要改，前端下拉自动跟上。
     */
    @GetMapping("/options")
    public Result<Map<String, Object>> options(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("stages", NotifyStage.options());
        data.put("audiences", NotifyAudience.options());
        data.put("units", List.of(
                unit("day", "天"), unit("hour", "小时"), unit("minute", "分钟")));
        return Result.success(data, "查询成功");
    }

    private Map<String, String> unit(String code, String text) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("text", text);
        return m;
    }

    /**
     * 试算各档应发时刻。
     *
     * @param appointmentId 真实课次ID；给了它就用该课次的时间与课程，并回带「该档是否已发」，
     *                      此时 {@code courseId / lessonTime} 可省略
     * @param courseId      课程ID（配置页试算用）
     * @param lessonTime    假想的课次时间；不传则按「明天此刻」试算
     */
    @GetMapping("/preview")
    public Result<NotifyPlanVO> preview(@RequestParam(value = "appointmentId", required = false) Integer appointmentId,
                                        @RequestParam(value = "courseId", required = false) String courseId,
                                        @RequestParam(value = "lessonTime", required = false) String lessonTime,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        if (appointmentId != null) {
            return Result.success(notifyDispatchService.planByAppointment(appointmentId), "查询成功");
        }
        return Result.success(notifyRuleService.preview(courseId, lessonTime), "查询成功");
    }

    /**
     * 管理员手动发送一次上课提醒。
     *
     * <p>按「当前距上课还有多久」自动判定该发哪一档；不受自动发送的幂等限制
     * （每次的 dedup_key 都不同），但仍会写入流水表以便审计。
     *
     * @param body {@code {"appointmentId": 123}}
     */
    @PostMapping("/manual-send")
    @Audit(action = AuditAction.APPOINTMENT_NOTE, resourceType = "appointment")
    public Result<Map<String, Object>> manualSend(@RequestBody Map<String, Object> body,
                                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Integer appointmentId = null;
        if (body != null && body.get("appointmentId") != null) {
            try {
                appointmentId = Integer.valueOf(String.valueOf(body.get("appointmentId")).trim());
            } catch (NumberFormatException e) {
                return Result.fail(400, "课次ID格式不正确");
            }
        }
        if (appointmentId == null) {
            return Result.fail(400, "请提供 appointmentId");
        }
        String operatorId = permissionCheck.getUserIdFromToken(token);
        Map<String, Object> result = notifyDispatchService.manualSend(appointmentId, operatorId);
        int sent = result.get("sent") == null ? 0 : Integer.parseInt(String.valueOf(result.get("sent")));
        return sent > 0
                ? Result.success(result, "已发送「" + result.get("stageText") + "」提醒")
                : Result.fail(400, "没有可用的收件人，提醒未发出");
    }

    /**
     * 某课次的发送流水（排查「这条到底发没发、什么时候发的」）。
     */
    @GetMapping("/dispatch-log")
    public Result<List<NotificationDispatchLog>> dispatchLog(
            @RequestParam("appointmentId") Integer appointmentId,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(notifyDispatchService.dispatchLogs(appointmentId), "查询成功");
    }
}
