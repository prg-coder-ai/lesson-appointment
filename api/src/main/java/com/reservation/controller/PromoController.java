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
import com.reservation.utils.ClientIpResolver;
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
 *   <li>租户管理员：{@code /achievement/tenant}（本租户加入漏斗）</li>
 *   <li>平台管理员：{@code /achievement/overview}、{@code /achievement/platform}</li>
 * </ul>
 *
 * <h3>两种推广码（2026-10-13 双码）</h3>
 * <ul>
 *   <li><b>平台推广码</b>（pathType=1）：任何人用这个码自助开新租户。</li>
 *   <li><b>租户推广码</b>（pathType=2）：新用户加入推广者所属租户（待审批）。
 *       目标租户由服务端从令牌派生，不接受客户端传值。</li>
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
     * body: { "pathType": 1 } 或 { "pathType": 2 }
     *
     * <p><b>targetTenantId 一律由服务端从令牌派生，不接受客户端传值</b>：
     * 租户码只能指向推广者自己的租户。曾经接受客户端传值 → 可给任意租户生成码、
     * 把别人的拉新业绩记在自己头上（2026-10-13 端到端测试抓出，P0）。
     * 平台管理员（tenantId=0）不属于任何租户，只能生成平台推广码。
     */
    @PostMapping("/referral/code")
    public Result<PromoReferral> generateCode(@RequestBody(required = false) PromoCodeDTO body,
                                              @RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Integer pathType = body == null || body.getPathType() == null
                ? PromoService.PATH_TENANT : body.getPathType();
        Long targetTenantId = null;
        if (pathType != null && pathType == PromoService.PATH_USER) {
            if (tenantId == null || tenantId <= 0) {
                throw new com.reservation.exception.BusinessException("平台管理员不属于任何租户，只能生成平台推广码");
            }
            targetTenantId = tenantId;
        }
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
            // 路径2：带上目标租户名与编码，前端可渲染"加入 XX 机构"、小程序可自动微信注册
            com.reservation.entity.Tenant target = tenantService.getById(ref.getTargetTenantId());
            data.put("targetOrgName", target == null ? null : target.getOrgName());
            data.put("targetTenantCode", target == null ? null : target.getTenantCode());
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
        String wxUnionid = null;
        if (dto.getWxCode() != null && !dto.getWxCode().isBlank()) {
            WeChatSession session = weChatService.code2Session(dto.getWxCode());
            if (session == null || session.getOpenid() == null) {
                // 微信授权失败不阻塞主流程：降级为纯密码注册（用户已填了账号密码）
                wxOpenid = null;
            } else {
                wxOpenid = session.getOpenid();
                wxUnionid = session.getUnionid();   // P1：跨端统一身份一并落库
            }
        }
        Map<String, Object> data = promoService.registerTenant(
                dto.getReferralCode(), dto.getOrgName(), dto.getIndustryId(),
                dto.getAccount(), dto.getPassword(), dto.getName(), dto.getPhone(),
                dto.getSource(), wxOpenid, wxUnionid, clientIp(request), dto.getChannel());
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

    /** 我的推广业绩（含默认推广码、转化率、我的租户与剩余名额）。 */
    @GetMapping("/achievement")
    public Result<Map<String, Object>> achievement(@RequestHeader("Authorization") String token) {
        String userId = permissionCheck.getUserIdFromToken(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(promoService.myAchievement(userId, tenantId), "查询成功");
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
     * 租户推广统计（租户管理员）：本租户「租户码」的加入漏斗 + 推广人明细。
     *
     * <p>租户从令牌派生，只能看自己租户；平台管理员（tenantId=0）没有归属租户，
     * 走 {@link #platformAchievement}。方法体再兜一次底（路径层已是 TENANT_ADMIN_ONLY）。
     */
    @GetMapping("/achievement/tenant")
    public Result<Map<String, Object>> tenantAchievement(@RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        if (tenantId == null || tenantId <= 0) {
            throw new com.reservation.exception.BusinessException("平台管理员不属于任何租户，请使用平台推广统计");
        }
        return Result.success(promoService.tenantStats(tenantId), "查询成功");
    }

    /** 平台推广统计（platform_admin）：全平台合计 + 推广者排行 + 最近转化。 */
    @GetMapping("/achievement/platform")
    public Result<Map<String, Object>> platformAchievement(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(promoService.platformStats(), "查询成功");
    }

    /**
     * 取客户端 IP（限频计数用）。
     *
     * <p><b>2026-10-22 P0 修正</b>：原实现取 {@code X-Forwarded-For} 的**首段**。
     * XFF 由"客户端 → 各级代理"依次追加，首段正是客户端自己写的那一段，因此
     * {@code curl -H "X-Forwarded-For: 1.2.3.4"} 每请求换一个假头就能让 IP 闸完全失效。
     * 现统一委托 {@link ClientIpResolver}：直连不信 XFF；来自可信代理时**从右往左**
     * 取第一个非可信地址（最右侧才是代理亲手写入的那一跳）。
     */
    private String clientIp(HttpServletRequest request) {
        return ClientIpResolver.resolve(request);
    }
}
