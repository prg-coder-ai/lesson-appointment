package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.common.RoleConst;
import com.reservation.entity.Tenant;
import com.reservation.entity.Term;
import com.reservation.mapper.TermMapper;
import com.reservation.service.TenantService;
import com.reservation.service.TermService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 行业专业词汇控制器（/term/*）
 * 三级作用域：平台词(0,0) / 行业词(行业id,0) / 租户词(租户id,行业id)
 * 权限：
 *   - /term/map            任意登录角色（前端渲染词表用）
 *   - 平台词/行业词管理     仅平台管理员（platform_admin）
 *   - 租户词管理            租户管理员（admin）仅能操作自己的租户，后端强制锁定 tenant_id
 */
@RestController
@RequestMapping("/term")
public class TermController {

    @Autowired
    private TermMapper termMapper;
    @Autowired
    private TermService termService;
    @Autowired
    private TenantService tenantService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 当前租户合并词表（key -&gt; term_name）
     * 合并规则：平台词 → 行业词 → 租户词，逐级覆盖
     * 多语言：lang 参数指定语言（ISO 639-1，缺省 zh）；
     *         指定语言缺失时回退 zh，再缺失取该 key 任意语言
     */
    @GetMapping("/map")
    public Result<Map<String, String>> map(@RequestParam(required = false) String lang,
                                           @RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(termService.getTermMap(tenantId, lang), "查询成功");
    }

    /**
     * 平台/行业级词条列表（平台管理员）
     *
     * @param industryId 0=平台词；>0=该行业词
     */
    @GetMapping("/list")
    public Result<List<Term>> list(@RequestParam(required = false) Long industryId,
                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(termService.listByScope(industryId), "查询成功");
    }

    /**
     * 租户自定义词条列表（租户管理员，仅返回本租户词条）
     */
    @GetMapping("/tenant/list")
    public Result<List<Term>> tenantList(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        return Result.success(termService.listByTenant(tenantId), "查询成功");
    }

    /**
     * 新增词条
     * 平台管理员：industryId 决定作用域（0=平台词，>0=行业词），tenantId 强制 0
     * 租户管理员：tenantId 强制为本租户，industryId 取租户所属行业（无需传）
     */
    @PostMapping("/insert")
    public Result<Term> insert(@RequestBody Term term,
                               @RequestHeader("Authorization") String token) {
        if (term == null || term.getTermKey() == null || term.getTermKey().trim().isEmpty()) {
            return Result.fail(400, "词条编码不能为空");
        }
        if (term.getTermName() == null || term.getTermName().trim().isEmpty()) {
            return Result.fail(400, "显示词不能为空");
        }
        String termKey = term.getTermKey().trim();
        String termName = term.getTermName().trim();

        boolean isPlatform = permissionCheck.isPlatformAdmin(token);
        Long tenantId;
        Long industryId;
        if (isPlatform) {
            tenantId = 0L;
            industryId = (term.getIndustryId() == null || term.getIndustryId() < 0) ? 0L : term.getIndustryId();
        } else {
            permissionCheck.checkAdmin(token);
            tenantId = permissionCheck.getTenantIdFromToken(token);
            industryId = resolveTenantIndustry(tenantId);
        }
        if (termService.existsInScope(termKey, industryId, tenantId, term.getLanguage(), null)) {
            return Result.fail(400, "该作用域下同语言词条编码已存在");
        }
        Term t = new Term();
        t.setTermKey(termKey);
        t.setTermName(termName);
        t.setLanguage(term.getLanguage() == null || term.getLanguage().trim().isEmpty()
                ? "zh" : term.getLanguage().trim());
        t.setTermType(term.getTermType() == null || term.getTermType().trim().isEmpty()
                ? "label" : term.getTermType().trim());
        t.setIndustryId(industryId);
        t.setTenantId(tenantId);
        t.setSortOrder(term.getSortOrder() == null ? 0 : term.getSortOrder());
        t.setStatus(term.getStatus() == null ? 1 : term.getStatus());
        t.setRemark(term.getRemark());
        t.setCreateTime(LocalDateTime.now());
        t.setUpdateTime(LocalDateTime.now());
        termMapper.insert(t);
        return Result.success(t, "新增成功");
    }

    /**
     * 修改词条（编码/作用域不允许变更，仅改显示词/类型/排序/状态/备注）
     */
    @PostMapping("/update")
    public Result<Term> update(@RequestBody Term term,
                               @RequestHeader("Authorization") String token) {
        if (term == null || term.getId() == null) {
            return Result.fail(400, "词条ID不能为空");
        }
        Term exist = termMapper.selectById(term.getId());
        if (exist == null) {
            return Result.fail(404, "词条不存在");
        }
        // 越权防护：租户管理员只能改自己的词条
        if (!permissionCheck.isPlatformAdmin(token)) {
            permissionCheck.checkAdmin(token);
            Long tenantId = permissionCheck.getTenantIdFromToken(token);
            if (exist.getTenantId() == null || !exist.getTenantId().equals(tenantId)) {
                return Result.fail(403, "您只能修改本租户的词条");
            }
        }
        if (term.getTermName() != null) {
            if (term.getTermName().trim().isEmpty()) return Result.fail(400, "显示词不能为空");
            exist.setTermName(term.getTermName().trim());
        }
        if (term.getLanguage() != null && !term.getLanguage().trim().isEmpty()) {
            String newLang = term.getLanguage().trim().toLowerCase();
            // 语言变更需校验唯一性：同 key 同作用域同语言（排除自身）
            if (termService.existsInScope(exist.getTermKey(), exist.getIndustryId(), exist.getTenantId(), newLang, exist.getId())) {
                return Result.fail(400, "该作用域下同语言词条编码已存在");
            }
            exist.setLanguage(newLang);
        }
        if (term.getTermType() != null && !term.getTermType().trim().isEmpty()) {
            exist.setTermType(term.getTermType().trim());
        }
        if (term.getSortOrder() != null) exist.setSortOrder(term.getSortOrder());
        if (term.getStatus() != null) exist.setStatus(term.getStatus());
        if (term.getRemark() != null) exist.setRemark(term.getRemark());
        exist.setUpdateTime(LocalDateTime.now());
        termMapper.updateById(exist);
        return Result.success(termMapper.selectById(exist.getId()), "修改成功");
    }

    /**
     * 状态流转：status=1启用 0停用（停用=该级词条回退到下一级）
     */
    @PostMapping("/{id}/status")
    public Result<Boolean> changeStatus(@PathVariable Long id,
                                        @RequestParam Integer status,
                                        @RequestHeader("Authorization") String token) {
        Term exist = termMapper.selectById(id);
        if (exist == null) return Result.fail(404, "词条不存在");
        // 租户管理员仅能操作自己的词条
        if (!permissionCheck.isPlatformAdmin(token)) {
            permissionCheck.checkAdmin(token);
            Long tenantId = permissionCheck.getTenantIdFromToken(token);
            if (exist.getTenantId() == null || !exist.getTenantId().equals(tenantId)) {
                return Result.fail(403, "您只能操作本租户的词条");
            }
        }
        Term t = new Term();
        t.setId(id);
        t.setStatus(status);
        t.setUpdateTime(LocalDateTime.now());
        int rows = termMapper.updateById(t);
        return rows > 0 ? Result.success(true, "状态已更新") : Result.fail(404, "记录不存在");
    }

    /**
     * 删除词条（物理删除 + 审计）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id,
                                  @RequestHeader("Authorization") String token) {
        Term exist = termMapper.selectById(id);
        if (exist == null) return Result.fail(404, "词条不存在");
        // 租户管理员仅能删除自己的词条
        if (!permissionCheck.isPlatformAdmin(token)) {
            permissionCheck.checkAdmin(token);
            Long tenantId = permissionCheck.getTenantIdFromToken(token);
            if (exist.getTenantId() == null || !exist.getTenantId().equals(tenantId)) {
                return Result.fail(403, "您只能删除本租户的词条");
            }
        }
        int rows = termMapper.deleteById(id);
        return rows > 0 ? Result.success(true, "删除成功") : Result.fail(404, "记录不存在");
    }

    /**
     * 行业词批量复制（fromIndustryId → toIndustryId，目标已有同 key 跳过）
     */
    @PostMapping("/copy")
    public Result<Map<String, Object>> copy(@RequestParam Long fromIndustryId,
                                            @RequestParam Long toIndustryId,
                                            @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        if (fromIndustryId == null || toIndustryId == null || fromIndustryId <= 0 || toIndustryId <= 0) {
            return Result.fail(400, "源/目标行业ID必须为正数");
        }
        if (fromIndustryId.equals(toIndustryId)) {
            return Result.fail(400, "源与目标行业不能相同");
        }
        Map<String, Object> stat = termService.copyIndustry(fromIndustryId, toIndustryId);
        return Result.success(stat, "复制完成：新增 " + stat.get("copied") + " 条，跳过 " + stat.get("skipped") + " 条");
    }

    /**
     * 取租户所属行业 id（租户词的作用域冗余字段），未指定则 0
     */
    private Long resolveTenantIndustry(Long tenantId) {
        if (tenantId == null || tenantId <= 0) return 0L;
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null && tenant.getIndustryId() != null && tenant.getIndustryId() > 0) {
            return tenant.getIndustryId();
        }
        return 0L;
    }
}
