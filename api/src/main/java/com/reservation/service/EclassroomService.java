package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.EclassroomInstance;
import com.reservation.entity.TenantEclassroom;
import com.reservation.mapper.EclassroomInstanceMapper;
import com.reservation.mapper.TenantEclassroomMapper;
import com.reservation.utils.JwtUtil;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

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
    @Autowired
    private JwtUtil jwtUtil;

    /** 服务间调用的主体标识（与 ClassroomEventPushService 同口径，role=system 会被课堂侧豁免开关校验）。 */
    private static final String SYSTEM_PRINCIPAL = "system";

    /** 清缓存用的轻量客户端（懒建一次，不复用事件推送那个 5 秒读超时的实例）。 */
    private RestTemplate evictClient;

    @PostConstruct
    private void initEvictClient() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        // 平台管理员点「启用/禁用」不该被课堂服务的慢响应拖住：连不上就放弃，
        // 由课堂侧的 5 分钟 TTL 自然过期兜底（见 classroom-service TenantEclassroomService.CACHE_TTL_MS）。
        f.setConnectTimeout(800);
        f.setReadTimeout(1500);
        this.evictClient = new RestTemplate(f);
    }

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
     * 批量查询多租户的课堂开关状态（平台端租户列表展示用，2026-11-20）。
     *
     * <p>一次 IN 查询代替逐行调用，避免列表页 N+1。返回 tenantId → enabled
     * （1=启用 / 0=禁用）；**不在 map 里的 tenantId = 从未绑定（未开通）**，
     * 调用方据此把 null 与 0 区分开。
     *
     * <p>表 sys_tenant_eclassroom 没有进 IGNORE_TABLES，但平台管理员 tenantId=0 时
     * 租户插件整体短路（见 MyBatisPlusConfig#ignoreTable），所以这里能查到全部租户。
     */
    public Map<Long, Integer> batchClassroomEnabled(List<Long> tenantIds) {
        Map<Long, Integer> result = new HashMap<>();
        if (tenantIds == null || tenantIds.isEmpty()) return result;
        List<TenantEclassroom> rows = tenantEclassroomMapper.selectList(
                new LambdaQueryWrapper<TenantEclassroom>()
                        .select(TenantEclassroom::getTenantId, TenantEclassroom::getEnabled)
                        .in(TenantEclassroom::getTenantId, tenantIds));
        if (rows == null) return result;
        for (TenantEclassroom te : rows) {
            if (te != null && te.getTenantId() != null) {
                result.put(te.getTenantId(), te.getEnabled());
            }
        }
        return result;
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
        // 刚启用：课堂侧可能还缓存着「未开通(false)」，不清就要等 5 分钟 TTL 才放行
        evictRemoteCache(tenantId, resolveApiBaseUrlRaw(tenantId));
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
        // 禁用必须立刻生效：课堂侧缓存着 enabled=true 时，被停用/欠费的租户还能再进 5 分钟课堂。
        // 这里取地址用的是 resolveApiBaseUrlRaw（不看 enabled），否则刚置 0 就取不到实例地址了。
        evictRemoteCache(tenantId, resolveApiBaseUrlRaw(tenantId));
    }

    /**
     * 解绑租户课堂（删除关联记录）
     */
    public void unbindTenantClassroom(Long tenantId, String operator) {
        // 必须在删行**之前**取地址：删完 getTenantEclassroom 就查不到了，
        // 课堂侧那 5 分钟缓存也就没法主动清（解绑后它仍会认为"已开通"）。
        String apiBaseUrl = resolveApiBaseUrlRaw(tenantId);
        LambdaQueryWrapper<TenantEclassroom> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TenantEclassroom::getTenantId, tenantId);
        //cascade:none 测试
        tenantEclassroomMapper.delete(wrapper);
        log.info("租户{}解绑课堂, operator={}", tenantId, operator);
        evictRemoteCache(tenantId, apiBaseUrl);
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
        //cascade:none 测试
        instance.setDeleted(1);
        instanceMapper.updateById(instance);
        log.info("删除课堂实例: id={}, code={}", instanceId, instance.getInstanceCode());
    }

    // ==================== 课堂开关缓存失效（跨服务，2026-11-20） ====================

    /**
     * 取租户绑定实例的 API 根 —— **不看 enabled**。
     *
     * <p>为什么需要它：{@link #getTenantClassroomApiBaseUrl} 在 enabled=0 时返回 null，
     * 而「禁用 / 解绑」恰恰是刚把 enabled 置 0（或把行删掉）之后还要回调课堂服务的场景，
     * 用原方法会取不到地址，缓存也就清不掉。
     */
    private String resolveApiBaseUrlRaw(Long tenantId) {
        if (tenantId == null || tenantId == 0L) return null;
        TenantEclassroom te = getTenantEclassroom(tenantId);
        if (te == null || te.getInstanceId() == null) return null;
        EclassroomInstance instance = instanceMapper.selectById(te.getInstanceId());
        if (instance == null || Integer.valueOf(1).equals(instance.getDeleted())) return null;
        return buildApiUrl(instance);
    }

    /**
     * 通知 classroom-service 立刻丢掉该租户的课堂开关缓存。
     *
     * <p>背景：课堂侧 {@code hasClassroomEnabled} 有 5 分钟内存缓存，平台「禁用」之后
     * 该租户最多还能进课堂 5 分钟 —— 对已停用/欠费的租户不好解释；「刚启用」同理，
     * 明明开了却还要等 5 分钟才放行。改库之后主动打一次内部端点即可立刻生效。
     *
     * <p>三个刻意的选择：
     * <ul>
     *   <li>**整段吞异常**：平台侧开关已经落库成功，通知失败不能反过来把操作变成报错；
     *       课堂侧最迟 5 分钟自然过期，等于退回改动前的行为。</li>
     *   <li>超时压到 800ms/1500ms：这是平台管理员的点击路径，宁可放弃也不能卡住页面。</li>
     *   <li>带 role=system 的短票：课堂侧 AuthInterceptor 对 system 角色豁免课堂开关校验，
     *       否则"禁用后清缓存"这一步自己就会被 403 挡住。</li>
     * </ul>
     */
    private void evictRemoteCache(Long tenantId, String apiBaseUrl) {
        if (tenantId == null || tenantId == 0L) return;
        if (apiBaseUrl == null || apiBaseUrl.isBlank()) return;
        try {
            String token = jwtUtil.generateToken(tenantId, SYSTEM_PRINCIPAL, SYSTEM_PRINCIPAL);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            String url = apiBaseUrl + "/system/eclassroom/tenant/" + tenantId + "/evict";
            ResponseEntity<Map> resp = evictClient.postForEntity(url, new HttpEntity<>(headers), Map.class);
            if (resp.getStatusCode().is2xxSuccessful()) {
                log.info("[eclassroom] 已通知课堂服务清租户{}开关缓存", tenantId);
            } else {
                log.warn("[eclassroom] 清缓存返回非2xx, tenantId={}, status={}", tenantId, resp.getStatusCode());
            }
        } catch (Exception e) {
            log.warn("[eclassroom] 通知课堂服务清缓存失败(缓存最迟5分钟过期), tenantId={}, err={}",
                    tenantId, e.getMessage());
        }
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