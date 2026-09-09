package com.messagecenter;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 校内消息中心微服务启动类（独立应用，独立端口 8090，独立 schema message_center）
 * 复用主系统 JWT/AES 密钥域，对主系统签发的 Token 直接鉴权。
 */
@SpringBootApplication
@MapperScan("com.messagecenter.mapper")
@EnableAsync
public class MessageCenterApplication {
    public static void main(String[] args) {
        SpringApplication.run(MessageCenterApplication.class, args);
    }
}
