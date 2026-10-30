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
            // 自助注册：UserController 实际映射是 /user/register，见其 @PostMapping 注解。
            // 此处原本放着 /user/{admin|teacher|student}/register 三条**服务端并不存在**的路径，
            // 幽灵条目既挡不住任何真实请求，又会让本清单看起来"已覆盖注册"，
            // 与 SecurityConfig:164 / WebMvcConfig:40 / 守卫 PERMIT_ALL 的口径分叉。
            // 2026-10-24 按真实路径补正，四处至此一致。
            // ⚠️ 本注释刻意不出现 ASCII 右括号：tools/check-actuator-guard.mjs 用一条
            //    懒匹配正则从 Set.of 起点扫到**第一个**右括号，注释里只要出现一个，
            //    捕获就被截断在它之前，/actuator/health 的检查会恒红（已实测踩中一次）。
            "/user/register", "/api/v1/user/register",
            "/user/account/exist", "/api/v1/user/account/exist",
            "/api/v1/auth/wechat-login", "/auth/wechat-login",
            // 微信直接注册（场景 C）同样免认证：一期只加了 SecurityConfig 与守卫两处，
            // 漏了本过滤器 —— 带过期 token 调用时过滤器会解析失败并清空 SecurityContext，
            // 与白名单"三处同步"的约定不符。二期一并补齐（含推广公开端点）。
            "/api/v1/auth/wechat-register", "/auth/wechat-register",
            // 微信 PC 扫码登录/绑定（P2，三端点全免登录）：
            //   qr 的 bind 场景在控制器内校验 Bearer（userId 服务端从令牌解析）；
            //   qr/status 以一次性 state 为凭证；pc-callback 由微信 302 触发。
            // 与 SecurityConfig 白名单、WebMvcConfig EXCLUDE_PATTERNS、守卫 PERMIT_ALL 四处同步。
            "/api/v1/auth/wechat/qr", "/auth/wechat/qr",
            "/api/v1/auth/wechat/qr/status", "/auth/wechat/qr/status",
            "/api/v1/auth/wechat/pc-callback", "/auth/wechat/pc-callback",
            // 推广公开端点（免登录）：与 SecurityConfig 白名单、守卫 PERMIT_ALL 三处同步
            "/api/v1/promo/referral/validate", "/promo/referral/validate",
            "/api/v1/promo/register-tenant", "/promo/register-tenant",
            "/api/v1/promo/register-user", "/promo/register-user",
            "/api/v1/tenant/validate-code", "/tenant/validate-code",
            // 行业字典选项（推广落地页匿名读取，与 SecurityConfig 白名单同步）
            "/api/v1/industry/options", "/industry/options",
            "/term/map", "/api/v1/term/map",
            "/teacher/published/latest-public", "/api/v1/teacher/published/latest-public",
            "/teacher/published/public-get", "/api/v1/teacher/published/public-get",
            "/teacher/published/public-list", "/api/v1/teacher/published/public-list",
            "/schedule/getAvailableSchedule", "/api/v1/schedule/getAvailableSchedule",
            "/interfaces", "/api/v1/interfaces",
            "/tenant/name", "/api/v1/tenant/name",
            // 服务运行信息（与缺省页同源，匿名可访问）
            "/system/info", "/api/v1/system/info", "/apiInfo", "/api/v1/apiInfo",
            // 协议/隐私政策公开阅读端点（免登录，与 SecurityConfig 白名单/守卫 PERMIT_ALL 同步）
            "/api/v1/legal/doc",
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
            "/actuator/health",
            // 教师已上传图片公开伺服：GET /api/v1/teacher/professional/file/** 免登录访问，
            // 与 SecurityConfig permitAll / WebMvcConfig EXCLUDE_PATTERNS / 守卫 PERMIT_ALL 四处同步。
            "/api/v1/teacher/professional/file"
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