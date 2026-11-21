package com.classroom.config;

import com.classroom.ws.ClassroomSignalHandler;
import com.classroom.ws.HeartbeatHandler;
import com.classroom.ws.WhiteboardHandler;
import com.classroom.ws.WsHandshakeAuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 端点注册：
 * - /ws/classrooms/{scheduleId}/whiteboard  白板协作信令（F4-07~10）
 * - /ws/classrooms/{scheduleId}/heartbeat   心跳/在线状态（F3-02~04）
 * - /ws/classrooms/{scheduleId}/signal      课堂信令广播（F4-11~14, F3-05）
 *
 * <p>三条通道都必须挂 {@link WsHandshakeAuthInterceptor}：它校验 access_token、
 * 解析 scheduleId 写入 session 属性、并断言「这堂课归你」。
 * 没有它，三条通道对匿名用户完全敞开（修复前的状态）。
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final WhiteboardHandler whiteboardHandler;
    private final HeartbeatHandler heartbeatHandler;
    private final ClassroomSignalHandler signalHandler;
    private final WsHandshakeAuthInterceptor authInterceptor;

    public WebSocketConfig(WhiteboardHandler whiteboardHandler,
                           HeartbeatHandler heartbeatHandler,
                           ClassroomSignalHandler signalHandler,
                           WsHandshakeAuthInterceptor authInterceptor) {
        this.whiteboardHandler = whiteboardHandler;
        this.heartbeatHandler = heartbeatHandler;
        this.signalHandler = signalHandler;
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // allowedOriginPatterns 保持 "*"：前端可能从任意域名/端口同源进来（云托管、IP 直连、本地 8080），
        // 真正的准入控制由握手拦截器的 JWT + 课堂归属校验负责，不依赖 Origin。
        registry.addHandler(whiteboardHandler, "/ws/classrooms/{scheduleId}/whiteboard")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
        registry.addHandler(heartbeatHandler, "/ws/classrooms/{scheduleId}/heartbeat")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
        registry.addHandler(signalHandler, "/ws/classrooms/{scheduleId}/signal")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
    }
}
