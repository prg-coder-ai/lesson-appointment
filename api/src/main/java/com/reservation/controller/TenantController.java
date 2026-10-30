package com.reservation.controller;

import com.reservation.common.PageResult;
import com.reservation.common.RoleConst;
import com.reservation.common.Result;
import com.reservation.entity.Industry;
import com.reservation.entity.Tenant;
import com.reservation.entity.User;
import com.reservation.mapper.IndustryMapper;
import com.reservation.query.TenantQueryPage;
import com.reservation.service.PromoService;
import com.reservation.service.TenantQuotaService;
import com.reservation.service.TenantService;
import com.reservation.service.UserService;
import com.reservation.utils.PermissionCheck;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 租户管理控制器（平台管理）
 * 接口前缀: /tenant/*
 * 权限说明：
 * - platform_admin：管理全部租户（增删改、状态流转、续期、套餐变更、软删除/恢复）
 * - 租户管理员及普通用户：仅可只读查看自己所属租户的信息
 */
@RestController
@RequestMapping("/api/v1/tenant")
public class TenantController {

    private static final Logger log = LoggerFactory.getLogger(TenantController.class);

    @Autowired
    private TenantService tenantService;
    @Autowired
    private TenantQuotaService tenantQuotaService;
    @Autowired
    private PermissionCheck permissionCheck;
    @Autowired
    private IndustryMapper industryMapper;
    @Autowired
    private PromoService promoService;
    @Autowired
    private UserService userService;

    /**
     * 分页查询租户列表
     * 平台管理员：全部；其他角色：强制只看自己所属租户
     */
    @PostMapping("/page")
    public Result<PageResult<Tenant>> getTenantByPage(@RequestBody TenantQueryPage query,
                                                      @RequestHeader("Authorization") String token) {
        if (!permissionCheck.isPlatformAdmin(token)) {
            Long tenantId = permissionCheck.getTenantIdFromToken(token);
            query.setDeleted(0);
            query.setStatus(null);
            query.setKeyword(null);
            query.setExpireStart(null);
            query.setExpireEnd(null);
            query.setTenantIdFilter(tenantId);
        }
        return Result.success(tenantService.getTenantListByPage(query), "查询成功");
    }

    /**
     * 查询租户详情
     */
    @GetMapping("/{id}")
    public Result<Tenant> getTenant(@PathVariable Long id,
                                    @RequestHeader("Authorization") String token) {
        permissionCheck.checkTenantRead(token, id);
        Tenant tenant = tenantService.getById(id);
        if (tenant == null) {
            return Result.fail(404, "租户不存在");
        }
        return Result.success(tenant, "查询成功");
    }

    /**
     * 查询当前登录者所属租户（只读，各角色可用）
     */
    @GetMapping("/current")
    public Result<Tenant> getCurrentTenant(@RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            return Result.fail(404, "未查询到所属租户信息");
        }
        return Result.success(tenant, "查询成功");
    }

    /**
     * 查询租户所属行业编码（前端据此调用 switchIndustry() 切换行业词表）
     * GET /tenant/industry?tenantCode=TENANT_A
     *
     * 返回：{ tenantCode, tenantId, industryId, industryCode, industryName }
     * industryCode 取自 sys_industry.code（如 education / legal / counseling），需与前端 TERM_DICT 的 key 对齐。
     *
     * 权限：
     * - platform_admin：可按 code 查任意租户（平台租户 code=platform 无 sys_tenant 记录，返回 null）
     * - 其余角色：强制用 token 所属租户，忽略传入的 tenantCode，防止借本接口探测其他租户的行业
     */
    @GetMapping("/industry")
    public Result<Map<String, Object>> getIndustry(@RequestParam(required = false) String tenantCode,
                                                   @RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Tenant tenant;
        if (permissionCheck.isPlatformAdmin(token)) {
            tenant = (tenantCode == null || tenantCode.trim().isEmpty())
                    ? null : tenantService.getByCode(tenantCode.trim());
        } else {
            tenant = tenantService.getById(tenantId);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("tenantCode", tenant != null ? tenant.getTenantCode() : tenantCode);
        data.put("tenantId", tenant != null ? tenant.getId() : tenantId);
        if (tenant == null) {
            data.put("industryId", null);
            data.put("industryCode", null);
            data.put("industryName", null);
            return Result.success(data, "查询成功");
        }

        Long industryId = tenant.getIndustryId();
        data.put("industryId", industryId);
        String code = null;
        String name = null;
        if (industryId != null && industryId > 0) {
            Industry ind = industryMapper.selectById(industryId);
            if (ind != null) {
                code = ind.getCode();
                name = ind.getName();
            }
        }
        data.put("industryCode", code);
        data.put("industryName", name);
        return Result.success(data, "查询成功");
    }

    /**
     * 公开接口：按租户编码查询机构名称（用于登录页/品牌化标题，无需登录）
     * GET /tenant/name?tenantCode=TENANT_A
     *
     * 返回：{ tenantCode, orgName }
     * - 平台租户 code=platform 无 sys_tenant 记录 → orgName 为 null
     * - 编码不存在 → orgName 为 null
     * 该接口匿名可访问（已在 SecurityConfig / JwtAuthenticationFilter 白名单放开），
     * 仅泄露机构名称，无敏感数据。
     */
    @GetMapping("/name")
    public Result<Map<String, Object>> getTenantName(@RequestParam(required = false) String tenantCode) {
        Map<String, Object> data = new HashMap<>();
        if (tenantCode == null || tenantCode.trim().isEmpty()) {
            data.put("tenantCode", null);
            data.put("orgName", null);
            return Result.success(data, "查询成功");
        }
        Tenant tenant = tenantService.getByCode(tenantCode.trim());
        data.put("tenantCode", tenantCode.trim());
        // sys_tenant 在 MyBatisPlusConfig 租户隔离忽略表中，getByCode 不受租户行级隔离影响
        data.put("orgName", tenant != null ? tenant.getOrgName() : null);
        return Result.success(data, "查询成功");
    }

    /**
     * 全部租户列表（平台管理员）
     */
    @GetMapping("/list")
    public Result<List<Tenant>> listAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(tenantService.listAll(), "查询成功");
    }

    /**
     * 新增租户
     */
    @PostMapping("/insert")
    public Result<Map<String, Long>> insertTenant(@RequestBody Tenant tenant,
                                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantService.insertTenant(tenant);
        return Result.success(Map.of("tenantId", id), "租户创建成功");
    }

    /**
     * 修改租户信息
     */
    @PostMapping("/update")
    public Result<Tenant> updateTenant(@RequestBody Tenant tenant,
                                       @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Long id = tenantService.updateTenant(tenant);
        Tenant updated = tenantService.getById(id);
        return Result.success(updated, "租户修改成功");
    }

    /**
     * 删除租户（软删除，数据保留可恢复）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> deleteTenant(@PathVariable Long id,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.softDelete(id);
        return rows > 0 ? Result.success(true, "租户已删除（数据保留，可恢复）")
                        : Result.fail(404, "删除失败，记录不存在");
    }

    /**
     * 恢复已删除的租户
     */
    @PostMapping("/{id}/restore")
    public Result<Boolean> restoreTenant(@PathVariable Long id,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.restore(id);
        return rows > 0 ? Result.success(true, "租户已恢复")
                        : Result.fail(404, "恢复失败，记录不存在");
    }

    /**
     * 状态流转：status=1启用 2停用 3退租
     */
    @PostMapping("/{id}/status")
    public Result<Boolean> changeStatus(@PathVariable Long id,
                                        @RequestParam Integer status,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.changeStatus(id, status);
        return rows > 0 ? Result.success(true, "状态更新成功")
                        : Result.fail(404, "状态更新失败，记录不存在");
    }

    /**
     * 续期
     */
    @PostMapping("/{id}/renew")
    public Result<Boolean> renew(@PathVariable Long id,
                                 @RequestParam Integer months,
                                 @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = tenantService.renew(id, months);
        return rows > 0 ? Result.success(true, "续期成功")
                        : Result.fail(404, "续期失败，记录不存在");
    }

    /**
     * 变更套餐模板：套用模板限额并更新 sys_tenant.package_id
     * 降级时若已用量超出新模板限额将被拒绝
     */
    @PostMapping("/{id}/package")
    public Result<Boolean> changePackage(@PathVariable Long id,
                                         @RequestParam Long templateId,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        tenantQuotaService.switchTemplate(id, templateId);
        // 推广漏斗最后一环：缴费成功 → 该租户的转化记录置 paid、推广者业绩 +1、
        // 租户试用标记转 converted。非推广来的租户（referred_by 为空）内部直接返回。
        // 记账失败不回滚套餐变更（try 住）—— 配套餐是平台操作的主流程。
        try {
            promoService.onPaid(id);
        } catch (Exception e) {
            log.warn("推广缴费记账失败（不影响套餐变更）, tenantId={}, err={}", id, e.getMessage());
        }
        return Result.success(true, "套餐变更成功");
    }

    /**
     * 用账号反查关联的租户编码（方案文档 7.3：用户忘记 tenantCode /
     * 推广链接 tenantCode 与账号所属租户一致性校验 / 登录时账号+租户编码双重校验）。
     *
     * <p><b>语义是「账号所属租户」</b>（{@code user.tenant_id → sys_tenant}），
     * 不是「账号创建的租户」—— 推广者本人通常并不是他所建租户的归属人，
     * 查创建者会答非所问（曾按创建者实现，T11 三项全红后纠正）。
     *
     * <p><b>鉴权（决策：本人或管理员）</b>：路径层放行全部已登录角色，
     * 方法体按 token 裁定，边界收敛为 {@code self || platform_admin}
     * （与消息中心 {@code assertUserScope} 同模式）：
     * 租户管理员代查他人 → 403，避免跨租户探测 orgName。
     *
     * <p>本人查询优先走令牌 userId（同账号可跨租户重名，令牌解析无歧义）；
     * 平台管理员代查走全局账号查询（{@code listByAccountIgnoreTenant}，仅平台管理员可达）。
     * 平台管理员自身（tenant_id=0）没有 sys_tenant 行 → found=false，语义正确。
     */
    @GetMapping("/code-by-account")
    public Result<Map<String, Object>> codeByAccount(@RequestParam("account") String account,
                                                     @RequestHeader("Authorization") String token) {
        if (account == null || account.trim().isEmpty()) {
            return Result.fail(400, "账号不能为空");
        }
        String userId = permissionCheck.getUserIdFromToken(token);
        String role = permissionCheck.getRoleFromToken(token);
        String acc = account.trim();
        User self = userService.selectById(userId);
        boolean isSelf = self != null && acc.equals(self.getAccount());
        if (!isSelf && !RoleConst.PLATFORM_ADMIN.equals(role)) {
            return Result.fail(403, "无权查询该账号所属租户");
        }
        User target = isSelf ? self : userService.getFirstUserByAccountIgnoreTenant(acc);
        // sys_tenant 在租户插件的 IGNORE_TABLES 内，此处不拼租户条件；
        // target.tenant_id=0（平台账号）或账号不存在时 tenant 为 null → found=false
        Tenant tenant = (target == null || target.getTenantId() == null)
                ? null : tenantService.getById(target.getTenantId());
        Map<String, Object> data = new HashMap<>();
        data.put("found", tenant != null);
        data.put("tenantCode", tenant == null ? null : tenant.getTenantCode());
        data.put("orgName", tenant == null ? null : tenant.getOrgName());
        data.put("trialStatus", tenant == null ? null : tenant.getTrialStatus());
        return Result.success(data, tenant == null ? "未找到关联租户" : "查询成功");
    }

    /**
     * 校验租户编码是否有效（免登录）：login.html 路径2 表单渲染前调用。
     * 只回有效性与机构名，不暴露租户 id / 套餐等内部信息。
     */
    @GetMapping("/validate-code")
    public Result<Map<String, Object>> validateCode(@RequestParam("code") String code) {
        Map<String, Object> data = new HashMap<>();
        Tenant tenant = (code == null || code.trim().isEmpty()) ? null : tenantService.getByCode(code.trim());
        boolean valid = tenant != null
                && (tenant.getDeleted() == null || tenant.getDeleted() == 0)
                && Integer.valueOf(1).equals(tenant.getStatus());
        data.put("valid", valid);
        data.put("orgName", valid ? tenant.getOrgName() : null);
        return Result.success(data, valid ? "租户编码有效" : "租户编码无效或已停用");
    }
}
