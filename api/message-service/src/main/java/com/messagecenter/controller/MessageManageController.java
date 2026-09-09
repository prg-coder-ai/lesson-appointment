package com.messagecenter.controller;

import com.messagecenter.common.PageResult;
import com.messagecenter.common.Result;
import com.messagecenter.entity.Message;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.MessageManageService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 消息追踪与管理（管理员）：发送历史、投递状态、批量任务进度、撤回、重发、ack
 */
@RestController
@RequestMapping("/api/v1/messages")
public class MessageManageController {

    private final MessageManageService manageService;

    public MessageManageController(MessageManageService manageService) { this.manageService = manageService; }

    private void requireManagerOrSender() {
        // 发送历史/详情：管理员 或 发送者本人；控制器内方法再做细化
    }

    /** 发送历史分页（管理员查看运营后台；发送者可看自己） */
    @GetMapping
    public Result<PageResult<Message>> history(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) Long tenantId,
            @RequestParam(required = false) String senderType,
            @RequestParam(required = false) String status) {
        if (!MessageAuthContext.isManager()) throw new MessageBizException(403, "仅管理员可查看发送历史");
        return Result.success(manageService.pageMessages(pageNum, pageSize, tenantId, senderType, status), "查询成功");
    }

    /** 当前用户「已发」消息（发送者视角），含接收/已读统计与是否可收回 */
    @GetMapping("/sent")
    public Result<PageResult<Map<String, Object>>> sent(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(manageService.sentMessages(pageNum, pageSize), "查询成功");
    }

    /** 单条消息投递追踪（含读/收藏/删除统计） */
    @GetMapping("/{messageId}/delivery-status")
    public Result<Map<String, Object>> trace(@PathVariable Long messageId) {
        return Result.success(manageService.messageTrace(messageId), "查询成功");
    }

    /** 批量任务进度 */
    @GetMapping("/batch/{taskId}")
    public Result<Map<String, Object>> task(@PathVariable Long taskId) {
        return Result.success(manageService.taskStatus(taskId), "查询成功");
    }

    /** 撤回消息（管理员/发送者） */
    @PostMapping("/{messageId}/withdraw")
    public Result<Object> withdraw(@PathVariable Long messageId) {
        manageService.withdraw(messageId);
        return Result.success();
    }

    /** 重新推送：对投递失败用户重推（管理员） */
    @PostMapping("/{messageId}/retry")
    public Result<Object> retry(@PathVariable Long messageId) {
        int n = manageService.retryFailed(messageId);
        return Result.success(Map.of("retried", n), "重推完成");
    }

    /** 用户 ack：确认已接收（客户端收到推送后回执） */
    @PostMapping("/{messageId}/ack")
    public Result<Object> ack(@PathVariable Long messageId) {
        String uid = MessageAuthContext.currentUserId();
        if (uid == null) throw new MessageBizException(401, "未登录");
        manageService.ack(messageId, uid);
        return Result.success();
    }
}
