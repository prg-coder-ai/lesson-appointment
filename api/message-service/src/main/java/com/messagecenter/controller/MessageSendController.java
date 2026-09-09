package com.messagecenter.controller;

import com.messagecenter.common.Result;
import com.messagecenter.common.RoleConst;
import com.messagecenter.dto.SendMessageReq;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.MessageService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 消息推送接口（发送 / 广播 / 系统触发）
 * 发送方身份取自 JWT。
 *  - 下行(教师/管理员/系统→学生等)：任意已登录 + 发送方角色合法
 *  - student 上行(向教师/管理员) 也允许
 */
@RestController
@RequestMapping("/api/v1/messages")
public class MessageSendController {

    private final MessageService messageService;

    public MessageSendController(MessageService messageService) { this.messageService = messageService; }

    private void assertSenderAllowed() {
        String role = MessageAuthContext.currentRole();
        // 平台管理员/租户管理员/教师 可下行；学生只可向指定用户(上行)；system 走内部
        if (role == null) throw new MessageBizException(401, "未登录");
    }

    private Long resolveCreateTenant() {
        Long tenant = MessageAuthContext.currentTenantId();
        if (tenant == null || tenant < 0) tenant = 0L;
        return tenant;
    }

    /** 发送单条/群发(指定用户列表) */
    @PostMapping("/send")
    public Result<Map<String, Object>> send(@Valid @RequestBody SendMessageReq req) {
        assertSenderAllowed();
        Long tenant = req.getTargetTenantId() != null && MessageAuthContext.isPlatformAdmin() ? req.getTargetTenantId() : resolveCreateTenant();
        String uid = MessageAuthContext.currentUserId();
        String role = MessageAuthContext.currentRole();
        if (RoleConst.STUDENT.equals(role) && Boolean.TRUE.equals(req.getBroadcast()))
            throw new MessageBizException(403, "学生无权广播");
        return Result.success(messageService.sendToUsers(req, tenant, uid, role), "发送成功");
    }

    /** 广播（全体/角色投递）：管理员/教师 */
    @PostMapping("/broadcast")
    public Result<Map<String, Object>> broadcast(@RequestBody SendMessageReq req) {
        if (!RoleConst.canSendDownstream(MessageAuthContext.currentRole()))
            throw new MessageBizException(403, "无权广播消息");
        Long tenant = req.getTargetTenantId() != null && MessageAuthContext.isPlatformAdmin() ? req.getTargetTenantId() : resolveCreateTenant();
        return Result.success(messageService.broadcast(req, tenant, MessageAuthContext.currentUserId(), MessageAuthContext.currentRole()), "广播已受理");
    }

    /** 系统通知（供业务系统/平台管理员以 system 触发） */
    @PostMapping("/system")
    public Result<Map<String, Object>> system(@RequestBody SendMessageReq req) {
        String role = MessageAuthContext.currentRole();
        if (!RoleConst.SYSTEM.equals(role) && !RoleConst.isManager(role))
            throw new MessageBizException(403, "仅系统或管理员可发送系统通知");
        Long tenant = req.getTargetTenantId() != null ? req.getTargetTenantId() : resolveCreateTenant();
        return Result.success(messageService.sendSystem(req, tenant, MessageAuthContext.currentUserId()), "系统通知已发送");
    }
}
