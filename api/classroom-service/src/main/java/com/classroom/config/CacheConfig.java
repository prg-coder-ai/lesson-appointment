package com.classroom.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.cache.annotation.EnableCaching;

import java.util.concurrent.TimeUnit;

/**
 * Caffeine 本地缓存配置。
 *
 * <p>用于课堂开关守卫（TenantEclassroomService），缓存租户课堂启用状态，
 * TTL 5 分钟 —— 课堂开关变更频率极低，5 分钟内缓存命中可大幅减少跨 schema 查询。
 *
 * <p>缓存名：{@code classroomEnabled} —— key=tenantId(Long)，value=Boolean。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * 课堂开关缓存名。
     */
    public static final String CACHE_CLASSROOM_ENABLED = "classroomEnabled";

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(CACHE_CLASSROOM_ENABLED);
        manager.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(10000)
                .recordStats());
        return manager;
    }
}