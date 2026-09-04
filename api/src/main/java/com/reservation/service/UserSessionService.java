package com.reservation.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.reservation.entity.UserSession;
import com.reservation.mapper.UserSessionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 用户会话服务（单机部署）
 * 在线统计的数据来源：登录写入会话、请求续期、登出标记、定时清理过期会话。
 * 活跃窗口（多少分钟内算在线）由 sys_system_config 的 monitor.online.idle.minutes 配置。
 */
@Service
public class UserSessionService {

    private static final Logger log = LoggerFactory.getLogger(UserSessionService.class);

    /** 会话状态：在线 */
    public static final int STATUS_ONLINE = 1;
    /** 会话状态：已登出 */
    public static final int STATUS_LOGOUT = 2;
    /** 会话状态：已过期 */
    public static final int STATUS_EXPIRED = 3;

    /** 会话续期节流窗口（毫秒），避免每个请求都写库 */
    private static final long TOUCH_INTERVAL_MS = 60_000L;

    /** 会话续期节流缓存：sessionId -> 上次写库时间 */
    private final Map<String, Long> touchCache = new ConcurrentHashMap<>();

    @Autowired
    private UserSessionMapper userSessionMapper;

    @Autowired
    private SysConfigService sysConfigService;

    /**
     * 由 Token 派生会话ID（同一 Token 多次请求命中同一会话）
     */
    public String sessionIdOf(String token) {
        if (token == null || token.isBlank()) {
            return "";
        }
        String raw = token.startsWith("Bearer ") ? token.substring(7) : token;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 16; i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            // SHA-256 必然可用，兜底取字符串哈希
            return String.valueOf(raw.hashCode());
        }
    }

    /**
     * 登录：写入会话记录
     */
    public void onLogin(String token, Long tenantId, String userId, String role, String ip, String userAgent) {
        String sessionId = sessionIdOf(token);
        if (sessionId.isEmpty()) {
            return;
        }
        try {
            // 同一会话重复登录时先清理旧记录
            LambdaUpdateWrapper<UserSession> del = new LambdaUpdateWrapper<>();
            del.eq(UserSession::getSessionId, sessionId);
            userSessionMapper.delete(del);

            UserSession session = new UserSession();
            session.setSessionId(sessionId);
            session.setTenantId(tenantId == null ? 0L : tenantId);
            session.setUserId(userId);
            session.setUserRole(role);
            session.setIp(ip);
            session.setUserAgent(userAgent == null ? null : userAgent.substring(0, Math.min(500, userAgent.length())));
            session.setLoginTime(LocalDateTime.now());
            session.setLastActive(LocalDateTime.now());
            session.setStatus(STATUS_ONLINE);
            userSessionMapper.insert(session);
            touchCache.put(sessionId, System.currentTimeMillis());
        } catch (Exception e) {
            // 会话记录失败不应阻断登录流程
            log.warn("写入用户会话失败, userId={}, 原因={}", userId, e.getMessage());
        }
    }

    /**
     * 请求续期（拦截器调用，60 秒节流）
     */
    public void touch(String token) {
        String sessionId = sessionIdOf(token);
        if (sessionId.isEmpty()) {
            return;
        }
        Long last = touchCache.get(sessionId);
        long now = System.currentTimeMillis();
        if (last != null && now - last < TOUCH_INTERVAL_MS) {
            return;
        }
        touchCache.put(sessionId, now);
        try {
            LambdaUpdateWrapper<UserSession> uw = new LambdaUpdateWrapper<>();
            uw.eq(UserSession::getSessionId, sessionId)
              .eq(UserSession::getStatus, STATUS_ONLINE)
              .set(UserSession::getLastActive, LocalDateTime.now());
            userSessionMapper.update(null, uw);
        } catch (Exception e) {
            log.warn("会话续期失败, sessionId={}, 原因={}", sessionId, e.getMessage());
        }
    }

    /**
     * 登出
     */
    public void onLogout(String token) {
        String sessionId = sessionIdOf(token);
        if (sessionId.isEmpty()) {
            return;
        }
        touchCache.remove(sessionId);
        LambdaUpdateWrapper<UserSession> uw = new LambdaUpdateWrapper<>();
        uw.eq(UserSession::getSessionId, sessionId)
          .set(UserSession::getStatus, STATUS_LOGOUT);
        userSessionMapper.update(null, uw);
    }

    /**
     * 强制下线指定用户（踢人）
     */
    public int kickUser(String userId) {
        touchCache.clear();
        LambdaUpdateWrapper<UserSession> uw = new LambdaUpdateWrapper<>();
        uw.eq(UserSession::getUserId, userId)
          .eq(UserSession::getStatus, STATUS_ONLINE)
          .set(UserSession::getStatus, STATUS_LOGOUT);
        return userSessionMapper.update(null, uw);
    }

    /**
     * 在线用户数（活跃窗口内）；tenantId 为 null 表示全平台
     */
    public int countOnline(Long tenantId) {
        int idleMinutes = sysConfigService.getInt(SysConfigService.KEY_ONLINE_IDLE, 5);
        LocalDateTime since = LocalDateTime.now().minusMinutes(idleMinutes);
        LambdaQueryWrapper<UserSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserSession::getStatus, STATUS_ONLINE)
               .ge(UserSession::getLastActive, since);
        if (tenantId != null) {
            wrapper.eq(UserSession::getTenantId, tenantId);
        }
        Long count = userSessionMapper.selectCount(wrapper);
        return count == null ? 0 : count.intValue();
    }

    /**
     * 各租户在线人数
     */
    public List<Map<String, Object>> countOnlineByTenant() {
        int idleMinutes = sysConfigService.getInt(SysConfigService.KEY_ONLINE_IDLE, 5);
        LocalDateTime since = LocalDateTime.now().minusMinutes(idleMinutes);
        LambdaQueryWrapper<UserSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(UserSession::getTenantId)
               .eq(UserSession::getStatus, STATUS_ONLINE)
               .ge(UserSession::getLastActive, since);
        List<UserSession> sessions = userSessionMapper.selectList(wrapper);
        Map<Long, Integer> counter = new java.util.LinkedHashMap<>();
        if (sessions != null) {
            for (UserSession s : sessions) {
                Long tid = s.getTenantId() == null ? 0L : s.getTenantId();
                counter.merge(tid, 1, Integer::sum);
            }
        }
        List<Map<String, Object>> result = new ArrayList<>();
        counter.forEach((k, v) -> result.add(Map.of("tenantId", k, "onlineCount", v)));
        return result;
    }

    /**
     * 清理过期会话（超过活跃窗口仍未续期的置为过期，保留记录用于统计登录时长）
     */
    public int cleanExpired() {
        int idleMinutes = sysConfigService.getInt(SysConfigService.KEY_ONLINE_IDLE, 5);
        LocalDateTime expireBefore = LocalDateTime.now().minusMinutes(idleMinutes * 6L);
        LambdaUpdateWrapper<UserSession> uw = new LambdaUpdateWrapper<>();
        uw.eq(UserSession::getStatus, STATUS_ONLINE)
          .lt(UserSession::getLastActive, expireBefore)
          .set(UserSession::getStatus, STATUS_EXPIRED);
        int rows = userSessionMapper.update(null, uw);
        if (rows > 0) {
            log.info("清理过期会话, 数量={}", rows);
        }
        return rows;
    }

    /**
     * 清理历史会话记录（保留指定天数）
     */
    public int cleanHistory(int keepDays) {
        LocalDateTime before = LocalDateTime.now().minusDays(keepDays);
        LambdaQueryWrapper<UserSession> wrapper = new LambdaQueryWrapper<>();
        wrapper.lt(UserSession::getLoginTime, before);
        int rows = userSessionMapper.delete(wrapper);
        if (rows > 0) {
            log.info("清理历史会话记录, 数量={}", rows);
        }
        return rows;
    }
}
