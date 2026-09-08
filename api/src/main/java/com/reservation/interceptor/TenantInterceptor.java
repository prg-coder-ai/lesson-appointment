package com.reservation.interceptor; //saas租户拦截器

import cn.hutool.core.util.StrUtil;
import com.reservation.entity.Tenant;
import com.reservation.service.TenantService;
import com.reservation.service.UserSessionService;
import com.reservation.utils.JwtUtil;
import com.reservation.utils.TenantContext;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class TenantInterceptor implements HandlerInterceptor {

    @Autowired
    private TenantService tenantService;
    @Autowired
    private JwtUtil jwtUtil;
    @Autowired
    private UserSessionService userSessionService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String token = request.getHeader("Authorization");
        if (StrUtil.isBlank(token)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"未登录，请先登录\"}");
            return false;
        }

        Long tenantId = jwtUtil.getTenantId(token);
        String userId = jwtUtil.getUserIdFromToken(token);
        if (tenantId == null || userId == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"登录状态无效，请重新登录\"}");
            return false;
        }

        // 平台管理员（tenantId=0）跳过租户状态校验
        if (0L != tenantId) {
            Tenant tenant = tenantService.getById(tenantId);
            boolean invalid = tenant == null
                    || (tenant.getDeleted() != null && tenant.getDeleted() == 1)
                    || !Integer.valueOf(1).equals(tenant.getStatus());
            if (invalid) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\":403,\"msg\":\"租户已停用或不存在，请联系平台管理员\"}");
                return false;
            }
        }

        TenantContext.setTenantId(tenantId);
        MDC.put("tenantId", String.valueOf(tenantId)); // 日志埋点
        // 会话续期（在线统计用，内部有节流，不会每次请求都写库）
        userSessionService.touch(token);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        TenantContext.clear();
        MDC.remove("tenantId");
    }
}