package com.reservation.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.config.JacksonConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 第 6 批动作 26/28 的契约测试。
 *
 * <p>这些断言不是"重复实现"，而是把**跨端约定**钉死：
 * 前端 {@code shared/domain/datetime.js} 的 utcToZoned 假设"后端返带时区标识的串"
 * （裸串会��动补 Z 按 UTC 解读），本测试保证后端确实这么输出。
 */
class ResultAndDateContractTest {

    /**
     * 用 Spring Boot 真实的 Jackson builder 流程 + 项目的 customizer，拿到生产同源的 ObjectMapper。
     *
     * <p>刻意<b>不起 Spring 上下文</b>：契约测试要的是"序列化配置对不对"，
     * 起整个上下文会把数据库、租户插件等无关依赖卷进来，反而更慢更容易因环境而失败。
     * {@code Jackson2ObjectMapperBuilder} 是 Spring Boot 实际用来装配 ObjectMapper 的那个类，
     * 走它 + 项目的 customizer，配置来源与线上一致。
     */
    private static ObjectMapper productionMapper() {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new JacksonConfig().utcDateTimeCustomizer().customize(builder);
        return builder.build();
    }

    // ─────────────────── 动作 28：错误响应契约 ───────────────────

    @Test
    @DisplayName("Result.code 是 primitive int：fail(null) 无法编译，fail(0) 被断言拦下")
    void resultCodeContract() {
        // fail(0) 必须在开发期被拦下——0 既非成功码也非标准错误码
        IllegalStateException e1 = assertThrows(IllegalStateException.class,
                () -> Result.fail(0, "删除失败"));
        assertTrue(e1.getMessage().contains("非法"), "异常信息应说明是非法码，实际：" + e1.getMessage());

        // fail(null) 同样被拦下
        IllegalStateException e2 = assertThrows(IllegalStateException.class,
                () -> Result.fail(null, "未知失败"));
        assertTrue(e2.getMessage().contains("null"), "异常信息应点名 null，实际：" + e2.getMessage());

        // 合法码正常返回
        assertEquals(400, Result.fail(400, "参数错").getCode());
        assertEquals(500, Result.fail(500, "服务器错").getCode());
        assertEquals(200, Result.success().getCode());
    }

    @Test
    @DisplayName("失败响应序列化后必须带 code 字段（曾因 non_null 配置整个消失）")
    void failureResponseAlwaysCarriesCode() throws Exception {
        ObjectMapper mapper = productionMapper();

        Map<String, Object> bean = new LinkedHashMap<>();
        bean.put("code", 400);      // 手工构造，模拟"失败但 data/message 为 null"的最坏情况
        bean.put("message", "参数错误");

        String json = mapper.writeValueAsString(bean);
        assertTrue(json.contains("\"code\""),
                "失败响应里 code 字段不得消失（曾因 default-property-inclusion=non_null 整段消失）。实际 JSON：" + json);
        assertTrue(json.contains("400"), "code 值应原样输出。实际 JSON：" + json);
    }

    @Test
    @DisplayName("ErrorCodes 按异常语义给码，与 GlobalExceptionHandler 映射一致")
    void errorCodesFollowExceptionSemantics() {
        assertEquals(500, ErrorCodes.from(new RuntimeException("未知")));
        assertEquals(400, ErrorCodes.from(new IllegalArgumentException("参数非法")));
        assertEquals(400, ErrorCodes.from(new com.reservation.exception.BusinessException("重复提交")));
        assertEquals(403, ErrorCodes.from(new com.reservation.exception.NoPermissionException("无权")));
        assertEquals(401, ErrorCodes.from(new com.reservation.exception.UnLoginException("未登录")));
        assertEquals(404, ErrorCodes.from(new com.reservation.exception.ResourceNotFoundException("课程不存在")));
        assertEquals(404, ErrorCodes.from(new com.reservation.exception.UserNotFoundException("用户不存在")));
    }

    // ─────────────────── 动作 26：日期契约 ───────────────────

    @Test
    @DisplayName("LocalDateTime 出参为 UTC ISO串，且带时区标识 Z")
    void localDateTimeIsIsoWithZoneMarker() throws Exception {
        ObjectMapper mapper = productionMapper();

        Map<String, Object> bean = new LinkedHashMap<>();
        bean.put("t", LocalDateTime.of(2026, 10, 9, 21, 31, 22));

        String json = mapper.writeValueAsString(bean);
        // 前端 utcToZoned 用 /([Zz]|[+-]\d{2}:?\d{2})$/ 判定有无时区标识，
        // 缺 Z 会被它补上并当 UTC 解读 —— 对已是 UTC 的值恰好正确，对本地墙钟则是静默偏移。
        assertTrue(json.contains("Z\""),
                "LocalDateTime 出参必须带时区标识（Z），否则前端会按 UTC 解读本地时间。实际 JSON：" + json);
        assertTrue(json.contains("2026-10-09T21:31:22"),
                "必须是 ISO-8601 带 T 格式。实际 JSON：" + json);
    }

    @Test
    @DisplayName("时间不走数字时间戳（数字无时区语义，前端无法判别）")
    void localDateTimeIsNotNumericTimestamp() throws Exception {
        ObjectMapper mapper = productionMapper();
        Map<String, Object> bean = new LinkedHashMap<>();
        bean.put("t", LocalDateTime.of(2026, 10, 9, 21, 31, 22));

        String json = mapper.writeValueAsString(bean);
        assertTrue(json.contains("\""),
                "时间字段必须是字符串而非数字时间戳。实际 JSON：" + json);
        assertTrue(!json.matches(".*\"t\"\\s*:\\s*\\d{13}.*"),
                "不应出现 13 位毫秒时间戳。实际 JSON：" + json);
    }

    @Test
    @DisplayName("入参 LocalDateTime 接受 ISO-8601 带 T（项目既有铁律）")
    void localDateTimeDeserializesIsoWithT() throws Exception {
        ObjectMapper mapper = productionMapper();

        // 必须用有类型的持有类：反序列化到 Map 时 Jackson 只会给出 String/Long，
        // 不会凭空把字符串变成 LocalDateTime（那属于"弱类型"行为，不是本配置的契约）。
        Holder h = mapper.readValue("{\"t\":\"2026-10-09T21:31:22\"}", Holder.class);
        assertEquals(LocalDateTime.of(2026, 10, 9, 21, 31, 22), h.t);
    }

    /** 反序列化测试用的有类型持有类。 */
    static class Holder {
        public LocalDateTime t;
    }
}
