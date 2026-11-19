package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.dto.AddMembersReq;
import com.classroom.dto.CreateTempClassroomReq;
import com.classroom.entity.Classroom;
import com.classroom.security.AuthContext;
import com.classroom.service.AuditService;
import com.classroom.service.ClassroomAdminOpsService;
import com.classroom.service.ClassroomPublishGuard;
import com.classroom.service.ClassroomService;
import com.classroom.ws.WsRoomRegistry;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 运营后台接口（F8）。
 *
 * <p>2026-11-19 新增两个应急端点（B1/B2）：临时建课、临场加学员。
 * 两者都只开放给 manager（admin / platform_admin），并且都写 {@code classroom_audit_log}
 * ——临时操作最容易变成"查不出谁干的"，留痕是硬要求。
 */
@RestController
@RequestMapping("/api/v1/admin/classrooms")
public class AdminConsoleController {

    private final ClassroomService classroomService;
    private final ClassroomAdminOpsService adminOpsService;
    private final AuditService auditService;
    private final ClassroomPublishGuard publishGuard;
    private final WsRoomRegistry wsRegistry;

    public AdminConsoleController(ClassroomService classroomService,
                                  ClassroomAdminOpsService adminOpsService,
                                  AuditService auditService,
                                  ClassroomPublishGuard publishGuard,
                                  WsRoomRegistry wsRegistry) {
        this.classroomService = classroomService;
        this.adminOpsService = adminOpsService;
        this.auditService = auditService;
        this.publishGuard = publishGuard;
        this.wsRegistry = wsRegistry;
    }

    @GetMapping("/monitor")
    public Result<List<Classroom>> monitor(@RequestParam(required = false) String status) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可访问运营后台");
        }
        Long tenantId = AuthContext.isPlatformAdmin() ? null : AuthContext.currentTenantId();
        return Result.ok(classroomService.listByStatus(status != null ? status : "LIVE", tenantId));
    }

    /**
     * 临时建课（B1）。管理员给一个课程名 + 教师 + 学生名单即可，scheduleId 由服务端生成。
     *
     * <p>等价于运营台「重放 created 报文」，但省掉了手写 JSON 与时间格式坑。
     * 建出来的是 {@code SCHEDULED}，需要教师（或管理员带 {@code ?role=teacher}）点「进行中」才开课。
     */
    @PostMapping
    public Result<Map<String, Object>> createTempClassroom(@RequestBody CreateTempClassroomReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可创建临时课堂");
        }
        Map<String, Object> data = adminOpsService.createTempClassroom(req, AuthContext.currentTenantId());
        // 留痕失败不影响建课结果：审计是旁路，不能反过来让应急操作失败
        try {
            auditService.logClassroomCreate(String.valueOf(data.get("scheduleId")),
                    AuthContext.currentUserId(), "临时课堂：" + data.get("courseName"));
        } catch (Exception ignored) {
            // 已记 ERROR 日志在 service 内
        }
        return Result.ok(data);
    }

    /**
     * 临场加学员（B2）：直接写 membership + 出勤行，绕开 booking。
     *
     * <p>适用于「临时课堂没有排期，走不了指定学生」以及「已开课，updated 事件被忽略」两种场景。
     * 幂等：已存在的成员跳过。
     */
    @PostMapping("/{scheduleId}/members")
    public Result<Map<String, Object>> addMembers(@PathVariable String scheduleId,
                                                  @RequestBody AddMembersReq req) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可为课堂加学员");
        }
        Map<String, Object> data = adminOpsService.addMembers(scheduleId, req, AuthContext.currentTenantId());
        Object added = data.get("added");
        if (added instanceof List) {
            for (Object uid : (List<?>) added) {
                try {
                    auditService.logMemberAdd(scheduleId, String.valueOf(uid),
                            AuthContext.currentUserId(), req != null ? req.getNote() : null);
                } catch (Exception ignored) {
                    // 同上：留痕失败不回滚加人
                }
            }
        }
        return Result.ok(data);
    }

    /**
     * 管理员强制结束课堂（运营台「活跃课堂」行内「结束」、告警区「强制下课」共用）。
     *
     * <p>状态口径：走 {@link ClassroomService#endClass} —— 置 <b>CLOSED（正常结束，不是作废）</b>、
     * {@code actualEnd} 记当前时刻，随后 {@code closeAfterEnd} 归一出勤、回流课时、释放媒体房间
     * 与内存态。"强制"只表示不用等教师点下课，结算与正常下课完全一致。
     *
     * <p><b>2026-11-19 补广播</b>：此前这里只改库、不通知前端。后果是管理员在运营台结束课堂后，
     * 教室里的教师/学生页面仍显示「进行中」，而且 {@link ClassroomPublishGuard} 的发布门禁
     * 还认为这间课可以发消息——人能在已关闭的课堂里继续说话，直到刷新页面。
     * 现与教师端入口（{@code ClassroomController#end}）对齐：先让门禁缓存失效，再广播权威状态。
     */
    @PostMapping("/{scheduleId}/end")
    public Result<Void> remoteEnd(@PathVariable String scheduleId) {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可远程结束课堂");
        }
        classroomService.endClass(scheduleId);
        publishGuard.invalidate(scheduleId);
        wsRegistry.broadcastSignal(scheduleId, "{\"type\":\"class:state\",\"status\":\"CLOSED\"}");
        try {
            auditService.logClassroomEnd(scheduleId, AuthContext.currentUserId(), "运营台强制结束");
        } catch (Exception ignored) {
            // 课堂已 CLOSED，留痕失败不该把它变成"结束失败"
        }
        return Result.success();
    }
}
