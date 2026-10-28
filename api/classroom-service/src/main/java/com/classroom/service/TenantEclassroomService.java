package com.classroom.service;

import com.classroom.entity.EclassroomInstance;
import com.classroom.entity.TenantEclassroom;
import com.classroom.mapper.EclassroomInstanceMapper;
import com.classroom.mapper.TenantEclassroomMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 租户课堂守卫服务。
 *
 * <p>classroom-service 侧的课堂开关校验：判断某租户是否已启用课堂且关联的实例处于正常状态。
 * 查询主系统 {@code lesson_appointment} schema 的 {@code sys_tenant_eclassroom} + {@code sys_eclassroom_instance} 表。
 *
 * <p><b>缓存</b>：自实现内存缓存（ConcurrentHashMap + TTL 5min），key=tenantId，value=CacheEntry。
 * 课堂开关变更频率极低，缓存可大幅减少跨 schema 查询。管理员启用/禁用课堂后，
 * 最多 5 分钟内 classroom-service 侧生效（可接受，课堂开关不是实时敏感操作）。
 *
 * <p><b>调用方</b>：{@link com.classroom.security.AuthInterceptor} 在 JWT 校验通过后调用
 * {@link #hasClassroomEnabled} 校验，未启用则返回 403。
 */
@Service
public class TenantEclassroomService {

    private static final Logger log = LoggerFactory.getLogger(TenantEclassroomService.class);

    /** 缓存 TTL：5 分钟 */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    @Autowired
    private TenantEclassroomMapper tenantEclassroomMapper;
    @Autowired
    private EclassroomInstanceMapper eclassroomInstanceMapper;

    /** 内存缓存：key=tenantId, value=CacheEntry(enabled, expireAt) */
    private final Map<Long, CacheEntry> cache = new ConcurrentHashMap<>();

    /**
     * 判断租户是否启用了课堂（含实例状态校验）。
     *
     * @param tenantId 租户 ID
     * @return true=课堂已启用且实例正常；false=未启用/已禁用/实例异常
     */
    public boolean hasClassroomEnabled(Long tenantId) {
        if (tenantId == null || tenantId == 0L || tenantId == -1L) {
            return false;
        }

        CacheEntry entry = cache.get(tenantId);
        if (entry != null && !entry.isExpired()) {
            return entry.enabled;
        }

        boolean enabled = doCheckClassroomEnabled(tenantId);
        cache.put(tenantId, new CacheEntry(enabled, System.currentTimeMillis() + CACHE_TTL_MS));
        return enabled;
    }

    /**
     * 强制清除某租户的缓存。
     */
    public void evictCache(Long tenantId) {
        cache.remove(tenantId);
    }

    /**
     * 清除全部缓存。
     */
    public void evictAllCache() {
        cache.clear();
    }

    private boolean doCheckClassroomEnabled(Long tenantId) {
        try {
            TenantEclassroom te = tenantEclassroomMapper.selectByTenantId(tenantId);
            if (te == null || te.getEnabled() == null || te.getEnabled() != 1) {
                return false;
            }

            EclassroomInstance instance = eclassroomInstanceMapper.selectByIdNotDeleted(te.getInstanceId());
            if (instance == null || instance.getStatus() == null || instance.getStatus() != 1) {
                log.warn("租户{}课堂实例异常: instanceId={}", tenantId, te.getInstanceId());
                return false;
            }

            return true;
        } catch (Exception e) {
            log.warn("查询租户课堂开关失败(降级为false): tenantId={}, err={}", tenantId, e.getMessage());
            return false;
        }
    }

    private static class CacheEntry {
        final boolean enabled;
        final long expireAt;

        CacheEntry(boolean enabled, long expireAt) {
            this.enabled = enabled;
            this.expireAt = expireAt;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireAt;
        }
    }
}