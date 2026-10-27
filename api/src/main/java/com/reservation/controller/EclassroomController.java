package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.entity.EclassroomInstance;
import com.reservation.entity.TenantEclassroom;
import com.reservation.service.EclassroomService;
import com.reservation.utils.PermissionCheck;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * eclassroom 课堂管理控制器
 * 接口前缀: /api/v1/eclassroom
 * 权限说明：
 * - /config：各角色可查本租户课堂配置（前端据此显隐课堂 UI）
 * - /instances/**：平台管理员管理课堂服务实例（CRUD）
 * - /tenant/{tenantId}/**：平台管理员为租户绑定/禁用/解绑课堂实例
 */
@RestController
@RequestMapping("/api/v1/eclassroom")
public class EclassroomController {

    @Autowired
    private EclassroomService eclassroomService;
    @Autowired
    private PermissionCheck permissionCheck;

    /**
     * 当前租户的课堂配置（含是否启用、API 地址）
     * 各角色可调用：前端登录后据此显隐课堂相关 UI
     */
    @GetMapping("/config")
    public Result<Map<String, Object>> getConfig(@RequestHeader("Authorization") String token) {
        Long tenantId = permissionCheck.getTenantIdFromToken(token);
        Map<String, Object> config = eclassroomService.getTenantClassroomConfig(tenantId);
        if (config == null) {
            config = new HashMap<>();
            config.put("enabled", false);
            config.put("apiBaseUrl", null);
            config.put("wsBaseUrl", null);
            config.put("config", null);
        }
        return Result.success(config, "查询成功");
    }

    /**
     * 实例列表（平台管理员）
     */
    @GetMapping("/instances")
    public Result<List<EclassroomInstance>> listInstances(@RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        return Result.success(eclassroomService.listInstances(), "查询成功");
    }

    /**
     * 新建实例（平台管理员）
     */
    @PostMapping("/instances")
    public Result<EclassroomInstance> createInstance(@RequestBody EclassroomInstance instance,
                                                     @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        String operator = permissionCheck.getUserIdFromToken(token);
        if (instance.getCreatorAccount() == null) instance.setCreatorAccount(operator);
        EclassroomInstance created = eclassroomService.createInstance(instance);
        return Result.success(created, "实例创建成功");
    }

    /**
     * 修改实例（平台管理员）
     */
    @PutMapping("/instances/{id}")
    public Result<EclassroomInstance> updateInstance(@PathVariable Long id,
                                                     @RequestBody EclassroomInstance instance,
                                                     @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        instance.setId(id);
        eclassroomService.updateInstance(instance);
        return Result.success(eclassroomService.getInstanceById(id), "实例更新成功");
    }

    /**
     * 删除实例（软删，平台管理员）
     */
    @DeleteMapping("/instances/{id}")
    public Result<Boolean> deleteInstance(@PathVariable Long id,
                                          @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        eclassroomService.deleteInstance(id);
        return Result.success(true, "实例已删除");
    }

    /**
     * 查看租户课堂绑定（平台管理员）
     */
    @GetMapping("/tenant/{tenantId}")
    public Result<TenantEclassroom> getTenantBinding(@PathVariable Long tenantId,
                                                     @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        TenantEclassroom binding = eclassroomService.getTenantEclassroom(tenantId);
        return Result.success(binding, "查询成功");
    }

    /**
     * 为租户绑定实例（启用课堂，平台管理员）
     */
    @PutMapping("/tenant/{tenantId}/bind")
    public Result<Boolean> bindTenant(@PathVariable Long tenantId,
                                      @RequestParam Long instanceId,
                                      @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        String operator = permissionCheck.getUserIdFromToken(token);
        eclassroomService.bindTenantClassroom(tenantId, instanceId, operator);
        return Result.success(true, "课堂绑定成功");
    }

    /**
     * 禁用租户课堂（保留关联，设 enabled=0，平台管理员）
     */
    @PutMapping("/tenant/{tenantId}/disable")
    public Result<Boolean> disableTenant(@PathVariable Long tenantId,
                                         @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        String operator = permissionCheck.getUserIdFromToken(token);
        eclassroomService.disableTenantClassroom(tenantId, operator);
        return Result.success(true, "课堂已禁用");
    }

    /**
     * 解绑租户课堂（删除关联记录，平台管理员）
     */
    @PutMapping("/tenant/{tenantId}/unbind")
    public Result<Boolean> unbindTenant(@PathVariable Long tenantId,
                                        @RequestHeader("Authorization") String token) {
        permissionCheck.checkPlatformAdmin(token);
        String operator = permissionCheck.getUserIdFromToken(token);
        eclassroomService.unbindTenantClassroom(tenantId, operator);
        return Result.success(true, "课堂已解绑");
    }
}