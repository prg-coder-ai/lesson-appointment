package com.reservation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.objectMapper = objectMapper;
    }

    /**
     * 免认证路径（permitAll）。与 {@link com.reservation.config.JwtAuthenticationFilter} 的
     * WHITELIST_PATHS 保持一致 —— 两处分处两地是本批之前的既有隐患：
     * 这里放行、过滤器却解析 token 失败会清空 SecurityContext，反之过滤器跳过、
     * 这里不放行则会 401。改一处必须同步另一处。
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // ===== CORS 集成到 Spring Security 链 =====
                .cors(Customizer.withDefaults())

                // ===== 禁用 CSRF（前后端分离 + JWT 无需 CSRF）=====
                .csrf(AbstractHttpConfigurer::disable)

                // ===== 无状态 Session =====
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )

                // ===== 授权规则 =====
                // 用**块体** lambda（`auth -> { ... }`）而非表达式体：需要在链中间插入
                // applyDeclarativeAuthz(auth) 这个独立语句。表达式体（`auth -> auth.x().y()`）
                // 一旦被分号截断就语法断裂，且报错位置指向更早的无关行（曾误判为括号不配平）。
                .authorizeHttpRequests(auth -> {
                    // 所有 OPTIONS 预检请求放行
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

                    // 页面与首页
                    auth.requestMatchers(
                            "/",
                            "/index",
                            "/index.html",
                            "/admin.html",
                            "/platform_admin.html",
                            "/student.html",
                            "/teacher.html",
                            "/teacherInfo.html",
                            "/teacherPublishedProfile.html",
                            "/logBrowser.html",
                            "/auditLog.html"
                    ).permitAll();

                    // 教师发布信息公开接口（teacherPublishedProfile.html 调用，无需登录）
                    // L1 迁移后接口统一在 /api/v1 下，白名单须同时放裸路径与 /api/v1 前缀
                    auth.requestMatchers(
                            "/booking",
                            "/booking.html",
                            "/api/v1/booking",
                            "/teacher/published/latest-public",
                            "/api/v1/teacher/published/latest-public",
                            "/teacher/published/public-get",
                            "/api/v1/teacher/published/public-get",
                            "/teacher/published/public-list",
                            "/api/v1/teacher/published/public-list",
                            "/schedule/getAvailableSchedule",
                            "/api/v1/schedule/getAvailableSchedule"
                    ).permitAll();

                    // 登录/鉴权相关
                    auth.requestMatchers(
                            "/login",
                            "/auth/login",
                            "/api/v1/auth/login",
                            "/auth/refreshToken",
                            "/api/v1/auth/refreshToken",
                            "/auth/logout",
                            "/api/v1/auth/logout"
                    ).permitAll();

                    // 微信静默登录（免登录，不带 token）+ 术语词表（登录页渲染用，公开）
                    // L1 迁移后接口统一在 /api/v1 下，白名单须同时放裸路径与 /api/v1 前缀
                    auth.requestMatchers(
                            "/api/v1/auth/wechat-login",
                            "/auth/wechat-login",
                            "/term/map",
                            "/api/v1/term/map"
                    ).permitAll();

                    // 注册相关（匿名用户必须能访问）
                    // 注意：/user/register 才是 UserController 实际映射（@PostMapping("/register")），
                    // 此前只放了不存在的 /user/admin/register，导致自助注册被 401 拦截；
                    // 此处与 WebMvcConfig/JwtFilter 的白名单保持一致
                    auth.requestMatchers(
                            "/user/register",
                            "/api/v1/user/register",
                            "/user/account/exist",
                            "/api/v1/user/account/exist"
                    ).permitAll();

                    // 其他公共接口
                    auth.requestMatchers("/interfaces", "/api/v1/interfaces", "/tenant/name", "/api/v1/tenant/name").permitAll();

                    // 服务运行信息（缺省页同款字段，健康检查/环境自检用，匿名可访问）
                    auth.requestMatchers("/system/info", "/api/v1/system/info", "/apiInfo", "/api/v1/apiInfo").permitAll();

                    // ===== Actuator 探针（2026-10-09 接入，匿名可访问）=====
                    // ⚠️ 两处必须同步改，漏一处症状不同但都探针不通：
                    //   · 这里 permitAll 但 JwtAuthenticationFilter 没跳→过滤器清空 SecurityContext → 401
                    //   · 这里没放行但过滤器跳了            → 落到兜底 anyRequest().authenticated() → 401
                    // 已同步加入 JwtAuthenticationFilter.WHITELIST_PATHS，改一处必须改另一处。
                    //
                    // 只放行 health（liveness/readiness）。**不放行 /actuator/info**：
                    // 它含构建时间与版本，虽不敏感但对匿名无价值，多暴露一个端点多一份风险。
                    // 也不放行 /actuator/** 通配 —— 那等于把 env/beans/loggers 一并放开。
                    auth.requestMatchers(
                            "/actuator/health",
                            "/actuator/health/**"
                    ).permitAll();

                    // 静态资源
                    auth.requestMatchers(
                            "/js/**", "/css/**", "/images/**", "/favicon.ico"
                    ).permitAll();

                    // ===== 声明式授权（第 2 批：根治根因 A）=====
                    // 此前本文件到 anyRequest() 之间是空白：任何已登录用户都能调用任何接口，
                    // 具体权限靠每个 Controller 方法体手写 permissionCheck.checkXxx(token)。
                    // 这里把 AuthzRules.RULES 的每条声明展开为 hasRole/hasAnyRole。
                    applyDeclarativeAuthz(auth);

                    // 兜底：已认证。
                    // 下一步（本批规则经回归确认后）改为 denyAll()，
                    // 届时"漏声明 = 403"的安全收益才真正生效。
                    // 当前仍用 authenticated() 是刻意的分两步策略，理由见 AuthzRules 类注释。
                    auth.anyRequest().authenticated();
                })

                // ===== 异常处理 =====
                .exceptionHandling(eh -> eh
                        // 未认证 → HTTP 401
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding("UTF-8");
                            Map<String, Object> body = new HashMap<>();
                            body.put("code", 401);
                            body.put("message", "未登录或登录已过期");
                            body.put("data", null);
                            response.getWriter().write(objectMapper.writeValueAsString(body));
                        })
                        // 权限不足 → HTTP 403
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding("UTF-8");
                            Map<String, Object> body = new HashMap<>();
                            body.put("code", 403);
                            body.put("message", "无权限访问该资源");
                            body.put("data", null);
                            response.getWriter().write(objectMapper.writeValueAsString(body));
                        })
                )

                // ===== 注入 JWT 过滤器 =====
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * 把 {@link AuthzRules#RULES} 的声明逐条展开为 Spring Security 的授权规则。
     *
     * <p>角色到 Authority 的对应关系：{@code JwtAuthenticationFilter} 写入的是
     * {@code "ROLE_" + role}（见该类第 130 行），因此这里用 {@code hasRole}/{@code hasAnyRole}，
     * Spring 会自动补 {@code ROLE_} 前缀 —— 传 {@code hasRole("admin")} 即匹配
     * {@code ROLE_admin}。若这里改用 {@code hasAuthority}，必须写全前缀，否则全部不匹配。
     *
     * <p>顺序：{@code AuthzRules.RULES} 已按"具体路径在前、通配在后"排好，
     * Spring Security 采用首个命中即生效，故直接按列表顺序注册即可。
     */
    private void applyDeclarativeAuthz(
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry auth) {

        for (AuthzRules.Rule rule : AuthzRules.RULES) {
            if (rule.roles() == null || rule.roles().length == 0) {
                throw new IllegalStateException(
                        "授权规则缺少角色声明（会导致该路径无人可访问）：" + rule.method() + " " + rule.path());
            }
            if (rule.roles().length == 1) {
                auth.requestMatchers(rule.method(), rule.path()).hasRole(rule.roles()[0]);
            } else {
                auth.requestMatchers(rule.method(), rule.path()).hasAnyRole(rule.roles());
            }
        }

        if (log.isInfoEnabled()) {
            log.info("[Authz] 已装载声明式授权规则 {} 条（兜底=authenticated；下一批改 denyAll）",
                    AuthzRules.RULES.size());
        }
    }
}