package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.reservation.entity.EclassroomInstance;
import com.reservation.entity.Tenant;
import com.reservation.entity.TenantEclassroom;
import com.reservation.mapper.EclassroomInstanceMapper;
import com.reservation.mapper.TenantEclassroomMapper;
import com.reservation.mapper.TenantMapper;
import com.reservation.utils.JwtUtil;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private TenantMapper tenantMapper;
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

    /**
     * 课堂监视用的拉取客户端。
     *
     * <p>超时比清缓存宽：对方要查「今日课堂 + 逐课在线数」，是几次 DB 查询；
     * 但也不能太长 —— 平台端页面会等它，实例挂掉时必须快速返回 reachable=false。
     */
    private RestTemplate monitorClient;

    @PostConstruct
    private void initMonitorClient() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(1000);
        f.setReadTimeout(2500);
        this.monitorClient = new RestTemplate(f);
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

    // ==================== 课堂监视（平台端「在线课堂 → 课堂监视」） ====================

    /**
     * 每个课堂实例的：所属租户、实际课程数、实时在线数。
     *
     * <p>数据来自两处，缺一不可：
     * <ul>
     *   <li><b>实例 ↔ 租户归属</b>：本库 {@code sys_tenant_eclassroom}（「绑定」操作的唯一真相源，
     *       课堂服务那边没有这张表）；</li>
     *   <li><b>课程数 / 在线数</b>：<b>必须问实例自己</b>（{@code GET {apiBaseUrl}/system/eclassroom/instance-stats}）。
     *       课堂库在课堂服务侧，主库查不到；也不能假设"所有实例共用一个库" ——
     *       多实例部署时各自独立，只能逐个拉。</li>
     * </ul>
     *
     * <p>采集失败的实例<b>不会让整张表打不出来</b>：返回 {@code reachable=false} + {@code error}
     * 说明原因，前端照常渲染该行（运营最需要看到的恰恰是"这台挂了"）。
     *
     * <p>停用 / 维护中 / API 地址为空（含空串，历史脏数据）的实例<b>不发起调用</b>：
     * 调了只会得到误导性的 0，让人误以为"这台空着，可以往上绑租户"。
     */
    public List<Map<String, Object>> instanceMonitor() {
        List<EclassroomInstance> instances = listInstances();
        Map<Long, List<Map<String, Object>>> tenantsByInstance = loadTenantsByInstance();

        List<Map<String, Object>> out = new ArrayList<>();
        for (EclassroomInstance inst : instances) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", inst.getId());
            row.put("instanceCode", inst.getInstanceCode());
            row.put("instanceName", inst.getInstanceName());
            row.put("region", inst.getRegion());
            row.put("status", inst.getStatus());
            row.put("maxCapacity", inst.getMaxCapacity());
            String apiBaseUrl = buildApiUrl(inst);
            row.put("apiBaseUrl", apiBaseUrl);

            List<Map<String, Object>> tenants = tenantsByInstance.get(inst.getId());
            if (tenants == null) tenants = new ArrayList<>();
            row.put("tenantCount", tenants.size());
            row.put("tenants", tenants);

            String skipReason = null;
            if (!Integer.valueOf(1).equals(inst.getStatus())) {
                skipReason = "实例状态为「" + statusTextOf(inst.getStatus()) + "」，未采集";
            } else if (inst.getApiHost() == null || inst.getApiHost().isBlank()) {
                // 空串历史脏数据：buildApiUrl 只判 null，空串会拼出 http://:8092/api/v1
                skipReason = "实例 API 地址未配置，未采集";
            } else if (apiBaseUrl == null || apiBaseUrl.isBlank()) {
                skipReason = "实例 API 地址无法解析，未采集";
            }
            if (skipReason != null) {
                row.put("reachable", false);
                row.put("error", skipReason);
            } else {
                fetchInstanceStats(row, apiBaseUrl);
            }
            out.add(row);
        }
        return out;
    }

    /**
     * 实例 → 租户列表（一次查全，避免逐实例 N+1）。
     *
     * <p>{@code sys_tenant_eclassroom} 与 {@code sys_tenant} 都在租户插件的忽略表里（平台表），
     * 这里可以裸查；{@code enabled=0} 的绑定也一并返回 —— 「绑定着但被禁用」本身就是要看的状态，
     * 前端按 {@code enabled} 区分展示。
     */
    private Map<Long, List<Map<String, Object>>> loadTenantsByInstance() {
        Map<Long, List<Map<String, Object>>> out = new HashMap<>();
        List<TenantEclassroom> bindings = tenantEclassroomMapper.selectList(new LambdaQueryWrapper<>());
        if (bindings == null || bindings.isEmpty()) return out;

        List<Long> tenantIds = new ArrayList<>();
        for (TenantEclassroom b : bindings) {
            if (b.getTenantId() != null) tenantIds.add(b.getTenantId());
        }
        Map<Long, Tenant> tenantMap = new HashMap<>();
        if (!tenantIds.isEmpty()) {
            List<Tenant> tenants = tenantMapper.selectBatchIds(tenantIds);
            if (tenants != null) {
                for (Tenant t : tenants) {
                    if (t != null && t.getId() != null) tenantMap.put(t.getId(), t);
                }
            }
        }

        for (TenantEclassroom b : bindings) {
            if (b.getInstanceId() == null) continue;
            List<Map<String, Object>> list = out.get(b.getInstanceId());
            if (list == null) {
                list = new ArrayList<>();
                out.put(b.getInstanceId(), list);
            }
            Tenant t = b.getTenantId() == null ? null : tenantMap.get(b.getTenantId());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("tenantId", b.getTenantId());
            item.put("tenantCode", t == null ? null : t.getTenantCode());
            // orgName 是租户的展示名（租户表里没有 name 字段，机构名即租户名）
            item.put("orgName", t == null ? null : t.getOrgName());
            item.put("enabled", b.getEnabled());
            list.add(item);
        }

        // 按租户 ID 稳定排序：刷新前后行内顺序不该跳
        for (List<Map<String, Object>> list : out.values()) {
            list.sort((o1, o2) -> Long.compare(asLong(o1.get("tenantId")), asLong(o2.get("tenantId"))));
        }
        return out;
    }

    /**
     * 拉取单个实例的统计并并入行。任何失败都只落在该行（{@code reachable=false}），
     * 不影响其它实例。
     */
    private void fetchInstanceStats(Map<String, Object> row, String apiBaseUrl) {
        String url = apiBaseUrl + "/system/eclassroom/instance-stats";
        try {
            // tenantId 传 0：实例级统计划不到任何单租户头上。
            // system 角色在课堂侧豁免「租户是否开通课堂」校验，否则拿不到全局数。
            String token = jwtUtil.generateToken(0L, SYSTEM_PRINCIPAL, SYSTEM_PRINCIPAL);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(token);
            ResponseEntity<Map> resp = monitorClient.exchange(url, HttpMethod.GET,
                    new HttpEntity<>(headers), Map.class);
            Map<?, ?> body = resp.getBody();
            Object data = body == null ? null : body.get("data");
            if (!(data instanceof Map)) {
                row.put("reachable", false);
                row.put("error", "课堂服务未返回统计数据（code="
                        + (body == null ? "-" : body.get("code")) + "）");
                return;
            }
            Map<?, ?> stats = (Map<?, ?>) data;
            row.put("reachable", true);
            row.put("todayClasses", stats.get("todayClasses"));
            row.put("liveClasses", stats.get("liveClasses"));
            row.put("readyClasses", stats.get("readyClasses"));
            row.put("onlineUsers", stats.get("onlineUsers"));
            row.put("collectedAt", stats.get("serverTime"));
        } catch (Exception e) {
            row.put("reachable", false);
            row.put("error", shortError(e));
            log.warn("[eclassroom] 拉取实例统计失败, url={}, err={}", url, e.getMessage());
        }
    }

    private static long asLong(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }

    private static String statusTextOf(Integer status) {
        if (Integer.valueOf(1).equals(status)) return "正常";
        if (Integer.valueOf(0).equals(status)) return "停用";
        if (Integer.valueOf(2).equals(status)) return "维护中";
        return status == null ? "未知" : String.valueOf(status);
    }

    private static String shortError(Exception e) {
        String m = e.getMessage();
        if (m == null || m.isBlank()) return e.getClass().getSimpleName();
        return m.length() > 160 ? m.substring(0, 160) + "…" : m;
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