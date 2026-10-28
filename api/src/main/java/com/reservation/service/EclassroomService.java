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
        if (instance.getApiBasePath() == null || instance.getApiBasePath().isBlank()) {
            instance.setApiBasePath(DEFAULT_API_BASE_PATH);
        }
        if (instance.getWsBasePath() == null) {
            instance.setWsBasePath(DEFAULT_WS_BASE_PATH);
        }
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

    /**
     * api_base_path 的语义是「classroom-service 的 API 根」，**必须含版本前缀**，
     * 但不含业务路径段。拼接方（ClassroomEventPushService / 前端 ClassroomAPI）
     * 一律以它为根再拼 /schedules/events、/classrooms/{sid}/enter 等。
     *
     * <p>历史坑：旧默认值写的是 {@code /api/v1/classroom}（多了单数 classroom 段），
     * 拼出了 {@code /api/v1/classroom/schedules/events} 这种服务端根本不存在的路径，
     * 推送 404 被 best-effort 吞掉、前端课堂页整页 404。改默认值时务必保持
     * {@code /api/v1}，不要为了「好看」再加业务段。
     */
    public static final String DEFAULT_API_BASE_PATH = "/api/v1";

    /**
     * ws_base_path 的语义是「classroom-service 的 WebSocket 根」，**不含 /ws/classrooms 业务段**。
     * 拼接方（前端 classroom-ws.js）会补 {@code /ws/classrooms/{sid}/{whiteboard|heartbeat|signal}}。
     *
     * <p>旧默认值 {@code /ws} 会让前端拼出 {@code /ws/ws/classrooms/...}，故统一置空：
     * 空串表示「就是 host:port 根」，{@link #buildWsUrl} 不再追加任何路径。
     */
    public static final String DEFAULT_WS_BASE_PATH = "";

    private String buildApiUrl(EclassroomInstance instance) {
        String host = instance.getApiHost();
        if (host == null) return null;
        Integer port = instance.getApiPort();
        String basePath = instance.getApiBasePath();
        if (basePath == null || basePath.isBlank()) basePath = DEFAULT_API_BASE_PATH;
        return buildUrl(host, port, normalizeApiBasePath(basePath, instance));
    }

    /**
     * 归一 api 根路径，并兼容存量脏数据。
     *
     * <p>存量库可能还是建表脚本的旧默认值 {@code /api/v1/classroom}（多的那一段单数
     * classroom 在 classroom-service 中不存在，其控制器全部映射在 {@code /api/v1/classrooms}、
     * {@code /api/v1/schedules}、{@code /api/v1/recordings}、{@code /api/v1/admin/classrooms}）。
     * 直接用它拼接必然 404，而 push 是 best-effort、前端报错也不指向配置——排查成本极高。
     * 因此这里做一次显式回退并 WARN，等运维执行 patch 脚本后告警自然消失。
     */
    private String normalizeApiBasePath(String basePath, EclassroomInstance instance) {
        String p = normalizeBasePath(basePath);
        if (p.endsWith("/classroom")) {
            log.warn("课堂实例 api_base_path={} 为历史错误值（classroom-service 无该路径前缀），"
                    + "已按 {} 处理。请执行 sql/patch/20261028-1700-classroom-integration-fix.sql 修正存量数据。"
                    + " instanceId={}", basePath, DEFAULT_API_BASE_PATH, instance.getId());
            return DEFAULT_API_BASE_PATH;
        }
        return p;
    }

    private String buildWsUrl(EclassroomInstance instance) {
        String host = instance.getWsHost() != null ? instance.getWsHost() : instance.getApiHost();
        if (host == null) return null;
        Integer port = instance.getWsPort() != null ? instance.getWsPort() : instance.getApiPort();
        String basePath = instance.getWsBasePath();
        if (basePath == null) basePath = DEFAULT_WS_BASE_PATH;
        return "ws" + buildUrl(host, port, normalizeBasePath(basePath)).substring(4);
    }

    /**
     * 归一化根路径：去掉末尾斜杠（避免拼出 {@code //classrooms}），
     * 空串/仅空白/仅斜杠一律归为 ""（表示根）。
     */
    private String normalizeBasePath(String basePath) {
        if (basePath == null) return "";
        String p = basePath.trim();
        if (p.isEmpty() || "/".equals(p)) return "";
        if (!p.startsWith("/")) p = "/" + p;
        while (p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
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