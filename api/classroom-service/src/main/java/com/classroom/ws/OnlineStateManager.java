package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 在线状态机管理（Redis）。
 * 心跳间隔 15 秒，在线 key 的 TTL 由 {@code classroom.offline-timeout-seconds} 控制（默认 60s，
 * 必须 ≥ 心跳间隔，否则健康客户端会被误判掉线）。掉线判定扫描器以「key 是否还在」为在线真相源。
 */
@Slf4j
@Component
public class OnlineStateManager {

    private final RedisTemplate<String, Object> redisTemplate;
    private final int offlineTimeoutSeconds;

    public OnlineStateManager(RedisTemplate<String, Object> redisTemplate,
                             @Value("${classroom.offline-timeout-seconds:60}") int offlineTimeoutSeconds) {
        this.redisTemplate = redisTemplate;
        this.offlineTimeoutSeconds = Math.max(offlineTimeoutSeconds, 5);
    }

    public void refresh(String scheduleId, String userId) {
        try {
            redisTemplate.opsForValue().set(
                    "online:" + scheduleId + ":" + userId,
                    "ONLINE",
                    Duration.ofSeconds(offlineTimeoutSeconds));
        } catch (Exception e) {
            log.debug("Redis 在线状态刷新失败: scheduleId={}, userId={}", scheduleId, userId);
        }
    }

    public boolean isOnline(String scheduleId, String userId) {
        try {
            return redisTemplate.hasKey("online:" + scheduleId + ":" + userId);
        } catch (Exception e) {
            return false;
        }
    }

    public void setOffline(String scheduleId, String userId) {
        try {
            redisTemplate.delete("online:" + scheduleId + ":" + userId);
        } catch (Exception e) {
            log.debug("Redis 在线状态清除失败: scheduleId={}, userId={}", scheduleId, userId);
        }
    }
}