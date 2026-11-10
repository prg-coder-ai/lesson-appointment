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

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
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
        // 日期边界必须先折算成 UTC 墙钟（见 toUtcWallClock），解析失败返回 null 时**跳过**该条件，
        // 不能直接塞进 wrapper —— created_at >= NULL 恒不成立，会让整页查询空掉。
        String startUtc = toUtcWallClock(startDate, false);
        String endUtc = toUtcWallClock(endDate, true);
        if (startUtc != null)
            wrapper.ge(AuditLog::getCreatedAt, startUtc);
        if (endUtc != null)
            wrapper.le(AuditLog::getCreatedAt, endUtc);
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

    /** 与 audit_log.created_at 的列精度对齐（datetime(0)，秒级）。 */
    private static final DateTimeFormatter UTC_WALL_CLOCK = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 把前端传来的日期筛选边界换算成 {@code created_at} 的 <b>UTC 墙钟</b>。
     *
     * <p><b>为什么必须换算</b>：本表存的是 UTC 墙钟（数据源连接串
     * {@code serverTimezone=UTC} + Connector/J 默认 {@code preserveInstants=true}，
     * 写入端 {@code AuditAspect} 只做 {@code setCreatedAt(new Date())}），
     * 而用户在页面上选的是<b>本地日期</b>。修复前的写法是
     * {@code startDate + " 00:00:00"} 直接比较，等于按 UTC 解释用户的本地日期，
     * 查询边界整体偏一个时区（东八区偏 8 小时：本地上午 8 点前的记录查不到，
     * 又混进前一天 16:00 之后的记录）。
     *
     * <p><b>为什么不改用 {@code ZoneId.systemDefault()}</b>：云托管容器默认 TZ=UTC，
     * 服务器时区与用户浏览器时区不是一回事，用服务器时区换算会在容器里再错一次。
     * 因此本地时区只能<b>由前端算好</b>，以带偏移的 ISO 串传进来。
     *
     * <p><b>入参两种形态</b>：
     * <ul>
     *   <li>ISO-8601 带偏移（{@code 2026-10-23T16:00:00.000Z}）— 前端按浏览器时区算好，精确；</li>
     *   <li>纯日期 {@code yyyy-MM-dd} — 兼容旧调用方，按 UTC 解释（与修复前行为一致）。</li>
     * </ul>
     *
     * @param raw      原始入参，null/空 返回 null
     * @param endOfDay 仅对纯日期形态生效：true 取当天 23:59:59，false 取 00:00:00
     * @return {@code yyyy-MM-dd HH:mm:ss} 的 UTC 墙钟串；无法解析返回 null（调用方跳过该条件）
     */
    private static String toUtcWallClock(String raw, boolean endOfDay) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty()) return null;
        try {
            if (v.indexOf('T') > 0) {
                // 带偏移的完整时刻：折算到 UTC，再取 UTC 墙钟
                return OffsetDateTime.parse(v)
                        .withOffsetSameInstant(ZoneOffset.UTC)
                        .toLocalDateTime()
                        .format(UTC_WALL_CLOCK);
            }
            LocalDate d = LocalDate.parse(v.substring(0, Math.min(10, v.length())));
            return (endOfDay ? d.atTime(23, 59, 59) : d.atStartOfDay())
                    .format(UTC_WALL_CLOCK);
        } catch (DateTimeParseException e) {
            // 参数非法就当没传：比抛 500 或静默返回空列表更好定位
            return null;
        }
    }
}
