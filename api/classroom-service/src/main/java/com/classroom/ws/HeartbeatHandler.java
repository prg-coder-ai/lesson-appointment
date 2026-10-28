package com.classroom.ws;

import lombok.extern.slf4j.Slf4j;
import com.classroom.service.AttendanceService;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 心跳/在线状态处理器（F3-02~04）。
 *
 * <p><b>修的两个 bug</b>：
 * <ol>
 *   <li>scheduleId 解析错位：修复前取 {@code parts[4]}，对
 *       {@code /ws/classrooms/{sid}/heartbeat} 来说第 4 段是通道名 {@code heartbeat}，
 *       于是所有课堂的心跳都写进同一个 {@code online:heartbeat:{userId}} key，
 *       在线状态彻底失真。现统一从握手拦截器写入的 session 属性取。</li>
 *   <li>userId 从报文里用字符串截取（{@code indexOf("\"userId\"")}）解析：
 *       报文字段顺序一变就取错，且不校验「报文里的 userId 是不是本人」——
 *       任何人可以替别人刷心跳把离线的人刷成在线。现优先用已鉴权的
 *       {@link WsHandshakeAuthInterceptor#ATTR_USER_ID}，报文里的 userId 仅作兜底。</li>
 * </ol>
 */
@Slf4j
@Component
public class HeartbeatHandler extends TextWebSocketHandler {

    private final OnlineStateManager onlineStateManager;
    private final AttendanceService attendanceService;
    /** sessionId -> userId（关闭时用于置离线） */
    private final Map<String, String> sessionUsers = new ConcurrentHashMap<>();

    public HeartbeatHandler(OnlineStateManager onlineStateManager, AttendanceService attendanceService) {
        this.onlineStateManager = onlineStateManager;
        this.attendanceService = attendanceService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String userId = attr(session, WsHandshakeAuthInterceptor.ATTR_USER_ID);
        String scheduleId = attr(session, WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        if (userId == null || scheduleId == null) {
            log.warn("心跳连接缺少身份/房间，强制关闭: sessionId={}", session.getId());
            try {
                session.close(CloseStatus.NOT_ACCEPTABLE);
            } catch (Exception ignore) {
                // ignore
            }
            return;
        }
        sessionUsers.put(session.getId(), userId);
        onlineStateManager.refresh(scheduleId, userId);
        log.debug("心跳连接建立: scheduleId={}, userId={}", scheduleId, userId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String scheduleId = attr(session, WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        String userId = attr(session, WsHandshakeAuthInterceptor.ATTR_USER_ID);
        if (scheduleId == null || userId == null) return;
        // 报文内容不参与身份判定：身份以握手鉴权结果为准，避免「替他人刷心跳」
        onlineStateManager.refresh(scheduleId, userId);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = sessionUsers.remove(session.getId());
        String scheduleId = attr(session, WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        if (userId != null && scheduleId != null) {
            onlineStateManager.setOffline(scheduleId, userId);
            // 闭合在线区间：只有断开才有时长可算。60 秒内重连由有效时长的抖动合并吃掉，
            // 不会把一次切网算成离线；真的走了则这段间隙不计入课时。
            try {
                attendanceService.onDisconnect(scheduleId, userId);
            } catch (Exception e) {
                // 断连清理失败不能影响连接关闭流程（否则 session 泄漏）
                log.warn("掉线区间闭合失败: scheduleId={}, userId={}, err={}", scheduleId, userId, e.getMessage());
            }
        }
        log.info("心跳连接关闭: scheduleId={}, userId={}, status={}", scheduleId, userId, status);
    }

    private String attr(WebSocketSession session, String key) {
        Object v = session.getAttributes().get(key);
        return v == null ? null : v.toString();
    }
}
