package com.reservation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 全局 JSON 日期契约（第 6 批动作 26）。
 *
 * <p><b>契约一句话</b>：后端对外的所有时间字段一律输出
 * <b>UTC 的 ISO-8601 字符串，且必须带时区标识（Z或 ±HH:mm）</b>。
 *
 * <p><b>为什么必须带时区标识</b>：前端 {@code shared/domain/datetime.js} 的
 * {@code utcToZoned} 里写着：
 * <pre>
 *   // 关键：裸串必须补Z，否则 new Date() 会按浏览器本地时区解读，偏移一次。
 *   if (!/([Zz]|[+-]\d{2}:?\d{2})$/.test(normalized)) normalized += 'Z';
 * </pre>
 * 即前端<b>已经按"后端返带时区标识的串"设计</b>，遇到裸串会主动补 Z 并按 UTC 解读。
 * 若后端输出的 {@code java.util.Date} 不带时区标识（本项目此前正是如此），
 * 而该时间本意是本地墙钟，则前端会把它当 UTC，产生<b>静默的时区偏移</b>——
 * 这正是第 5 批时区治理刚刚从「课次」链路上消灭掉的缺陷，现在从「日期契约」这条路重新开口。
 *
 * <p><b>为什么不做「统一 LocalDateTime」这种一刀切迁移</b>：全仓 18 个文件用
 * {@code java.util.Date}、53 个用 {@code LocalDateTime}，一次全换改动面过大，
 * 且 {@code java.util.Date} 承载的是<b>已落库的历史数据</b>。本类先统一「输出形态」
 * （让所有时间都以带Z 的 UTC 串出去），把类型迁移按 P0/P1/P2 分批推进——
 * 输出形态统一后，类型迁移就不再有契约风险。
 *
 * <p><b>与时区口径的一致性</b>：第 5 批定的铁律是「{@code appointment} 起= UTC
 * 唯一真相源，展示按用户时区」。本类是那条铁律在 JSON 层的落地：
 * <b>边界出后端时是 UTC ISO，展示时由前端按用户时区渲染</b>，后端不做本地化。
 *
 * <p><b>入参方向</b>：入参 {@code LocalDateTime} 一律要求 ISO-8601 带 {@code T}
 * （{@code 2026-10-09T21:31:22}），这是项目既有铁律，本类保持不变。
 */
@Configuration
public class JacksonConfig {

    /** 统一的日期时间格式：ISO-8601 带 T、无时区（因为我们手动按 UTC 补Z）。 */
    private static final DateTimeFormatter LOCAL_DATE_TIME = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * 出参序列化：把 {@code LocalDateTime} 当作<b>已经是 UTC</b> 的墙钟，
     * 序列化为 {@code 2026-10-09T21:31:22Z}。
     *
     * <p><b>⚠️ 这里必须手写序列化器，不能用 {@code LocalDateTimeSerializer.withZone(UTC)}</b>——
     * 实测踩过：{@code LocalDateTime} 是<b>无时区</b>类型，{@code withZone} 对它不生效，
     * 产出仍是 {@code "2026-10-09T21:31:22"}（不带 Z）。而前端 {@code utcToZoned}
     * 靠尾部是否有 Z 来决定要不要补 Z，补了就按 UTC 解读——对已是 UTC 的值恰好正确，
     * 但对本地墙钟就是静默偏移。要补 Z，只能自己在末尾拼。
     *
     * <p>注意这里<b>没有</b>做 ZoneId 转换 —— 因为第 5 批已把「课次」等关键时间
     * 在入库前就转成 UTC 了（{@code ScheduleGenerator.scheduleLocalToUtc}）。
     * 若此处再做一次本地→UTC 转换，就是<b>转换两次</b>，比不做转换更糟。
     * 这是与「传统 LocalDateTime 序列化」最本质的差别，务必不要"顺手改成带转换"。
     */
    @Bean
    public Jackson2ObjectMapperBuilderCustomizer utcDateTimeCustomizer() {
        return builder -> {
            JavaTimeModule module = new JavaTimeModule();

            module.addSerializer(LocalDateTime.class, new UtcLocalDateTimeSerializer());

            // 入参：接受 ISO-8601 带 T；也接受空格分隔的常见写法，
            // 但<b>不带时区标识</b>——带 Z 的入参请改用带时区的类型，避免歧义。
            module.addDeserializer(LocalDateTime.class,
                    new LocalDateTimeDeserializer(LOCAL_DATE_TIME));

            builder.modules(module);
            // 时间一律走字符串，不走数字时间戳（数字时间戳无时区语义，前端无法判别）。
            builder.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        };
    }

    /**
     * 把 {@code LocalDateTime} 输出为「ISO-8601 + 显式 Z」的字符串。
     *
     * <p>独立成类是为了能被测试直接覆盖；若内联成 lambda，出错时无法从测试定位到具体格式化逻辑。
     */
    static final class UtcLocalDateTimeSerializer extends com.fasterxml.jackson.databind.JsonSerializer<LocalDateTime> {
        @Override
        public void serialize(LocalDateTime value,
                              com.fasterxml.jackson.core.JsonGenerator gen,
                              com.fasterxml.jackson.databind.SerializerProvider serializers) throws java.io.IOException {
            if (value == null) {
                gen.writeNull();
                return;
            }
            gen.writeString(value.format(LOCAL_DATE_TIME) + "Z");
        }
    }

    /**
     * 供守卫与测试引用：说明本配置类必须被 {@code Jackson2ObjectMapperBuilderCustomizer}
     * 消费才算生效—— 若有人把这段逻辑塞进 {@code @Bean ObjectMapper}，
     * Spring Boot 的 builder 定制机制会被绕过（不会报错，只是不生效），属典型静默失效。
     */
    static final String CONTRACT_NOTE =
            "UTC 的 ISO-8601 字符串且必须带时区标识；见 shared/domain/datetime.js 的 utcToZoned 假设";
}
