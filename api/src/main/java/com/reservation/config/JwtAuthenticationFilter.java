package com.reservation.config;

import com.reservation.utils.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;

/**
 * JWT 认证过滤器：从 Authorization 头解析 Bearer Token，
 * 校验通过后将用户身份信息写入 SecurityContext，供 Spring Security 和业务层使用。
 *
 * 跳过规则（shouldNotFilter）：
 *   - 所有 OPTIONS 预检请求
 *   - 登录/刷新/注册/静态资源/页面等 permitAll 路径
 *   - Token 缺失或非法时不做拦截，交给后续的 AuthenticationEntryPoint 返回 401
 */
@Slf4j
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    /** 无需认证即可匿名访问的路径（与 SecurityConfig 白名单保持一致） */
    private static final Set<String> WHITELIST_PATHS = Set.of(
            "/", "/index", "/index.html",
            "/admin.html", "/platform_admin.html", "/student.html", "/teacher.html",
            "/teacherInfo.html", "/teacherPublishedProfile.html",
            "/logBrowser.html",
            "/auditLog.html",
            "/booking",
            "/booking.html",
             "/login", "/auth/login", "/api/v1/auth/login", "/auth/refreshToken", "/api/v1/auth/refreshToken",
            "/user/teacher/register", "/api/v1/user/teacher/register",
            "/user/student/register", "/api/v1/user/student/register",
             "/user/admin/register", "/api/v1/user/admin/register",
            "/user/account/exist", "/api/v1/user/account/exist",
            "/api/v1/auth/wechat-login", "/auth/wechat-login",
            "/term/map", "/api/v1/term/map",
            "/teacher/published/latest-public", "/api/v1/teacher/published/latest-public",
            "/teacher/published/public-get", "/api/v1/teacher/published/public-get",
            "/teacher/published/public-list", "/api/v1/teacher/published/public-list",
            "/schedule/getAvailableSchedule", "/api/v1/schedule/getAvailableSchedule",
            "/interfaces", "/api/v1/interfaces",
            "/tenant/name", "/api/v1/tenant/name",
            // 服务运行信息（与缺省页同源，匿名可访问）
            "/system/info", "/api/v1/system/info", "/apiInfo", "/api/v1/apiInfo",
            // Actuator 探针（2026-09新增，与 SecurityConfig 的 permitAll 同步）
            // ⚠️ 这里必须与 SecurityConfig 同时改：只改一处 → 探针 401。
            // 用 /actuator/health 前缀式匹配而非 Set.contains 精确匹配，
            // 因为 liveness/readiness 的实际路径是
            //   /actuator/health/liveness、/actuator/health/readiness
            // （content negotiation 不同会出现 /actuator/health/readiness/ 之类变体）。
            // ⚠️ 不能写成 "/actuator" 前缀 —— 那会连带放行 env/beans/loggers。
            "/actuator/health"
    );

    /** 免认证的 Actuator 前缀（需与 WHITELIST_PATHS 分开：这里走 startsWith） */
    private static final java.util.List<String> WHITELIST_PREFIXES = java.util.List.of(
            "/actuator/health"
    );

    /** 静态资源前缀 */
    private static final Set<String> STATIC_PREFIXES = Set.of(
            "/js/", "/css/", "/images/", "/favicon.ico"
    );

    public JwtAuthenticationFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();

        // 1. 跳过所有 OPTIONS 预检请求
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // 2. 跳过白名单中的精确路径
        if (WHITELIST_PATHS.contains(uri)) {
            return true;
        }

        // 2b. 跳过白名单前缀（Actuator 的 liveness/readiness 子路径，
        //     形如 /actuator/health/liveness、/actuator/health/readiness）
        //⚠️ 必须校验分隔符：裸 startsWith 会把 /actuator/healthz、
        //     /actuator/health-foo 这类**不存在但将来可能存在**的路径一并放行。
        //     日后 Actuator 加自定义 health group 时会撞上这条。
        for (String prefix : WHITELIST_PREFIXES) {
            if (uri.equals(prefix) || uri.startsWith(prefix + "/")) {
                return true;
            }
        }

        // 3. 跳过静态资源
        for (String prefix : STATIC_PREFIXES) {
            if (uri.startsWith(prefix)) {
                return true;
            }
        }

        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        // 没有 Authorization 头 → 不设置 SecurityContext，交给后续处理
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        try {
            // 校验 AccessToken 有效性（签名 + 过期时间）
            if (!jwtUtil.verifyAccessToken(token)) {
                log.warn("[JwtAuthFilter] Token 校验失败，uri={}", request.getRequestURI());
                filterChain.doFilter(request, response);
                return;
            }

            // 解析 userId 和 role
            String userId = jwtUtil.getUserIdFromToken(token);
            String role = jwtUtil.getRoleFromToken(token);

            if (userId == null || role == null) {
                log.warn("[JwtAuthFilter] Token 解析结果为空，userId={}, role={}", userId, role);
                filterChain.doFilter(request, response);
                return;
            }

            // 构造认证对象：主体=userId，凭证=原始token，权限基于role
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userId,
                            token,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role))
                    );

            SecurityContextHolder.getContext().setAuthentication(authentication);
            log.debug("[JwtAuthFilter] 认证成功，userId={}, role={}, uri={}", userId, role, request.getRequestURI());

        } catch (Exception e) {
            // Token 过期 / 签名错误 / 格式非法 —— 清除 SecurityContext，交给 EntryPoint 返回 401
            log.warn("[JwtAuthFilter] Token 解析异常：{}，uri={}", e.getMessage(), request.getRequestURI());
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }
}