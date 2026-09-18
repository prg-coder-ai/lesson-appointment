package com.reservation.controller;

import com.reservation.audit.Audit;
import com.reservation.audit.AuditAction;
import com.reservation.common.Result;
import com.reservation.dto.RefundRuleDTO;
import com.reservation.service.RefundRuleService;
import com.reservation.utils.PermissionCheck;
import com.reservation.vo.RefundHintVO;
import com.reservation.vo.RefundRuleVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 课程退改规则接口。
 *
 * <p>前缀 {@code /api/v1/refund-rule}：
 * <ul>
 *   <li>{@code /list}、{@code /save}、{@code /delete}、{@code /course-options}、{@code /preview}
 *       —— 租户管理员专用（「系统配置 → 退改规则」）；</li>
 *   <li>{@code /hint} —— 学生、教师、管理员均可调用，用于请假前 / 审核确认前展示规则提示。</li>
 * </ul>
 *
 * <p>本接口不在 SecurityConfig 白名单内，所有请求都带租户上下文，
 * 租户隔离由 MyBatis-Plus 租户插件自动完成（表中含 tenant_id）。
 */
@RestController
@RequestMapping("/api/v1/refund-rule")
public class RefundRuleController {

    @Autowired
    private RefundRuleService refundRuleService;
    @Autowired
    private PermissionCheck permissionCheck;

    /** 本租户全部退改规则：默认规则置顶 + 各课程覆盖 */
    @GetMapping("/list")
    public Result<List<RefundRuleVO>> list(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(refundRuleService.listRules(), "查询成功");
    }

    /** 本租户课程下拉选项（供「新增课程覆盖」选择课程用；已配置的课程前端自行去重） */
    @GetMapping("/course-options")
    public Result<List<Map<String, Object>>> courseOptions(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(refundRuleService.listCourseOptions(), "查询成功");
    }

    /** 保存规则：courseId 为空串=租户默认规则，非空=课程覆盖 */
    @PostMapping("/save")
    @Audit(action = AuditAction.REFUND_RULE_UPDATE, resourceType = "refund_rule")
    public Result<Boolean> save(@RequestBody RefundRuleDTO dto,
                                @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        refundRuleService.save(dto);
        return Result.success(true, "退改规则已保存");
    }

    /** 删除规则：courseId 为空串=恢复系统内置默认 */
    @PostMapping("/delete")
    @Audit(action = AuditAction.REFUND_RULE_DELETE, resourceType = "refund_rule")
    public Result<Boolean> delete(@RequestBody Map<String, String> body,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        String courseId = body == null ? null : body.get("courseId");
        int rows = refundRuleService.deleteRule(courseId);
        return rows > 0
                ? Result.success(true, "规则已删除")
                : Result.fail(400, "规则不存在或已被删除");
    }

    /**
     * 按课次计算退改提示。
     *
     * <p>学生提交请假前、管理员审核确认请假前都调这个接口，
     * 保证两端看到同一份判定与文案。
     *
     * @param appointmentId 课次ID（appointment.id），优先使用
     * @param scheduleId    排期ID，课次记录尚不存在时的兜底（配合 lessonTime）
     * @param lessonTime    课次时间，配合 scheduleId 使用
     */
    @GetMapping("/hint")
    public Result<RefundHintVO> hint(@RequestParam(value = "appointmentId", required = false) Integer appointmentId,
                                     @RequestParam(value = "scheduleId", required = false) String scheduleId,
                                     @RequestParam(value = "lessonTime", required = false) String lessonTime,
                                     @RequestHeader("Authorization") String token) {
        // 仅要求登录（学生/教师/管理员都要看得到提示），不做管理员限制
        permissionCheck.getRoleFromToken(token);
        if (appointmentId != null) {
            return Result.success(refundRuleService.hintByAppointment(appointmentId), "查询成功");
        }
        if (scheduleId != null && !scheduleId.isBlank()) {
            return Result.success(refundRuleService.hintBySchedule(scheduleId, lessonTime), "查询成功");
        }
        return Result.fail(400, "请提供 appointmentId，或 scheduleId + lessonTime");
    }

    /** 配置页实时预览：给定课程与假设的课次时间，立即算出档位与文案 */
    @GetMapping("/preview")
    public Result<RefundHintVO> preview(@RequestParam(value = "courseId", required = false) String courseId,
                                        @RequestParam(value = "lessonTime", required = false) String lessonTime,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(refundRuleService.previewByCourse(courseId, lessonTime), "查询成功");
    }
}
