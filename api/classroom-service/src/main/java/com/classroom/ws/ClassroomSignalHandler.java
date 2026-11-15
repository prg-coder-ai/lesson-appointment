package com.classroom.ws;

import com.classroom.service.ClassroomPublishGuard;
import com.classroom.service.ClassroomSignalService;
import com.classroom.web.TraceContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

/**
 * 课堂信令广播处理器（F4-11~14, F3-05）。
 *
 * <p><b>房间隔离</b>：只在 {@code scheduleId} 房间内转发/广播，一个课堂的「下课」通知不会关掉别的课堂。
 *
 * <p><b>P1 改造（服务端信令强控）</b>：修复前这里是无差别「透明转发」——所有业务语义都在前端，
 * 导致点名/举手批准/全员禁言/摄像头状态/聊天禁言都无法形成服务端权威闭环。
 * 现改为：收到消息先解析 {@code type}，已知的业务类型（hand / hand:approve / mute-all / cam-state /
 * chat / wb:grant / wb:snapshot）交由 {@link ClassroomSignalService} 做「状态变更 + 权威广播 + 事件落库」；
 * 未知类型仍按原语义在房间内转发（向后兼容）。session 注册交给 {@link WsRoomRegistry} 统一收口，
 * 使 REST/调度器也能向房间发起广播。</p>
 */
@Slf4j
@Component
public class ClassroomSignalHandler extends TextWebSocketHandler {

    private final WsRoomRegistry registry;
    private final ClassroomSignalService signalService;
    private final ClassroomPublishGuard publishGuard;
    private final ObjectMapper objectMapper;

    public ClassroomSignalHandler(WsRoomRegistry registry, ClassroomSignalService signalService,
                                  ClassroomPublishGuard publishGuard, ObjectMapper objectMapper) {
        this.registry = registry;
        this.signalService = signalService;
        this.publishGuard = publishGuard;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) {
            closeQuietly(session);
            return;
        }
        registry.registerSignal(scheduleId, session);
        // 进房即推送当前服务端权威态（禁言/摄像头/举手/白板授权），迟到/刷新者不再丢失
        String userId = attr(session, WsHandshakeAuthInterceptor.ATTR_USER_ID);
        signalService.pushInitialState(scheduleId, userId);
        log.info("信令连接建立: scheduleId={}, sessionId={}, 房间人数={}",
                scheduleId, session.getId(), registry.signalRoomSize(scheduleId));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String scheduleId = roomOf(session);
        if (scheduleId == null) return;
        String userId = attr(session, WsHandshakeAuthInterceptor.ATTR_USER_ID);
        String role = attr(session, WsHandshakeAuthInterceptor.ATTR_ROLE);
        String payload = message.getPayload();

        // 整条消息处理（含 service 内部的广播与落库日志）都挂同一条 traceId：
        // WS 线程没有过滤器链，不主动绑就会与其他课堂的消息混在日志里无从区分
        TraceContext.runWith(traceIdOf(session), () -> {
            // 课堂发布门禁（服务端权威）：非「进行中」时学生不得发布；PAUSED 时师生都不得发布。
            // 必须在已知类型路由与透明转发之前拦，否则聊天 / RTC offer / 举手等会漏出去。
            // 控制类消息（开课/暂停/恢复/下课等）由 guard 例外放行，教师暂停后才能恢复课堂。
            String type = typeOf(payload);
            if (!publishGuard.allows(scheduleId, role, type)) {
                sendRejected(session, scheduleId);
                return;
            }
            // 已知业务类型 → 服务端路由（状态变更 + 权威广播 + 事件落库）
            if (signalService.isKnownType(payload)) {
                signalService.handleIncoming(scheduleId, userId, role, payload, session.getId());
                return;
            }
            // 未知类型 → 房间内透明转发（向后兼容）
            registry.broadcastSignalExcept(scheduleId, payload, session.getId());
        });
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String scheduleId = roomOf(session);
        if (scheduleId != null) {
            registry.unregisterSignal(scheduleId, session);
        }
        log.info("信令连接关闭: scheduleId={}, sessionId={}, status={}", scheduleId, session.getId(), status);
    }

    private String roomOf(WebSocketSession session) {
        Object v = session.getAttributes().get(WsHandshakeAuthInterceptor.ATTR_SCHEDULE_ID);
        return v == null ? null : v.toString();
    }

    private String attr(WebSocketSession session, String key) {
        Object v = session.getAttributes().get(key);
        return v == null ? null : v.toString();
    }

    /** 取消息 type；非 JSON / 缺失按普通内容消息处理（不做控制类例外） */
    private String typeOf(String payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            return node.path("type").asText("");
        } catch (Exception e) {
            return "";
        }
    }

    /** 门禁拒绝回执：只发给发送者，不向房间广播任何内容 */
    private void sendRejected(WebSocketSession session, String scheduleId) {
        String status = publishGuard.statusOf(scheduleId);
        String json = "{\"type\":\"publish:rejected\",\"reason\":\"CLASS_NOT_PUBLISHABLE\","
                + "\"status\":\"" + (status == null ? "" : status) + "\"}";
        try {
            session.sendMessage(new TextMessage(json));
        } catch (Exception e) {
            log.debug("发布门禁回执发送失败: {}", e.getMessage());
        }
    }

    /** 握手时确定的链路 id；缺失时返回 null（runWith 会保持当前 MDC 原样） */
    private String traceIdOf(WebSocketSession session) {
        return attr(session, WsHandshakeAuthInterceptor.ATTR_TRACE_ID);
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NOT_ACCEPTABLE);
        } catch (Exception e) {
            log.debug("关闭无房间归属的 WS 连接失败: {}", e.getMessage());
        }
    }
}
