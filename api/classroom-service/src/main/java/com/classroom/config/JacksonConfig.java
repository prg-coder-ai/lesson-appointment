package com.classroom.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * JSON 序列化统一约定：所有 Long / long 以「字符串」下发。
 * 与 message-service 同规：雪花 ID 超 JS Number.MAX_SAFE_INTEGER，需字符串避免精度丢失。
 *
 * <p>另：{@link LocalDateTime} 反序列化放宽为「ISO-8601 与 {@code yyyy-MM-dd HH:mm:ss} 都收」。
 * 默认只认 ISO（带 T），而预约系统库里存的是空格分隔格式，直发会在本服务解析失败
 * 并返回 400「请求体格式错误」——调用方只看到"推送失败"，很难联想到是时间格式。
 * 发送方已改为发 ISO，这里再加一层容错，避免历史报文或其他调用方重复踩坑。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer longToStringCustomizer() {
        return builder -> {
            builder.serializerByType(Long.class, ToStringSerializer.instance);
            builder.serializerByType(Long.TYPE, ToStringSerializer.instance);
            builder.deserializerByType(LocalDateTime.class, new LenientLocalDateTimeDeserializer());
        };
    }

    /** 同时接受 {@code 2026-10-28T18:00:00} 与 {@code 2026-10-28 18:00:00}（含可选小数秒） */
    static class LenientLocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {
        private static final DateTimeFormatter SPACE_FMT =
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

        @Override
        public LocalDateTime deserialize(JsonParser p, DeserializationContext ctx) throws IOException {
            String text = p.getText();
            if (text == null || text.trim().isEmpty()) return null;
            String s = text.trim();
            try {
                return LocalDateTime.parse(s.replace(' ', 'T'));
            } catch (Exception ignore) {
                // 继续尝试空格格式
            }
            try {
                return LocalDateTime.parse(s, SPACE_FMT);
            } catch (Exception e) {
                return (LocalDateTime) ctx.handleWeirdStringValue(LocalDateTime.class, s,
                        "时间格式应为 ISO-8601 或 yyyy-MM-dd HH:mm:ss");
            }
        }
    }
}
