package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.common.RoleConst;
import com.classroom.security.AuthContext;
import com.classroom.service.TenantEclassroomService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 系统内部接口：课堂开关缓存维护（2026-11-20）。
 *
 * <p>为什么需要它：{@link TenantEclassroomService#hasClassroomEnabled} 带 5 分钟内存缓存，
 * 主系统（booking）在平台管理员点「启用 / 禁用 / 解绑」之后，光改
 * {@code sys_tenant_eclassroom} 是不够的 —— 课堂侧还会按旧缓存放行或拦截最多 5 分钟：
 * <ul>
 *   <li>禁用：已停用/欠费的租户还能再进 5 分钟课堂；</li>
 *   <li>启用：刚开通却要继续等 5 分钟才放行。</li>
 * </ul>
 * 主系统改库后立刻调本端点，缓存即被丢弃，下次判定重新查库。
 *
 * <p><b>鉴权</b>：本端点仍在 {@code /api/**} 上，走 AuthInterceptor 的 JWT 校验。
 * 调用方用 {@code role=system} 的服务间短票（该角色在拦截器里豁免课堂开关校验，
 * 否则"禁用后清缓存"这一步自己就会被 403 挡住）。方法内再收一次角色，
 * 防止有人拿普通用户 token 直连 8092 反复清缓存（影响不大，但没理由开口子）。
 */
@RestController
@RequestMapping("/api/v1/system/eclassroom")
public class SystemEclassroomController {

    private static final Logger log = LoggerFactory.getLogger(SystemEclassroomController.class);

    private final TenantEclassroomService tenantEclassroomService;

    public SystemEclassroomController(TenantEclassroomService tenantEclassroomService) {
        this.tenantEclassroomService = tenantEclassroomService;
    }

    /**
     * 清掉指定租户的课堂开关缓存。
     *
     * @param tenantId 目标租户 ID
     */
    @PostMapping("/tenant/{tenantId}/evict")
    public Result<Boolean> evictTenantCache(@PathVariable Long tenantId) {
        String role = AuthContext.currentRole();
        boolean allowed = RoleConst.SYSTEM.equals(role) || RoleConst.isPlatformAdmin(role);
        if (!allowed) {
            log.warn("[eclassroom] 拒绝非系统调用清缓存: role={}, tenantId={}", role, tenantId);
            return Result.fail(403, "无权清理课堂开关缓存");
        }
        if (tenantId == null || tenantId <= 0L) {
            return Result.fail(400, "租户 ID 无效");
        }
        tenantEclassroomService.evictCache(tenantId);
        log.info("[eclassroom] 已清除租户{}课堂开关缓存（调用方 role={}）", tenantId, role);
        return Result.success(true, "缓存已清");
    }
}
