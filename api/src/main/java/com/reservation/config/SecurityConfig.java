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
                    "/",
                    "/index",
                    "/login",
                    "/auth/login",
                    "/auth/refreshToken",
                    "/index.html",
                    "/admin.html", "/student.html", "/teacher.html",
                    "/interfaces",
                    "/user/teacher/register", "/user/student/register",
                    "/js/**", "/css/**", "/images/**", "/favicon.ico"
                ).permitAll()
                .anyRequest().authenticated()
            )
            .csrf(csrf -> csrf.disable());
        return http.build();
    }
}