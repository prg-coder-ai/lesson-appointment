package com.classroom.security;

import com.classroom.service.TenantEclassroomService;
import com.classroom.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 鉴权拦截器：从 Authorization: Bearer <token> 解析用户，写入 AuthContext。
 * token 来自主系统(共享 jwt.secret)。非法/缺失 -> 401。
 *
 * <p><b>课堂开关守卫（阶段3）</b>：JWT 校验通过后，额外校验租户是否已启用课堂。
 * 未启用课堂的租户访问 classroom-service 任何业务接口 → 403。
 * 平台管理员（tenantId=0）和系统调用（role=system）豁免此校验。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthInterceptor.class);

    private final JwtUtil jwtUtil;
    private final TenantEclassroomService tenantEclassroomService;

    public AuthInterceptor(JwtUtil jwtUtil, TenantEclassroomService tenantEclassroomService) {
        this.jwtUtil = jwtUtil;
        this.tenantEclassroomService = tenantEclassroomService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String auth = request.getHeader("Authorization");
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
        AuthContext.Auth a = new AuthContext.Auth();
        a.setToken(token);
        a.setUserId(jwtUtil.getUserIdFromToken(token));
        a.setRole(jwtUtil.getRoleFromToken(token));
        Long tenantId = jwtUtil.getTenantId(token);
        a.setTenantId(tenantId == null ? -1L : tenantId);
        AuthContext.set(a);

        // 课堂开关守卫：校验租户是否已启用课堂
        // 平台管理员（tenantId=0）和系统调用（role=system）豁免
        if (shouldCheckClassroomEnabled(a)) {
            if (!tenantEclassroomService.hasClassroomEnabled(tenantId)) {
                log.warn("课堂未启用, 拒绝访问: tenantId={}, userId={}, path={}",
                        tenantId, a.getUserId(), request.getRequestURI());
                write403(response, "课堂未启用");
                return false;
            }
        }

        return true;
    }

    /**
     * 判断是否需要校验课堂开关。
     * 平台管理员（tenantId=0/-1）和系统调用（role=system）豁免。
     */
    private boolean shouldCheckClassroomEnabled(AuthContext.Auth a) {
        Long tenantId = a.getTenantId();
        if (tenantId == null || tenantId == 0L || tenantId == -1L) {
            return false;
        }
        String role = a.getRole();
        if ("system".equals(role)) {
            return false;
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AuthContext.clear();
    }

    private void write401(HttpServletResponse response, String msg) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":401,\"message\":\"" + msg + "\"}");
    }

    private void write403(HttpServletResponse response, String msg) throws Exception {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":403,\"message\":\"" + msg + "\"}");
    }
}