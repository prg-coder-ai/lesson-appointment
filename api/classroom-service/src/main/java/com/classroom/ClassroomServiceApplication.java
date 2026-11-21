package com.classroom;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 在线教学微服务启动类（独立应用，端口 8092，独立 schema classroom）
 * 复用主系统 JWT/AES 密钥域，对主系统签发的 Token 直接鉴权。
 */
@SpringBootApplication
@MapperScan("com.classroom.mapper")
@EnableAsync
@EnableScheduling
public class ClassroomServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ClassroomServiceApplication.class, args);
    }
}