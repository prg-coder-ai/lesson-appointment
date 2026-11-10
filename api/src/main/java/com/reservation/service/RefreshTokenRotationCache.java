package com.reservation.service;

import com.reservation.dto.TokenDTO;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * refreshToken 轮换幂等缓存（2026-11-05 复核修复 #2：多标签页并发刷新互踢）。
 *
 * <p>问题：同源多个标签页共享同一份 localStorage，却各有各的前端刷新互斥标志。
 * access token 同时过期时，两个标签页会带<b>同一个旧 refreshToken</b> 并发调用
 * /auth/refreshToken。第一个请求在 {@link RefreshTokenService#rotateToken} 里删掉旧凭证，
 * 第二个请求的 {@code checkValidToken} 就会返回 null → 401 → 前端清登录态，用户被踢下线。
 *
 * <p>解法：轮换成功后，把「旧凭证 → 本次签发的双 token」在进程内短时缓存。
 * 后续携带同一旧凭证的请求（JWT 仍合法、type=refresh）直接复用同一对新 token，
 * 于是各标签页写入 localStorage 的值完全相同，既不会互相覆盖，也不会被判为凭证失效。
 *
 * <p>安全与边界：
 * <ul>
 *   <li>缓存只在 JWT 签名/类型/过期校验通过、且用户未被删除或冻结之后才查询；</li>
 *   <li>key 用旧凭证的 SHA-256，缓存里不存原始 refreshToken；</li>
 *   <li>TTL 30 秒，只覆盖并发窗口；到期自动清理，并设条数上限防内存膨胀；</li>
 *   <li>进程内缓存，多实例部署时各实例独立（本项目为单实例 booking jar）；
 *       实例重启后缓存消失，仅影响重启瞬间的并发窗口，不影响正确性。</li>
 * </ul>
 */
@Component
public class RefreshTokenRotationCache {

    private static final long TTL_MS = 30_000L;
    private static final int MAX_ENTRIES = 2000;

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    private static final class Entry {
        final String userId;
        final TokenDTO dto;
        final long expireAt;

        Entry(String userId, TokenDTO dto, long expireAt) {
            this.userId = userId;
            this.dto = dto;
            this.expireAt = expireAt;
        }
    }

    /** 取同一旧凭证刚刚轮换出的双 token；过期或 userId 不匹配返回 null。 */
    public TokenDTO get(String oldRefreshToken, String userId) {
        String key = key(oldRefreshToken);
        Entry e = cache.get(key);
        if (e == null) return null;
        if (System.currentTimeMillis() > e.expireAt) {
            cache.remove(key, e);
            return null;
        }
        return userId.equals(e.userId) ? e.dto : null;
    }

    public void put(String oldRefreshToken, String userId, TokenDTO dto) {
        sweep();
        cache.put(key(oldRefreshToken), new Entry(userId, dto, System.currentTimeMillis() + TTL_MS));
    }

    private void sweep() {
        long now = System.currentTimeMillis();
        cache.entrySet().removeIf(en -> en.getValue().expireAt <= now);
        if (cache.size() > MAX_ENTRIES) cache.clear();
    }

    private String key(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
