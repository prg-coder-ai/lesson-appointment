package com.classroom.event;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * eventId 幂等去重（Redis SETNX，TTL 7天）。
 * 降级：reconcile_log 表 event_id 唯一索引插入冲突即重复。
 */
@Slf4j
@Component
public class EventIdempotentGuard {

    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${mq.enabled:false}")
    private boolean mqEnabled;

    public EventIdempotentGuard(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public boolean tryAcquire(String eventId) {
        try {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                    "idem:" + eventId, "1", Duration.ofDays(7));
            return Boolean.TRUE.equals(acquired);
        } catch (Exception e) {
            log.warn("Redis 幂等去重失败，降级放行（由 DB 唯一索引兜底）: eventId={}", eventId, e);
            return true;
        }
    }
}