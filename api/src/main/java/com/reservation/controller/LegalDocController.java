package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.LegalDoc;
import com.reservation.entity.Tenant;
import com.reservation.service.LegalDocService;
import com.reservation.service.TenantService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

/**
 * 协议 / 隐私政策 —— 公开阅读端点（免登录）
 *
 * <h3>鉴权</h3>
 * 本端点为免登录公开接口，四处白名单同步：
 *   · {@code SecurityConfig} 白名单 permitAll
 *   · {@code JwtAuthenticationFilter.WHITELIST_PATHS}
 *   · {@code WebMvcConfig.EXCLUDE_PATTERNS}（第四同步点，跳过租户校验）
 *   · {@code tools/check-authz-declarative.mjs} 的 PERMIT_ALL
 * 漏任一处 → 未登录请求被裸 401，公开页整体失效（只在运行时暴露）。
 *
 * <h3>参数</h3>
 *   type   ：user_agreement / privacy_policy（必填）
 *   tenant ：租户编码（tenantCode）；缺省或 "platform" 视为平台级
 *   lang   ：zh/en/fr，缺省 zh
 *
 * <p>仅返回当前启用版本正文，不暴露历史版本与管理接口（免登录可读 ≠ 免鉴权滥用）。
 */
@RestController
@RequestMapping("/api/v1/legal")
public class LegalDocController {

    @Autowired
    private LegalDocService legalDocService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private PermissionCheck permissionCheck;

    @GetMapping("/doc")
    public Result<Map<String, Object>> getDoc(@RequestParam("type") String type,
                                             @RequestParam(required = false) String tenant,
                                             @RequestParam(required = false) String lang,
                                             HttpServletRequest request) {
        if (type == null || type.isBlank()) {
            return Result.fail(400, "type 不能为空");
        }
        Long tenantId = 0L;
        if (tenant != null && !tenant.isBlank() && !"platform".equalsIgnoreCase(tenant)) {
            Tenant t = tenantService.getByCode(tenant);
            if (t != null) {
                tenantId = t.getId();
            }
        }
        LegalDoc doc = legalDocService.resolve(tenantId, type, lang);
        if (doc == null) {
            return Result.fail(404, "该文档尚未配置");
        }
        Map<String, Object> data = new HashMap<>();
        data.put("docType", doc.getDocType());
        data.put("title", doc.getTitle());
        data.put("content", doc.getContent());
        data.put("version", doc.getVersion());
        data.put("language", doc.getLanguage());
        // 标记实际命中的作用域：租户级覆盖 or 平台级兜底（前端可据此提示）
        data.put("scopeTenantId", doc.getTenantId());
        return Result.success(data, "查询成功");
    }

    /**
     * 用户签署协议 / 隐私政策（场景 B：租户 ↔ 用户）。
     * 需登录（从令牌识别用户），记录当前生效版本留痕（幂等 upsert）。
     * 版本号以服务端 resolve 当前可见版本为准，不信任前端传值（防止签错版本）。
     *
     * <p>本端点非免登录，不在四处白名单；未登录请求会被 JWT 过滤器拦截至 401。
     */
    @PostMapping("/accept")
    public Result<Void> accept(@RequestBody Map<String, String> body,
                              @RequestHeader("Authorization") String token,
                              HttpServletRequest request) {
        String docType = body.get("docType");
        if (docType == null || docType.isBlank()) {
            return Result.fail(400, "docType 不能为空");
        }
        Long tenantId;
        String userId;
        try {
            tenantId = permissionCheck.getTenantIdFromToken(token);
            userId = permissionCheck.getUserIdFromToken(token);
        } catch (Exception e) {
            return Result.fail(401, "登录状态无效，请重新登录");
        }
        LegalDoc doc = legalDocService.resolve(tenantId, docType, null);
        if (doc == null) {
            return Result.fail(404, "该文档尚未配置，无法签署");
        }
        String channel = body.get("channel");
        if (channel == null || channel.isBlank()) channel = "web";
        String ip = getClientIp(request);
        try {
            legalDocService.accept(LegalDocService.SUBJECT_USER, Long.parseLong(userId),
                    docType, doc.getVersion(), channel, ip);
        } catch (NumberFormatException e) {
            return Result.fail(400, "用户标识异常");
        }
        return Result.success(null, "已记录签署（版本 " + doc.getVersion() + "）");
    }

    /** 取客户端真实 IP（兼容反向代理 X-Forwarded-For / X-Real-IP） */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isBlank() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip == null ? "" : ip;
    }
}
