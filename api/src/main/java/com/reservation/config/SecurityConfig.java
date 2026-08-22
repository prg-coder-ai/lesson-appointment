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
                                "/student.html",
                                "/teacher.html",
                                "/teacherInfo.html",
                                "/teacherPublishedProfile.html",
                                "/logBrowser.html"
                        ).permitAll()

                        // 教师发布信息公开接口（teacherPublishedProfile.html 调用，无需登录）
                        .requestMatchers(
                                "/teacher/published/latest-public",
                                "/teacher/published/public-get"
                        ).permitAll()

                        // 登录/鉴权相关
                        .requestMatchers(
                                "/login",
                                "/auth/login",
                                "/auth/refreshToken",
                                "/auth/logout"
                        ).permitAll()

                        // 注册相关（匿名用户必须能访问）
                        .requestMatchers(
                                "/user/teacher/register",
                                "/user/student/register",
                                "/user/account/exist"
                        ).permitAll()

                        // 其他公共接口
                        .requestMatchers("/interfaces").permitAll()

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