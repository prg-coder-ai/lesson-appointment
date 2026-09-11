package com.messagecenter.config;

import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * JSON 序列化统一约定：所有 Long / long 以「字符串」下发。
 *
 * 背景：本服务的消息主键 messageId 由 MyBatis-Plus ASSIGN_ID 生成（雪花 ID，19 位，
 * 约 2.09e18），已远超 JS Number.MAX_SAFE_INTEGER(9007199254740991)。
 * 若以 JSON 数字下发，浏览器 JSON.parse 会静默丢精度（…418 → …400），
 * 前端再拿该 ID 回查/标记已读时必然命中不到行，表现为：
 *   - 打开消息详情 → 404「消息不存在」→ 弹窗「加载失败」
 *   - 标记已读/删除/收藏/收回 → 404，未读数不变
 * 因此这里把 Long 统一序列化为字符串（前端本就以字符串拼 URL / 传 body），
 * 反序列化仍兼容数字与字符串两种写法。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer longToStringCustomizer() {
        return builder -> {
            builder.serializerByType(Long.class, ToStringSerializer.instance);
            builder.serializerByType(Long.TYPE, ToStringSerializer.instance);
        };
    }
}
