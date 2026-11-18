package com.classroom.service;

import com.classroom.metrics.BizMetrics;
import com.classroom.ws.WsRoomRegistry;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 课堂信令子类型路由（服务端强控核心）。
 *
 * <p>课堂 WebSocket 的 {@code /signal} 通道原先是「无差别透明转发」，业务语义全在前端，导致
 * 点名/举手批准/全员禁言/摄像头状态/聊天禁言都落不了服务端权威闭环。本服务在
 * {@link com.classroom.ws.ClassroomSignalHandler} 收到消息时按 {@code type} 路由，统一做三件事：
 * <ol>
 *   <li>变更服务端权威态（{@link ClassroomLiveState}）；</li>
 *   <li>向房间广播「权威消息」——客户端只认权威消息，不再依赖各自本地的伪实现；</li>
 *   <li>把事件写入教学环节流水（{@link TeachingSessionService#appendEvent}，F4-18）。</li>
 * </ol>
 *
 * <p>已知类型：hand（举手）/ hand:approve（批准开麦）/ mute-all（全员禁言）/ cam-state（摄像头状态）/
 * chat（聊天，服务端强制禁言拦截）/ wb:grant（白板协作授权）。未知类型由 handler 兜底转发。</p>
 */
@Slf4j
@Service
public class ClassroomSignalService {

    private final WsRoomRegistry registry;
    /** 业务指标（按 type 分桶，用于看"哪类信令异常多"） */
    private final BizMetrics metrics;
    private final ClassroomLiveState liveState;
    private final TeachingSessionService teachingSession;
    private final ObjectMapper objectMapper;

    public ClassroomSignalService(WsRoomRegistry registry, ClassroomLiveState liveState,
                                 TeachingSessionService teachingSession, ObjectMapper objectMapper,
                                BizMetrics metrics) {
        this.registry = registry;
        this.liveState = liveState;
        this.teachingSession = teachingSession;
        this.objectMapper = objectMapper;
        this.metrics = metrics;
    }

    /** 判断该 payload 是否本服务已知业务类型（避免无差别转发已知类型造成双发） */
    public boolean isKnownType(String payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            if (!node.isObject()) return false;
            String type = node.path("type").asText(null);
            return type != null && KNOWN.contains(type);
        } catch (Exception e) {
            return false;
        }
    }

    private static final java.util.Set<String> KNOWN = java.util.Set.of(
            "hand", "hand:approve", "mute-all", "cam-state", "chat", "wb:grant");

    public void handleIncoming(String scheduleId, String userId, String role, String payload, String sessionId) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            String type = node.path("type").asText(null);
            if (type == null) return;
            metrics.signal(type);
            switch (type) {
                case "hand" -> handleHand(scheduleId, userId, node);
                case "hand:approve" -> handleHandApprove(scheduleId, role, node);
                case "mute-all" -> handleMuteAll(scheduleId, role, node);
                case "cam-state" -> handleCamState(scheduleId, userId, node);
                case "chat" -> handleChat(scheduleId, userId, role, node);
                case "wb:grant" -> handleWbGrant(scheduleId, role, node);
                default -> registry.broadcastSignalExcept(scheduleId, payload, sessionId);
            }
        } catch (Exception e) {
            log.warn("信令路由处理异常: scheduleId={}, type=?, err={}", scheduleId, e.getMessage());
        }
    }

    // ------------------------------------------------------------------
    // 各类型处理
    // ------------------------------------------------------------------

    private void handleHand(String scheduleId, String userId, JsonNode node) {
        boolean raised = node.path("raised").asBoolean(false);
        String name = node.path("displayName").asText(userId);
        boolean wasGranted = liveState.isMicGranted(scheduleId, userId);
        liveState.setHand(scheduleId, userId, raised);
        String msg = json("hand:state", scheduleId, userId, name, "raised", raised);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "hand", Map.of("userId", userId, "raised", raised));
        // 放下手 = 撤销开麦批准：服务端权威态 + 广播，确保所有端图标一致
        if (!raised && wasGranted) {
            liveState.revokeMic(scheduleId, userId);
            registry.broadcastSignal(scheduleId, grantMsg(userId, false, "hand_down"));
            teachingSession.appendEvent(scheduleId, "mic_revoke", Map.of("userId", userId, "reason", "hand_down"));
        }
    }

    /**
     * 批准 / 撤回开麦（教师端「批准开麦」与「已批准」是同一个按钮的两种动作）。
     *
     * <p>{@code granted=false} 是「教师撤回」：撤销发言权**并**取消该生的举手，
     * 让他回到完全未举手的默认态（教师端该行按钮整体消失，需重新举手再批准）。</p>
     */
    private void handleHandApprove(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        String target = node.path("userId").asText(null);
        if (target == null) return;
        boolean granted = node.path("granted").asBoolean(true);

        if (granted) {
            // 只批准仍在举手的学生——学生已放下手后迟到的批准一律忽略，避免"幽灵授权"
            if (!Boolean.TRUE.equals(liveState.hands(scheduleId).get(target))) return;
            if (liveState.isMicGranted(scheduleId, target)) return;   // 幂等：重复点击不重复广播
            liveState.grantMic(scheduleId, target);
            registry.broadcastSignal(scheduleId, grantMsg(target, true, "teacher_approve"));
            teachingSession.appendEvent(scheduleId, "hand_approve", Map.of("userId", target));
            return;
        }

        // 撤回：先撤授权再清举手，两条广播都要发（只发一条会让某一端图标停在错状态）
        liveState.revokeMic(scheduleId, target);
        liveState.setHand(scheduleId, target, false);
        registry.broadcastSignal(scheduleId, grantMsg(target, false, "teacher_revoke"));
        registry.broadcastSignal(scheduleId, json("hand:state", scheduleId, target, null, "raised", false));
        teachingSession.appendEvent(scheduleId, "hand_revoke", Map.of("userId", target, "by", "teacher"));
    }

    private void handleMuteAll(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        boolean muted = node.path("muted").asBoolean(true);
        liveState.setMuted(scheduleId, muted);
        String msg = json("mute:state", scheduleId, null, null, "muted", muted);
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "mute_all", Map.of("muted", muted));
        // 全员静音 = 收回所有发言权（举手保留 → 学生回「等待批准」，解除静音后需重新批准）。
        // 只清内存不广播的话，各端会停在「发言中」红色态却一句话也发不出去。
        if (muted) {
            liveState.revokeAllMicGrants(scheduleId).forEach(u -> {
                registry.broadcastSignal(scheduleId, grantMsg(u, false, "mute_all"));
                teachingSession.appendEvent(scheduleId, "mic_revoke", Map.of("userId", u, "reason", "mute_all"));
            });
        }
    }

    private void handleCamState(String scheduleId, String userId, JsonNode node) {
        boolean on = node.path("on").asBoolean(true);
        // silent：进房默认关闭摄像头/批量同步时只更新标记，不弹「XX 摄像头已关闭」
        boolean silent = node.path("silent").asBoolean(false);
        liveState.setCamera(scheduleId, userId, !on);
        String msg = "{\"type\":\"cam:state\",\"userId\":" + q(userId) + ",\"on\":" + on
                + (silent ? ",\"silent\":true" : "") + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "camera", Map.of("userId", userId, "on", on));
    }

    private void handleChat(String scheduleId, String userId, String role, JsonNode node) {
        // 服务端强制禁言：被全员禁言且非教师/管理员，直接拦截并回拒
        if (liveState.isMuted(scheduleId) && !isTeacherOrManager(role)) {
            String rejected = "{\"type\":\"chat:rejected\",\"reason\":\"muted\"}";
            registry.sendSignalToUser(scheduleId, userId, rejected);
            teachingSession.appendEvent(scheduleId, "chat_blocked", Map.of("userId", userId));
            return;
        }
        String text = node.path("text").asText("");
        if (text.isBlank()) return;
        String name = node.path("displayName").asText(userId);
        long ts = System.currentTimeMillis();
        String msg = "{\"type\":\"chat:msg\",\"userId\":" + q(userId)
                + ",\"displayName\":" + q(name) + ",\"text\":" + q(text) + ",\"ts\":" + ts + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "chat", Map.of("userId", userId));
    }

    private void handleWbGrant(String scheduleId, String role, JsonNode node) {
        if (!isTeacherOrManager(role)) return;
        String target = node.path("userId").asText(null);
        boolean grant = node.path("grant").asBoolean(true);
        if (target == null) return;
        if (grant) liveState.grantWhiteboard(scheduleId, target);
        else liveState.revokeWhiteboard(scheduleId, target);
        String msg = "{\"type\":\"wb:grant:state\",\"userId\":" + q(target) + ",\"grant\":" + grant + "}";
        registry.broadcastSignal(scheduleId, msg);
        teachingSession.appendEvent(scheduleId, "wb_grant", Map.of("userId", target, "grant", grant));
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------

    private boolean isTeacherOrManager(String role) {
        return "teacher".equals(role) || "manager".equals(role) || "admin".equals(role);
    }

    private String json(String type, String scheduleId, String userId, String name, String flag, boolean value) {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"type\":").append(q(type));
        if (userId != null) sb.append(",\"userId\":").append(q(userId));
        if (name != null) sb.append(",\"displayName\":").append(q(name));
        if (flag != null) sb.append(",\"").append(flag).append("\":").append(value);
        sb.append("}");
        return sb.toString();
    }

    private String q(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /**
     * 开麦授权/撤销的权威消息。
     * {@code reason} 让客户端能给对文案（教师撤回 / 全员静音 / 自己放下手），不必靠猜。
     */
    private String grantMsg(String userId, boolean granted, String reason) {
        StringBuilder sb = new StringBuilder("{");
        sb.append("\"type\":\"mic:grant\",\"userId\":").append(q(userId));
        sb.append(",\"granted\":").append(granted);
        if (reason != null) sb.append(",\"reason\":").append(q(reason));
        sb.append("}");
        return sb.toString();
    }

    /**
     * 新成员进房时，把当前服务端权威态推给它——消除「迟到/刷新者收不到禁言/摄像头/举手/授权」的 bug。
     */
    public void pushInitialState(String scheduleId, String userId) {
        liveState.ensureMuteLoaded(scheduleId);
        boolean muted = liveState.isMuted(scheduleId);
        registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"mute:state\",\"muted\":" + muted + "}");
        liveState.cameras(scheduleId).forEach((u, off) ->
                registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"cam:state\",\"userId\":" + q(u) + ",\"on\":" + !off + "}"));
        liveState.hands(scheduleId).forEach((u, raised) ->
                registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"hand:state\",\"userId\":" + q(u) + ",\"raised\":" + raised + "}"));
        // 重连/刷新恢复「已批准开麦」：静默下发，避免刷新后弹 toast。
        // 带 hand 校验：授权必须蕴含举手（不变式），孤儿授权顺手清掉，否则刷新后会出现
        // 「学生没举手却显示发言中、麦克风还开着」的鬼状态。
        Map<String, Boolean> hands = liveState.hands(scheduleId);
        liveState.micGrants(scheduleId).forEach((u, granted) -> {
            if (!hands.containsKey(u)) {
                liveState.revokeMic(scheduleId, u);
                return;
            }
            registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"mic:grant\",\"userId\":" + q(u)
                    + ",\"granted\":true,\"silent\":true}");
        });
        boolean granted = liveState.isWhiteboardGranted(scheduleId, userId);
        if (granted) {
            registry.sendSignalToUser(scheduleId, userId, "{\"type\":\"wb:grant:state\",\"userId\":" + q(userId) + ",\"grant\":true}");
        }
    }

    /** 小工具：构造事件 data（避免重复 import Map 写法） */
    private static java.util.Map<String, Object> Map(Object... kv) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
