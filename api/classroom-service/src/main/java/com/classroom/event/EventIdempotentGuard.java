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

    /**
     * 释放幂等占位（运维重放用，F8-05）。
     *
     * <p>没有它，重放一个曾处理失败的事件会被自己的幂等键挡在门外——
     * 「重放」按钮点下去什么都不会发生，还看不出来为什么。
     *
     * <p>注意 DB 侧 {@code classroom_reconcile_log.event_id} 是主键，重放后
     * {@code logEvent} 撞键会被静默忽略（保留首次结论）。这是有意的：
     * 审计保留第一次的事实，重放结果另记一条 diff。
     */
    public void release(String eventId) {
        try {
            redisTemplate.delete("idem:" + eventId);
        } catch (Exception e) {
            log.warn("释放幂等键失败: eventId={}", eventId, e);
        }
    }
}