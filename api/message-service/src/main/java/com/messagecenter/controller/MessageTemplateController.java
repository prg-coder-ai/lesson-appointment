package com.messagecenter.controller;

import com.messagecenter.common.PageResult;
import com.messagecenter.common.Result;
import com.messagecenter.dto.TemplateReq;
import com.messagecenter.dto.TemplateSendReq;
import com.messagecenter.entity.MessageTemplate;
import com.messagecenter.exception.MessageBizException;
import com.messagecenter.security.MessageAuthContext;
import com.messagecenter.service.MessageTemplateService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 消息模板管理 + 基于模板发送
 */
@RestController
@RequestMapping("/api/v1/message-templates")
public class MessageTemplateController {

    private final MessageTemplateService templateService;

    public MessageTemplateController(MessageTemplateService templateService) { this.templateService = templateService; }

    private void requireManager() {
        if (!MessageAuthContext.isManager()) throw new MessageBizException(403, "仅管理员可操作消息模板");
    }

    @GetMapping
    public Result<PageResult<MessageTemplate>> page(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String categoryCode) {
        return Result.success(templateService.page(pageNum, pageSize, keyword, categoryCode), "查询成功");
    }

    @GetMapping("/enabled")
    public Result<List<MessageTemplate>> enabled() {
        return Result.success(templateService.listEnabled(), "查询成功");
    }

    @GetMapping("/{id}")
    public Result<MessageTemplate> detail(@PathVariable Long id) {
        return Result.success(templateService.detail(id), "查询成功");
    }

    @PostMapping
    public Result<MessageTemplate> create(@Valid @RequestBody TemplateReq req) {
        requireManager();
        Long tenant = MessageAuthContext.currentTenantId();
        if (tenant == null || tenant < 0) tenant = 0L;
        return Result.success(templateService.create(req, tenant), "创建成功");
    }

    @PutMapping("/{id}")
    public Result<Object> update(@PathVariable Long id, @RequestBody TemplateReq req) {
        requireManager();
        req.setTemplateId(id);
        templateService.update(req);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<Object> delete(@PathVariable Long id) {
        requireManager();
        templateService.delete(id);
        return Result.success();
    }

    /** 基于模板+占位参数 发送（可由管理员/教师/系统触发） */
    @PostMapping("/send")
    public Result<Map<String, Object>> send(@RequestBody TemplateSendReq req) {
        String role = MessageAuthContext.currentRole();
        if (!com.messagecenter.common.RoleConst.canSendDownstream(role))
            throw new MessageBizException(403, "无权发送");
        Long tenant = MessageAuthContext.currentTenantId();
        if (tenant == null || tenant < 0) tenant = 0L;
        return Result.success(templateService.sendByTemplate(req, tenant, MessageAuthContext.currentUserId(), role), "发送成功");
    }
}
