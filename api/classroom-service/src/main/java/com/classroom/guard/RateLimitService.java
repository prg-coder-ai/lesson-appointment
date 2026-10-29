package com.classroom.guard;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 用户维度限流（包4B）。
 *
 * <p>修复前课堂侧<b>没有任何限流</b>：一个脚本循环 {@code POST /enter} 能在几秒内
 * 把 membership 表的在线态刷成麻花，{@code /uploads/init} 能刷出一堆空会话占满磁盘。
 *
 * <p>三条实现约定：
 * <ol>
 *   <li><b>固定窗口计数</b>（INCR + 首次 EXPIRE）：课堂场景的突发都在秒级，
 *       滑动窗口收益不大，反而要多存一份时间序列；</li>
 *   <li><b>必须用 StringRedisTemplate</b>：RedisTemplate&lt;String,Object&gt; 的值经过
 *       JSON 序列化，{@code INCR} 会报 "value is not an integer" —— 那样限流会
 *       永远 fail-open，等于没做；</li>
 *   <li><b>Redis 挂了放行</b>：限流是保护措施不是鉴权，不能因为它不可用就把课堂拒之门外。
 *       放行时打 WARN，让运维知道这段时间没有保护。</li>
 * </ol>
 */
@Slf4j
@Component
public class RateLimitService {

    private final StringRedisTemplate redis;

    @Value("${classroom.rate-limit.enabled:true}")
    private boolean enabled;

    /** Redis 不可用时本地兜底计数，避免「一挂就完全裸奔」 */
    private final Map<String, long[]> localWindows = new ConcurrentHashMap<>();

    public RateLimitService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * @param scope    动作名（enter/upload/rollcall/submit）
     * @param subject  限流主体（userId；匿名调用用 IP）
     * @param limit    窗口内允许次数
     * @param windowSeconds 窗口长度（秒）
     * @return true 放行，false 命中限流
     */
    public boolean tryAcquire(String scope, String subject, int limit, int windowSeconds) {
        if (!enabled || limit <= 0) return true;
        String key = "rl:" + scope + ":" + (subject == null ? "anon" : subject);
        try {
            Long n = redis.opsForValue().increment(key);
            if (n != null && n == 1L) {
                redis.expire(key, Duration.ofSeconds(windowSeconds));
            }
            if (n != null && n > limit) {
                log.warn("限流命中: key={}, count={}, limit={}/{}s", key, n, limit, windowSeconds);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("Redis 限流不可用，使用本地兜底计数: key={}, err={}", key, e.getMessage());
            return localAcquire(key, limit, windowSeconds);
        }
    }

    /** Redis 故障时的进程内兜底（单实例有效，集群下各实例独立计数，聊胜于无） */
    private boolean localAcquire(String key, int limit, int windowSeconds) {
        long now = System.currentTimeMillis();
        long[] slot = localWindows.computeIfAbsent(key, k -> new long[]{now, 0});
        synchronized (slot) {
            if (now - slot[0] >= windowSeconds * 1000L) {
                slot[0] = now;
                slot[1] = 0;
            }
            slot[1]++;
            if (slot[1] > limit) {
                log.warn("本地兜底限流命中: key={}, count={}, limit={}", key, slot[1], limit);
                return false;
            }
            return true;
        }
    }
}
