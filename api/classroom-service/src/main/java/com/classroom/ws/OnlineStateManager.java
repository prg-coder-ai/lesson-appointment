package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 在线状态机管理（Redis）。
 *
 * <p>心跳间隔 15 秒；在线 key 存「最后一次心跳时间戳（ms）」，TTL = {@code offline-timeout-seconds} + 10，
 * 保证在整个判定窗口内可读，供掉线扫描器区分 ONLINE / IDLE / OFFLINE 三级。</p>
 *
 * <p><b>P1 改造（F3-03/04 IDLE 宽限）</b>：修复前只存 "ONLINE" 布尔、并用 key 是否消失做二元判定，
 * 抖动/切网 15-60s 内会被直接判 OFFLINE 并离开。现改为按「距最后心跳的 elapsed」分级：
 * <ul>
 *   <li>elapsed ≤ reconnectGraceSeconds → ONLINE（健康）；</li>
 *   <li>reconnectGraceSeconds &lt; elapsed ≤ offlineTimeoutSeconds → IDLE（不离开，给重连留缓冲）；</li>
 *   <li>elapsed &gt; offlineTimeoutSeconds 或 key 已消失 → OFFLINE + leave。</li>
 * </ul>
 * {@code reconnect-grace-seconds}（默认 30）即「15-60s 闪断宽限」的可配置落点。</p>
 */
@Slf4j
@Component
public class OnlineStateManager {

    private final RedisTemplate<String, Object> redisTemplate;
    private final int offlineTimeoutSeconds;
    private final int reconnectGraceSeconds;

    public OnlineStateManager(RedisTemplate<String, Object> redisTemplate,
                             @Value("${classroom.offline-timeout-seconds:60}") int offlineTimeoutSeconds,
                             @Value("${classroom.reconnect-grace-seconds:30}") int reconnectGraceSeconds) {
        this.redisTemplate = redisTemplate;
        this.offlineTimeoutSeconds = Math.max(offlineTimeoutSeconds, 5);
        this.reconnectGraceSeconds = Math.max(Math.min(reconnectGraceSeconds, this.offlineTimeoutSeconds - 1), 1);
    }

    /** 心跳刷新：写入最后心跳时间戳，TTL 覆盖整个判定窗口 */
    public void refresh(String scheduleId, String userId) {
        try {
            redisTemplate.opsForValue().set(
                    "online:" + scheduleId + ":" + userId,
                    String.valueOf(System.currentTimeMillis()),
                    Duration.ofSeconds(offlineTimeoutSeconds + 10));
        } catch (Exception e) {
            log.debug("Redis 在线状态刷新失败: scheduleId={}, userId={}", scheduleId, userId);
        }
    }

    /** 距最后心跳的毫秒数；key 不存在返回 null（视为已超 offlineTimeout） */
    public Long lastSeenElapsed(String scheduleId, String userId) {
        try {
            Object v = redisTemplate.opsForValue().get("online:" + scheduleId + ":" + userId);
            if (v == null) return null;
            long ts = Long.parseLong(v.toString());
            return System.currentTimeMillis() - ts;
        } catch (Exception e) {
            return null;
        }
    }

    /** 兼容性保留：key 是否还在（心跳仍在刷新） */
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

    public int getOfflineTimeoutSeconds() {
        return offlineTimeoutSeconds;
    }

    public int getReconnectGraceSeconds() {
        return reconnectGraceSeconds;
    }
}
