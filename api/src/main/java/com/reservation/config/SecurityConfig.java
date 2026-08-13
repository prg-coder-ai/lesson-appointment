package com.reservation.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    // --- 页面与首页 ---
                    "/",
                    "/index",
                    "/index.html",
                    "/admin.html", "/student.html", "/teacher.html",
                    // --- 登录/鉴权相关 ---
                    "/login",
                    "/auth/login",
                    "/auth/refreshToken",
                    // --- 注册相关（匿名用户必须能访问）---
                    "/user/teacher/register",
                    "/user/student/register",
                    "/user/account/exist",    // 新增：注册前的账号存在性校验
                    // --- 其他公共接口 ---
                    "/interfaces",
                    // --- 静态资源 ---
                    "/js/**", "/css/**", "/images/**", "/favicon.ico"
                ).permitAll()
                .anyRequest().authenticated()
            )
            .csrf(csrf -> csrf.disable());
        return http.build();
    }
}