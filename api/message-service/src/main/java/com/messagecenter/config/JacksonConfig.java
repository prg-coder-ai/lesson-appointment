package com.messagecenter.config;

import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 前端 JS 的 Number 最大安全整数为 2^53-1（≈9.0e15），而消息/分类/投递/任务等表主键均为
 * BIGINT(Long)，例如 2096404399947534337 已远超安全范围。若以 JSON number 返回，浏览器
 * JSON.parse 会丢失末位精度（...337 → ...300），导致前端用被截断的 id 去请求消息详情、
 * 标记已读时命中 404，表现为“打不开消息内容”“标记已读后角标不更新”等故障。
 *
 * 因此在 message-service 作用域内，将所有 Long/long 统一序列化为字符串；前端本就以字符串
 * 透传 id（data-mid 属性、URL 路径、批量 id 数组），不受影响。int/Integer 等短整型保持原样。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer longToStringSerializer() {
        return builder -> builder
                .serializerByType(Long.class, ToStringSerializer.instance)
                .serializerByType(long.class, ToStringSerializer.instance);
    }
}
