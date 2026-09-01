package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.SystemConfig;
import com.reservation.service.SysConfigService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 系统配置控制器（系统配置菜单）
 * 接口前缀: /sys/config/*
 * 权限: 仅平台管理员可修改；只读查询对管理员开放
 */
@RestController
@RequestMapping("/sys/config")
public class SysConfigController {

    @Autowired
    private SysConfigService sysConfigService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 全部配置项
     */
    @GetMapping("/list")
    public Result<List<SystemConfig>> listAll(@RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(sysConfigService.listAll(), "查询成功");
    }

    /**
     * 按分组查询（monitor / tenant / general）
     */
    @GetMapping("/group/{group}")
    public Result<List<SystemConfig>> listByGroup(@PathVariable String group,
                                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        return Result.success(sysConfigService.listByGroup(group), "查询成功");
    }

    /**
     * 查询单个配置
     */
    @GetMapping("/{key}")
    public Result<SystemConfig> getByKey(@PathVariable String key,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkAdmin(token);
        SystemConfig cfg = sysConfigService.getByKey(key);
        if (cfg == null) {
            return Result.fail(404, "配置项不存在");
        }
        return Result.success(cfg, "查询成功");
    }

    /**
     * 修改配置值
     */
    @PostMapping("/update")
    public Result<Boolean> update(@RequestBody Map<String, String> body,
                                  @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        String key = body.get("configKey");
        String value = body.get("configValue");
        if (key == null || key.isBlank()) {
            return Result.fail(400, "配置键不能为空");
        }
        int rows = sysConfigService.updateByKey(key, value);
        return rows > 0 ? Result.success(true, "配置已更新") : Result.fail(400, "配置更新失败");
    }

    /**
     * 恢复默认值
     */
    @PostMapping("/{key}/reset")
    public Result<Boolean> reset(@PathVariable String key,
                                 @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        int rows = sysConfigService.resetToDefault(key);
        return rows > 0 ? Result.success(true, "已恢复默认值") : Result.fail(400, "恢复失败");
    }
}
