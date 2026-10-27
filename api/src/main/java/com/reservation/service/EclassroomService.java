package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.EclassroomInstance;
import com.reservation.entity.TenantEclassroom;
import com.reservation.mapper.EclassroomInstanceMapper;
import com.reservation.mapper.TenantEclassroomMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * eclassroom 课堂服务管理
 * 1. 实例注册管理（CRUD）
 * 2. 租户课堂开关（绑定/解绑/禁用/切换实例）
 * 3. 查询租户课堂配置（含服务地址，用于登录响应和服务间通信）
 */
@Service
public class EclassroomService {

    private static final Logger log = LoggerFactory.getLogger(EclassroomService.class);

    @Autowired
    private EclassroomInstanceMapper instanceMapper;
    @Autowired
    private TenantEclassroomMapper tenantEclassroomMapper;

    // ==================== 租户课堂配置查询 ====================

    /**
     * 判断租户是否启用了课堂（无记录 = 未启用）
     */
    public boolean hasClassroom(Long tenantId) {
        if (tenantId == null || tenantId == 0L) return false;
        TenantEclassroom te = getTenantEclassroom(tenantId);
        return te != null && te.getEnabled() == 1;
    }

    /**
     * 获取租户的课堂配置（含实例地址/端口），返回 null 表示未启用
     */
    public Map<String, Object> getTenantClassroomConfig(Long tenantId) {
        if (tenantId == null || tenantId == 0L) return buildFullConfig();

        TenantEclassroom te = getTenantEclassroom(tenantId);
        if (te == null || te.getEnabled() != 1) return null;

        EclassroomInstance instance = instanceMapper.selectById(te.getInstanceId());
        if (instance == null || instance.getStatus() != 1 || instance.getDeleted() == 1) {
            return null;
        }

        Map<String, Object> config = new HashMap<>();
        config.put("enabled", true);
        config.put("apiBaseUrl", buildApiUrl(instance));
        config.put("wsBaseUrl", buildWsUrl(instance));
        config.put("config", te.getConfig());
        return config;
    }

    /**
     * 获取租户的课堂 API 完整地址，返回 null 表示未启用
     */
    public String getTenantClassroomApiBaseUrl(Long tenantId) {
        if (tenantId == null || tenantId == 0L) return null;
        TenantEclassroom te = getTenantEclassroom(tenantId);
        if (te == null || te.getEnabled() != 1) return null;
        EclassroomInstance instance = instanceMapper.selectById(te.getInstanceId());
        if (instance == null || instance.getStatus() != 1 || instance.getDeleted() == 1) return null;
        return buildApiUrl(instance);
    }

    // ==================== 租户课堂绑定管理 ====================

    /**
     * 为租户绑定实例（启用课堂）。如已有绑定则更新实例。
     */
    public void bindTenantClassroom(Long tenantId, Long instanceId, String operator) {
        EclassroomInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null || instance.getDeleted() == 1) {
            throw new IllegalArgumentException("课堂实例不存在或已删除");
        }
        TenantEclassroom existing = getTenantEclassroom(tenantId);
        if (existing == null) {
            TenantEclassroom te = new TenantEclassroom();
            te.setTenantId(tenantId);
            te.setInstanceId(instanceId);
            te.setEnabled(1);
            te.setCreatorAccount(operator);
            tenantEclassroomMapper.insert(te);
        } else {
            existing.setInstanceId(instanceId);
            existing.setEnabled(1);
            tenantEclassroomMapper.updateById(existing);
        }
        log.info("租户{}绑定课堂实例{}, operator={}", tenantId, instanceId, operator);
    }

    /**
     * 禁用租户课堂（保留关联，设 enabled=0）
     */
    public void disableTenantClassroom(Long tenantId, String operator) {
        TenantEclassroom te = getTenantEclassroom(tenantId);
        if (te == null) {
            throw new IllegalArgumentException("租户未绑定课堂实例");
        }
        te.setEnabled(0);
        tenantEclassroomMapper.updateById(te);
        log.info("租户{}禁用课堂, operator={}", tenantId, operator);
    }

    /**
     * 解绑租户课堂（删除关联记录）
     */
    public void unbindTenantClassroom(Long tenantId, String operator) {
        LambdaQueryWrapper<TenantEclassroom> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantEclassroom::getTenantId, tenantId);
        tenantEclassroomMapper.delete(wrapper);
        log.info("租户{}解绑课堂, operator={}", tenantId, operator);
    }

    /**
     * 获取租户课堂绑定信息（平台管理员查看）
     */
    public TenantEclassroom getTenantEclassroom(Long tenantId) {
        LambdaQueryWrapper<TenantEclassroom> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantEclassroom::getTenantId, tenantId);
        return tenantEclassroomMapper.selectOne(wrapper);
    }

    // ==================== 实例管理 ====================

    public List<EclassroomInstance> listInstances() {
        LambdaQueryWrapper<EclassroomInstance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EclassroomInstance::getDeleted, 0)
               .orderByDesc(EclassroomInstance::getCreateTime);
        return instanceMapper.selectList(wrapper);
    }

    public EclassroomInstance getInstanceById(Long id) {
        return instanceMapper.selectById(id);
    }

    public EclassroomInstance createInstance(EclassroomInstance instance) {
        if (instance.getStatus() == null) instance.setStatus(1);
        if (instance.getDeleted() == null) instance.setDeleted(0);
        if (instance.getApiPort() == null) instance.setApiPort(8092);
        if (instance.getApiBasePath() == null) instance.setApiBasePath("/api/v1/classroom");
        if (instance.getWsBasePath() == null) instance.setWsBasePath("/ws");
        instanceMapper.insert(instance);
        log.info("创建课堂实例: code={}, name={}", instance.getInstanceCode(), instance.getInstanceName());
        return instance;
    }

    public void updateInstance(EclassroomInstance instance) {
        instanceMapper.updateById(instance);
        log.info("更新课堂实例: id={}", instance.getId());
    }

    public void deleteInstance(Long instanceId) {
        EclassroomInstance instance = instanceMapper.selectById(instanceId);
        if (instance == null) return;
        instance.setDeleted(1);
        instanceMapper.updateById(instance);
        log.info("删除课堂实例: id={}, code={}", instanceId, instance.getInstanceCode());
    }

    // ==================== 内部工具 ====================

    private String buildApiUrl(EclassroomInstance instance) {
        String host = instance.getApiHost();
        if (host == null) return null;
        Integer port = instance.getApiPort();
        String basePath = instance.getApiBasePath();
        if (basePath == null) basePath = "/api/v1/classroom";
        return buildUrl(host, port, basePath);
    }

    private String buildWsUrl(EclassroomInstance instance) {
        String host = instance.getWsHost() != null ? instance.getWsHost() : instance.getApiHost();
        if (host == null) return null;
        Integer port = instance.getWsPort() != null ? instance.getWsPort() : instance.getApiPort();
        String basePath = instance.getWsBasePath();
        if (basePath == null) basePath = "/ws";
        return "ws" + buildUrl(host, port, basePath).substring(4);
    }

    private String buildUrl(String host, Integer port, String basePath) {
        String scheme = "http";
        if (port != null && port == 443) scheme = "https";
        StringBuilder sb = new StringBuilder(scheme).append("://").append(host);
        if (port != null && port != 80 && port != 443) {
            sb.append(":").append(port);
        }
        sb.append(basePath);
        return sb.toString();
    }

    private Map<String, Object> buildFullConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("enabled", false);
        config.put("apiBaseUrl", null);
        config.put("wsBaseUrl", null);
        config.put("config", null);
        return config;
    }
}