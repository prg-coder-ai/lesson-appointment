package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 在线状态机管理（Redis）。
 * 心跳间隔 15 秒，IDLE 宽限 15-60 秒，>60 秒判 OFFLINE。
 */
@Slf4j
@Component
public class OnlineStateManager {

    private final RedisTemplate<String, Object> redisTemplate;

    public OnlineStateManager(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void refresh(String scheduleId, String userId) {
        try {
            redisTemplate.opsForValue().set(
                    "online:" + scheduleId + ":" + userId,
                    "ONLINE",
                    Duration.ofSeconds(30));
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