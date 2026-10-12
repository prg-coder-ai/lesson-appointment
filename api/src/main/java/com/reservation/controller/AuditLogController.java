package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.reservation.audit.AuditAction;
import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.entity.AuditLog;
import com.reservation.mapper.AuditLogMapper;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

/**
 * 审计日志浏览接口（仅管理员可访问）
 */
@RestController
@RequestMapping("/api/v1/audit-logs")
public class AuditLogController {

    private final AuditLogMapper auditLogMapper;

    @Autowired
    private PermissionCheck permissionCheck;

    public AuditLogController(AuditLogMapper auditLogMapper) {
        this.auditLogMapper = auditLogMapper;
    }

    /** 分页查询审计日志 */
    @GetMapping
    public Result<PageResult<AuditLog>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String resultStatus,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestHeader("Authorization") String token) {

        // 方法级兜底（2026-10-10 P1-4）：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN
        permissionCheck.checkAdmin(token);
        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        if (userId != null && !userId.isEmpty())
            wrapper.eq(AuditLog::getUserId, userId);
        if (action != null && !action.isEmpty())
            wrapper.eq(AuditLog::getAction, action);
        if (resourceType != null && !resourceType.isEmpty())
            wrapper.eq(AuditLog::getResourceType, resourceType);
        if (resultStatus != null && !resultStatus.isEmpty())
            wrapper.eq(AuditLog::getResultStatus, resultStatus);
        if (startDate != null && !startDate.isEmpty())
            wrapper.ge(AuditLog::getCreatedAt, startDate + " 00:00:00");
        if (endDate != null && !endDate.isEmpty())
            wrapper.le(AuditLog::getCreatedAt, endDate + " 23:59:59");
        wrapper.orderByDesc(AuditLog::getCreatedAt);

        Page<AuditLog> pageResult = auditLogMapper.selectPage(
            new Page<>(page, size), wrapper);
        return Result.ok(PageResult.of(pageResult));
    }

    /** 查看单条审计日志详情 */
    @GetMapping("/{logId}")
    public Result<AuditLog> detail(@PathVariable String logId,
                                   @RequestHeader("Authorization") String token) {
        // 方法级兜底（2026-10-10 P1-4）：对齐 AuthzRules 声明 PLATFORM_OR_TENANT_ADMIN
        permissionCheck.checkAdmin(token);
        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AuditLog::getLogId, logId);
        return Result.ok(auditLogMapper.selectOne(wrapper));
    }

    /** 操作类型枚举列表（供前端下拉框使用） */
    @GetMapping("/actions")
    public Result<List<String>> actions(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.ok(Arrays.stream(AuditAction.values())
            .map(Enum::name).toList());
    }
}
