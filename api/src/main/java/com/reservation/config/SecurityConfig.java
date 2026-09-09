package com.reservation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.objectMapper = objectMapper;
    }

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
                .authorizeHttpRequests(auth -> auth
                        // 所有 OPTIONS 预检请求放行
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // 页面与首页
                        .requestMatchers(
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
                                
                        ).permitAll()

                        // 教师发布信息公开接口（teacherPublishedProfile.html 调用，无需登录）
                        // L1 迁移后接口统一在 /api/v1 下，白名单须同时放裸路径与 /api/v1 前缀
                        .requestMatchers(
                                "/booking",
                                "/booking.html",
                                "/api/v1/booking",
                                "/teacher/published/latest-public",
                                "/api/v1/teacher/published/latest-public",
                                "/teacher/published/public-get",
                                "/api/v1/teacher/published/public-get",
                                "/schedule/getAvailableSchedule",
                                "/api/v1/schedule/getAvailableSchedule"
                        ).permitAll()

                        // 登录/鉴权相关
                        .requestMatchers(
                                "/login",
                                "/auth/login",
                                "/api/v1/auth/login",
                                "/auth/refreshToken",
                                "/api/v1/auth/refreshToken",
                                "/auth/logout",
                                "/api/v1/auth/logout"
                        ).permitAll()

                        // 注册相关（匿名用户必须能访问）
                        // 注意：/user/register 才是 UserController 实际映射（@PostMapping("/register")），
                        // 此前只放了不存在的 /user/admin/register，导致自助注册被 401 拦截；
                        // 此处与 WebMvcConfig/JwtFilter 的白名单保持一致
                        .requestMatchers(
                                "/user/register", 
                                "/api/v1/user/register",
                                "/user/account/exist",
                                "/api/v1/user/account/exist"
                        ).permitAll()

                        // 其他公共接口
                        .requestMatchers("/interfaces", "/api/v1/interfaces", "/tenant/name", "/api/v1/tenant/name").permitAll()

                        // 服务运行信息（缺省页同款字段，健康检查/环境自检用，匿名可访问）
                        .requestMatchers("/system/info", "/api/v1/system/info", "/apiInfo", "/api/v1/apiInfo").permitAll()

                        // 静态资源
                        .requestMatchers(
                                "/js/**", "/css/**", "/images/**", "/favicon.ico"
                        ).permitAll()

                        // 其余所有请求需认证
                        .anyRequest().authenticated()
                )

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
}