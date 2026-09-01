package com.reservation.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.reservation.common.Result;
import com.reservation.entity.Industry;
import com.reservation.mapper.IndustryMapper;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 行业管理控制器（平台管理端）
 * 接口前缀: /industry/*
 * 权限: 仅平台管理员可操作（挂在「系统设置 - 行业管理」菜单下）
 */
@RestController
@RequestMapping("/industry")
public class IndustryController {

    @Autowired
    private IndustryMapper industryMapper;
    @Autowired
    private PermissionCheck permissionCheck;

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
     * 删除行业
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable Long id,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = industryMapper.deleteById(id);
        return rows > 0 ? Result.success(true, "删除成功")
                        : Result.fail(404, "记录不存在");
    }
}
