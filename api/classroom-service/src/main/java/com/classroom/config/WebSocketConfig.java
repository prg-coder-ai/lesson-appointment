package com.classroom.config;

import com.classroom.ws.WhiteboardHandler;
import com.classroom.ws.HeartbeatHandler;
import com.classroom.ws.ClassroomSignalHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 端点注册：
 * - /ws/classrooms/{scheduleId}/whiteboard  白板协作信令（F4-07~10）
 * - /ws/classrooms/{scheduleId}/heartbeat   心跳/在线状态（F3-02~04）
 * - /ws/classrooms/{scheduleId}/signal      课堂信令广播（F4-11~14, F3-05）
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final WhiteboardHandler whiteboardHandler;
    private final HeartbeatHandler heartbeatHandler;
    private final ClassroomSignalHandler signalHandler;

    public WebSocketConfig(WhiteboardHandler whiteboardHandler,
                           HeartbeatHandler heartbeatHandler,
                           ClassroomSignalHandler signalHandler) {
        this.whiteboardHandler = whiteboardHandler;
        this.heartbeatHandler = heartbeatHandler;
        this.signalHandler = signalHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(whiteboardHandler, "/ws/classrooms/{scheduleId}/whiteboard")
                .setAllowedOriginPatterns("*");
        registry.addHandler(heartbeatHandler, "/ws/classrooms/{scheduleId}/heartbeat")
                .setAllowedOriginPatterns("*");
        registry.addHandler(signalHandler, "/ws/classrooms/{scheduleId}/signal")
                .setAllowedOriginPatterns("*");
    }
}