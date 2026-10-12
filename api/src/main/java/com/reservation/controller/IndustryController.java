package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.CascadeRules;
import com.reservation.common.Result;
import com.reservation.entity.Industry;
import com.reservation.entity.Tenant;
import com.reservation.mapper.IndustryMapper;
import com.reservation.mapper.TenantMapper;
import com.reservation.service.ReferentialCascadeService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 行业管理控制器（平台管理端）
 * 接口前缀: /industry/*
 * 权限: 仅平台管理员可操作（挂在「系统设置 - 行业管理」菜单下）
 */
@RestController
@RequestMapping("/api/v1/industry")
public class IndustryController {

    @Autowired
    private IndustryMapper industryMapper;
    @Autowired
    private PermissionCheck permissionCheck;
    @Autowired
    private ReferentialCascadeService cascadeService;
    @Autowired
    private TenantMapper tenantMapper;

    /**
     * 行业列表（按 id 升序）
     */
    @GetMapping("/list")
    public Result<List<Industry>> list(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        QueryWrapper<Industry> qw = new QueryWrapper<>();
        qw.orderByAsc("id");
        return Result.success(industryMapper.selectList(qw), "查询成功");
    }

    /**
     * 新增行业
     */
    @PostMapping("/insert")
    public Result<Industry> insert(@RequestBody Industry ind,
                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        if (ind == null || ind.getName() == null || ind.getName().trim().isEmpty()) {
            return Result.fail(400, "行业名称不能为空");
        }
        if (ind.getCode() == null || ind.getCode().trim().isEmpty()) {
            return Result.fail(400, "行业编码不能为空");
        }
        String code = ind.getCode().trim();
        QueryWrapper<Industry> qw = new QueryWrapper<>();
        qw.eq("code", code);
        if (industryMapper.selectCount(qw) > 0) {
            return Result.fail(400, "行业编码已存在");
        }
        ind.setCode(code);
        ind.setName(ind.getName().trim());
        ind.setStatus(ind.getStatus() == null ? 1 : ind.getStatus());
        ind.setCreateTime(LocalDateTime.now());
        ind.setUpdateTime(LocalDateTime.now());
        industryMapper.insert(ind);
        return Result.success(ind, "新增成功");
    }

    /**
     * 修改行业
     */
    @PostMapping("/update")
    public Result<Industry> update(@RequestBody Industry ind,
                                   @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        if (ind == null || ind.getId() == null) {
            return Result.fail(400, "行业ID不能为空");
        }
        if (ind.getName() != null) ind.setName(ind.getName().trim());
        if (ind.getCode() != null) {
            String code = ind.getCode().trim();
            ind.setCode(code);
            QueryWrapper<Industry> qw = new QueryWrapper<>();
            qw.eq("code", code).ne("id", ind.getId());
            if (industryMapper.selectCount(qw) > 0) {
                return Result.fail(400, "行业编码已存在");
            }
        }
        ind.setUpdateTime(LocalDateTime.now());
        industryMapper.updateById(ind);
        return Result.success(industryMapper.selectById(ind.getId()), "修改成功");
    }

    /**
     * 状态流转：status=1启用 0停用
     */
    @PostMapping("/{id}/status")
    public Result<Boolean> changeStatus(@PathVariable Long id,
                                         @RequestParam Integer status,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        Industry ind = new Industry();
        ind.setId(id);
        ind.setStatus(status);
        ind.setUpdateTime(LocalDateTime.now());
        int rows = industryMapper.updateById(ind);
        return rows > 0 ? Result.success(true, "状态已更新")
                        : Result.fail(404, "记录不存在");
    }

    /**
     * 删除行业。
     *
     * <p><b>删前先停用其词条</b>：sys_term.industry_id 引用本表 id（实测 industry_id 取值
     * 0/4/5/6/7，对应本表行），且<b>没有外键约束</b>——直接删行业会留下一批
     * 指向不存在行业的词条，而这些词条正是三级词表里"行业词"那一层的全部内容。
     *
     * <p>处置用<b>停用（status=0）而不是物理删除</b>：词条是展示文案，
     * 误删一个行业不该连带抹掉它的全部术语；停用后词条不再参与词表合并，
     * 但历史数据与误操作都可回退。
     */
    @DeleteMapping("/{id}")
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public Result<Boolean> delete(@PathVariable Long id,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        // 删前先校验占用：sys_tenant.industry_id 无外键，若有租户仍属该行业，
        // 删掉就会让这些租户指向不存在的行业。规则表把这一层登记为 KEEP
        // （刻意不级联清空——那会静默改掉租户的业务归属），代价是必须在这里拦住。
        Long tenantsUsing = tenantMapper.selectCount(
                new QueryWrapper<Tenant>().eq("industry_id", id));
        if (tenantsUsing != null && tenantsUsing > 0) {
            return Result.fail(409, "仍有 " + tenantsUsing + " 个租户属于该行业，请先迁移这些租户再删除");
        }
        // 先停用该行业的全部词条，再删行业行（词表无外键，删父留子就会产生孤儿词条）
        int disabledRows = cascadeService.run(CascadeRules.SCENARIO_INDUSTRY_DELETE, String.valueOf(id))
                .getAffected().values().stream().mapToInt(Integer::intValue).sum();
        int rows = industryMapper.deleteById(id);
        return rows > 0 ? Result.success(true, "删除成功（已停用 " + disabledRows + " 条行业词条）")
                        : Result.fail(404, "记录不存在");
    }
}
