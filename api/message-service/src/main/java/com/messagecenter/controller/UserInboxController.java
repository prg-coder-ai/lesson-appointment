package com.messagecenter.controller;

import com.messagecenter.common.PageResult;
import com.messagecenter.common.Result;
import com.messagecenter.dto.BatchMessageIdsReq;
import com.messagecenter.entity.MessageInbox;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.InboxService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 用户消息收件箱：列表 / 详情 / 未读数 / 已读未读 / 收藏 / 删除恢复（含批量）
 * 普通用户仅能操作本人；管理员(admin/platform_admin)可代查代管指定 userId 的收件箱。
 */
@RestController
@RequestMapping("/api/v1/users/{userId}")
public class UserInboxController {

    private final InboxService inboxService;

    public UserInboxController(InboxService inboxService) { this.inboxService = inboxService; }

    @GetMapping("/inbox")
    public Result<PageResult<MessageInbox>> inbox(@PathVariable String userId,
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String folder,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer unreadOnly,
            @RequestParam(required = false) String categoryCode,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String start,
            @RequestParam(required = false) String end) {
        return Result.success(inboxService.listInbox(userId, pageNum, pageSize, folder, keyword, unreadOnly, categoryCode, priority, start, end), "查询成功");
    }

    @GetMapping("/starred")
    public Result<PageResult<MessageInbox>> starred(@PathVariable String userId,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(inboxService.listInbox(userId, pageNum, pageSize, "starred", null, null, null, null, null, null), "查询成功");
    }

    @GetMapping("/deleted")
    public Result<PageResult<MessageInbox>> deleted(@PathVariable String userId,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(inboxService.listInbox(userId, pageNum, pageSize, "trash", null, null, null, null, null, null), "查询成功");
    }

    @GetMapping("/inbox/unread-count")
    public Result<Long> unread(@PathVariable String userId) {
        return Result.success(inboxService.unreadCount(userId), "查询成功");
    }

    @GetMapping("/messages/{messageId}")
    public Result<Map<String, Object>> detail(@PathVariable String userId, @PathVariable Long messageId) {
        return Result.success(inboxService.detail(userId, messageId), "查询成功");
    }

    @PostMapping("/messages/{messageId}/read")
    public Result<Object> read(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.setRead(userId, messageId, true);
        return Result.success();
    }

    @PostMapping("/messages/{messageId}/unread")
    public Result<Object> unread(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.setRead(userId, messageId, false);
        return Result.success();
    }

    @PostMapping("/messages/read/batch")
    public Result<Object> batchRead(@PathVariable String userId, @RequestBody BatchMessageIdsReq req) {
        inboxService.batchRead(userId, req.getMessageIds(), true);
        return Result.success();
    }

    @PostMapping("/messages/{messageId}/star")
    public Result<Object> star(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.setStar(userId, messageId, true);
        return Result.success();
    }

    @PostMapping("/messages/{messageId}/unstar")
    public Result<Object> unstar(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.setStar(userId, messageId, false);
        return Result.success();
    }

    @DeleteMapping("/messages/{messageId}")
    public Result<Object> deleteOne(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.deleteOne(userId, messageId);
        return Result.success();
    }

    @DeleteMapping("/messages/batch")
    public Result<Object> batchDelete(@PathVariable String userId, @RequestBody BatchMessageIdsReq req) {
        inboxService.batchDelete(userId, req.getMessageIds());
        return Result.success();
    }

    @PostMapping("/messages/{messageId}/restore")
    public Result<Object> restore(@PathVariable String userId, @PathVariable Long messageId) {
        inboxService.restore(userId, messageId);
        return Result.success();
    }

    /** 审计辅助：列出某用户全部消息 id（供管理端选批量） */
    @GetMapping("/messages/ids")
    public Result<List<Long>> ids(@PathVariable String userId, @RequestParam(required = false) Integer isDeleted) {
        return Result.success(inboxService.listMessageIds(userId, isDeleted), "查询成功");
    }
}
