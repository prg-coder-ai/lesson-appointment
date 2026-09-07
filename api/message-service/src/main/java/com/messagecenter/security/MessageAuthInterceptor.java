package com.messagecenter.security;

import com.messagecenter.utils.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 消息中心鉴权拦截器：从 Authorization: Bearer <token> 解析用户，写入 MessageAuthContext。
 * token 来自主系统(共享 jwt.secret)。非法/缺失 -> 401。
 * 平台管理员 tenantId=0；普通角色按 token 内 tenantId 限定自身数据范围。
 */
@Component
public class MessageAuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;

    public MessageAuthInterceptor(JwtUtil jwtUtil) { this.jwtUtil = jwtUtil; }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String auth = request.getHeader("Authorization");
        // SSE 场景允许 token 放 query 参数 ?access_token=xxx
        if ((auth == null || !auth.startsWith("Bearer ")) && request.getParameter("access_token") != null) {
            auth = "Bearer " + request.getParameter("access_token");
        }
        if (auth == null || !auth.startsWith("Bearer ")) {
            write401(response, "未登录，请先登录");
            return false;
        }
        String token = auth.substring(7);
        if (!jwtUtil.verifyAccessToken(token)) {
            write401(response, "登录状态无效，请重新登录");
            return false;
        }
        MessageAuthContext.Auth a = new MessageAuthContext.Auth();
        a.setToken(token);
        a.setUserId(jwtUtil.getUserIdFromToken(token));
        a.setRole(jwtUtil.getRoleFromToken(token));
        Long tenantId = jwtUtil.getTenantId(token);
        a.setTenantId(tenantId == null ? -1L : tenantId);
        MessageAuthContext.set(a);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        MessageAuthContext.clear();
    }

    private void write401(HttpServletResponse response, String msg) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":401,\"message\":\"" + msg + "\"}");
    }
}
