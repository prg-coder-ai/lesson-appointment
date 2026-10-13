package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.Result;
import com.reservation.dto.PromoCodeDTO;
import com.reservation.dto.PromoRegisterTenantDTO;
import com.reservation.dto.PromoRegisterUserDTO;
import com.reservation.dto.WeChatSession;
import com.reservation.entity.PromoAchievement;
import com.reservation.entity.PromoConversion;
import com.reservation.entity.PromoReferral;
import com.reservation.service.PromoService;
import com.reservation.service.SysConfigService;
import com.reservation.service.TenantService;
import com.reservation.service.WeChatService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.HashMap;
import java.util.Map;

/**
 * 推广体系接口。
 *
 * <h3>端点与鉴权</h3>
 * <ul>
 *   <li>免登录（permitAll）：{@code /referral/validate}、{@code /register-tenant}、{@code /register-user}</li>
 *   <li>需登录（ALL_ROLES）：{@code /referral/code}、{@code /referral/my-codes}、{@code /achievement}、{@code /conversions}</li>
 *   <li>平台管理员：{@code /achievement/overview}</li>
 * </ul>
 *
 * <h3>两条路径</h3>
 * <ul>
 *   <li><b>路径1</b>：用推广码自助开租户，注册者成为首管理员（免费试用）。</li>
 *   <li><b>路径2</b>：用推广码加入指定租户（student/teacher，待审批）。
 *       后端校验请求的 {@code tenantCode} 与推广码绑定的目标租户一致，防篡改。</li>
 * </ul>
 *
 * <p>授权规则登记在 {@code AuthzRules}；permitAll 三处同步：
 * {@code SecurityConfig} 白名单 + {@code JwtAuthenticationFilter.WHITELIST_PATHS}
 * + {@code tools/check-authz-declarative.mjs} 的 PERMIT_ALL。
 */
@RestController
@RequestMapping("/api/v1/promo")
public class PromoController {

    @Autowired
    private PromoService promoService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private WeChatService weChatService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 生成/获取我的推广码（幂等）。
     * body: { "pathType": 1 } 或 { "pathType": 2, "targetTenantId": 3 }
     */
    @PostMapping("/referral/code")
    public Result<PromoReferral> generateCode(@RequestBody(required = false) PromoCodeDTO body,
                                              @RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Integer pathType = body == null || body.getPathType() == null ? 1 : body.getPathType();
        Long targetTenantId = body == null ? null : body.getTargetTenantId();
        PromoReferral code = promoService.getOrCreateCode(userId, tenantId, pathType, targetTenantId);
        return Result.success(code, "获取成功");
    }

    /** 我的全部推广码。 */
    @GetMapping("/referral/my-codes")
    public Result<java.util.List<PromoReferral>> myCodes(@RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        return Result.success(promoService.myCodes(userId), "查询成功");
    }

    /**
     * 校验推广码（免登录，login.html 首访调用）。
     *
     * <p>{@code touch=1} 时点击计数 +1 —— 前端按 {@code ref} 去重（storage 标记），
     * 只在上次访问间隔后的首次调用带该参数，故后端不需要额外防抖。
     */
    @GetMapping("/referral/validate")
    public Result<Map<String, Object>> validateCode(@RequestParam("code") String code,
                                                    @RequestParam(required = false) String touch,
                                                    HttpServletRequest request) {
        PromoReferral ref = promoService.validateActiveCode(code);
        Map<String, Object> data = new HashMap<>();
        if (ref == null) {
            data.put("valid", false);
            return Result.success(data, "推广码无效或已停用");
        }
        if ("1".equals(touch)) {
            promoService.countClick(code);
        }
        data.put("valid", true);
        data.put("pathType", ref.getPathType());
        data.put("targetTenantId", ref.getTargetTenantId());
        data.put("trialDays", sysConfigService.getInt("promotion.trial.days", 14));
        if (ref.getTargetTenantId() != null) {
            // 路径2：带上目标租户名，前端可渲染"加入 XX 机构"
            com.reservation.entity.Tenant target = tenantService.getById(ref.getTargetTenantId());
            data.put("targetOrgName", target == null ? null : target.getOrgName());
        }
        return Result.success(data, "推广码有效");
    }

    /**
     * 路径1：自助建租户 + 首管理员（免登录）。
     *
     * <p>整个写入在一个事务里（租户 + 试用套餐 + 首管理员 + 归因），
     * 任一步失败整体回滚，不会留下"租户建了、管理员没建上"的孤儿租户。
     */
    @PostMapping("/register-tenant")
    public Result<Map<String, Object>> registerTenant(
            @Valid @RequestBody PromoRegisterTenantDTO dto, HttpServletRequest request) {
        String wxOpenid = null;
        if (dto.getWxCode() != null && !dto.getWxCode().isBlank()) {
            WeChatSession session = weChatService.code2Session(dto.getWxCode());
            if (session == null || session.getOpenid() == null) {
                // 微信授权失败不阻塞主流程：降级为纯密码注册（用户已填了账号密码）
                wxOpenid = null;
            } else {
                wxOpenid = session.getOpenid();
            }
        }
        Map<String, Object> data = promoService.registerTenant(
                dto.getReferralCode(), dto.getOrgName(), dto.getIndustryId(),
                dto.getAccount(), dto.getPassword(), dto.getName(), dto.getPhone(),
                dto.getSource(), wxOpenid, clientIp(request));
        return Result.success(data, "注册成功，已进入免费体验");
    }

    /**
     * 路径2：指定租户注册用户（免登录）。student/teacher，pending 待审批。
     */
    @PostMapping("/register-user")
    public Result<Map<String, Object>> registerUser(
            @Valid @RequestBody PromoRegisterUserDTO dto, HttpServletRequest request) {
        Map<String, Object> data = promoService.registerUser(
                dto.getReferralCode(), dto.getTenantCode(), dto.getAccount(),
                dto.getPassword(), dto.getName(), dto.getPhone(), dto.getRole(),
                dto.getSource(), clientIp(request));
        return Result.success(data, "注册成功，等待审批");
    }

    /** 我的推广业绩（含默认推广码、转化率）。 */
    @GetMapping("/achievement")
    public Result<Map<String, Object>> achievement(@RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        return Result.success(promoService.myAchievement(userId), "查询成功");
    }

    /** 我的转化明细（分页）。 */
    @GetMapping("/conversions")
    public Result<PageResult<PromoConversion>> conversions(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        return Result.success(promoService.myConversions(userId, pageNum, pageSize), "查询成功");
    }

    /** 全部推广者排行（platform_admin）。 */
    @GetMapping("/achievement/overview")
    public Result<PageResult<PromoAchievement>> overview(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(promoService.overview(pageNum, pageSize), "查询成功");
    }

    /**
     * 取客户端 IP（限频计数用）。
     *
     * <p>先看 {@code X-Forwarded-For} 再看 {@code X-Real-IP}，最后回落 remoteAddr ——
     * 反向代理（nginx/8080 dev proxy）下 remoteAddr 全是代理地址，不取头部会限空。
     */
    private String clientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
