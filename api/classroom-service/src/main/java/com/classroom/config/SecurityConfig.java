package com.classroom.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 安全配置：鉴权统一走 AuthInterceptor（解析共享 JWT）。
 * Spring Security 只负责放行所有请求 + 提供 BCrypt Bean，不额外拦截。
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * 签名文件端点单独一条链：讲稿 PDF 走 {@code <iframe src>}、录制回放走
     * {@code <video src>}，它们都没法带 Authorization 头，所以 FileAccessController
     * 用带 exp + HMAC 的短时签名 URL（默认 2h）来鉴权。
     *
     * <p>Spring Security 默认给**所有**响应加 {@code X-Frame-Options: DENY}，
     * 会把这些内联资源全部挡掉，浏览器报「Refused to display ... in a frame
     * because it set 'X-Frame-Options' to 'deny'」。这里只对该前缀关闭这一个头，
     * 其余端点继续保持 DENY；该端点不返回 HTML 表单、无登录态可窃，
     * 本身又有签名与过期保护，不构成新的点击劫持面。
     */
    @Bean
    @Order(1)
    public SecurityFilterChain fileAccessChain(HttpSecurity http) throws Exception {
        http
            .securityMatcher("/api/v1/files/**")
            .csrf(csrf -> csrf.disable())
            .cors(cors -> {})
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .headers(headers -> headers.frameOptions(frame -> frame.disable()));
        return http.build();
    }

    @Bean
    @Order(2)
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> {})
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}