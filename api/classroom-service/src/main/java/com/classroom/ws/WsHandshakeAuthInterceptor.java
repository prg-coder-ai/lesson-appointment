package com.classroom.ws;

import com.classroom.security.ClassroomAccessGuard;
import com.classroom.util.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手鉴权 + 房间归属绑定。
 *
 * <p><b>修的什么洞</b>：修复前 {@code WebSocketConfig} 只注册了三个 handler、
 * {@code setAllowedOriginPatterns("*")}，**没有任何握手校验**——前端虽然把
 * {@code ?access_token=} 拼在 URL 上，服务端从不读它。结果：
 * 匿名客户端可直接连上任意课堂的白板/信令/心跳通道；叠加 handler 里的
 * 「全局 sessions 广播」，A 课堂的笔迹会出现在 B 课堂（跨课堂串台）。
 *
 * <p><b>本拦截器做三件事</b>：
 * <ol>
 *   <li>校验 {@code access_token}（共享 jwt.secret，HS512），无效直接拒绝握手；</li>
 *   <li>从路径解析 scheduleId（{@code /ws/classrooms/{sid}/{channel}}），写入 session 属性，
 *       handler 据此做**房间内广播**而不是全局广播；</li>
 *   <li>复用 {@link ClassroomAccessGuard} 断言「这堂课归你」——非名单成员、非本课教师、
 *       被移出者、跨租户一律握不上手。</li>
 * </ol>
 *
 * <p>失败时只打 WARN 并返回 false，浏览器侧表现为「WebSocket 连接失败」，
 * 前端已有降级提示（{@code classroom-main.js} 的 onError → "信令连接失败"）。
 */
@Component
public class WsHandshakeAuthInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(WsHandshakeAuthInterceptor.class);

    /** 握手阶段就要确定房间，属性名与 handler 约定一致 */
    public static final String ATTR_SCHEDULE_ID = "scheduleId";
    public static final String ATTR_USER_ID = "userId";
    public static final String ATTR_ROLE = "role";

    private final JwtUtil jwtUtil;
    private final ClassroomAccessGuard accessGuard;

    public WsHandshakeAuthInterceptor(JwtUtil jwtUtil, ClassroomAccessGuard accessGuard) {
        this.jwtUtil = jwtUtil;
        this.accessGuard = accessGuard;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String token = resolveToken(request);
        if (token == null || token.isBlank()) {
            log.warn("WS 握手被拒：缺少 access_token, uri={}", request.getURI().getPath());
            return false;
        }
        if (!jwtUtil.verifyAccessToken(token)) {
            log.warn("WS 握手被拒：token 无效或已过期, uri={}", request.getURI().getPath());
            return false;
        }

        String scheduleId = parseScheduleId(request.getURI().getPath());
        if (scheduleId == null) {
            log.warn("WS 握手被拒：无法从路径解析 scheduleId, uri={}", request.getURI().getPath());
            return false;
        }

        String userId = jwtUtil.getUserIdFromToken(token);
        String role = jwtUtil.getRoleFromToken(token);
        try {
            accessGuard.assertAccess(scheduleId, userId, role);
        } catch (Exception e) {
            log.warn("WS 握手被拒：无权进入该课堂 scheduleId={}, userId={}, role={}, reason={}",
                    scheduleId, userId, role, e.getMessage());
            return false;
        }

        attributes.put(ATTR_SCHEDULE_ID, scheduleId);
        attributes.put(ATTR_USER_ID, userId);
        attributes.put(ATTR_ROLE, role);
        log.debug("WS 握手通过: scheduleId={}, userId={}, role={}, channel={}",
                scheduleId, userId, role, request.getURI().getPath());
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.warn("WS 握手异常: {}", exception.getMessage());
        }
    }

    /**
     * token 取值顺序：query {@code access_token}（浏览器 WebSocket 无法自定义头，只能走 query）
     * → {@code Authorization: Bearer}（服务端客户端/测试工具用）。
     */
    private String resolveToken(ServerHttpRequest request) {
        if (request instanceof ServletServerHttpRequest servlet) {
            String q = servlet.getServletRequest().getParameter("access_token");
            if (q != null && !q.isBlank()) return q.trim();
        }
        String auth = request.getHeaders().getFirst("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) return auth.substring(7).trim();
        return null;
    }

    /**
     * 从 {@code /ws/classrooms/{scheduleId}/{channel}} 取 scheduleId。
     * 注意下标是 3 不是 4——修复前 {@code HeartbeatHandler} 取 parts[4]，
     * 取到的是通道名 {@code heartbeat}，导致在线状态全写进同一个假 key。
     */
    private String parseScheduleId(String path) {
        if (path == null) return null;
        String[] parts = path.split("/");
        // ["", "ws", "classrooms", "{sid}", "{channel}"]
        if (parts.length >= 4 && "classrooms".equals(parts[2])) {
            String sid = parts[3];
            return sid.isBlank() ? null : sid;
        }
        return null;
    }
}
