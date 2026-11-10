package com.reservation.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 等保 P1-3：CORS 收敛配置。
 *
 * <p>允许来源不再写死在代码里，改由配置项 {@code app.cors.allowed-origin-patterns}
 * 决定（逗号分隔，支持通配符），云端通过环境变量 {@code APP_CORS_ORIGIN_PATTERNS} 注入。
 * 这样换域名不必改代码、重新打包镜像。
 *
 * <ul>
 *   <li>本机/测试档（application.properties）默认放行 localhost / 127.0.0.1 / 测试机 IP</li>
 *   <li>cloud 档（application-cloud.properties）默认**空** —— 前后端同域名部署时浏览器
 *       不会带 Origin 做跨域校验，留空即可；确有独立前端域时再注入</li>
 * </ul>
 *
 * <p>请求头 / 方法 / 响应头一律从原来的 {@code *} 收敛为最小必要集合。
 * 未知来源跨域时后端仍执行业务逻辑，但响应不会附加 {@code Access-Control-Allow-Origin}，
 * 浏览器侧表现为 CORS 错误 —— 符合"访问控制、跨域策略"要求。
 */
@Slf4j
@Configuration
public class CorsConfig {

    /**
     * 允许的 Origin 模式列表。留空 = 不放开任何跨域来源（同源访问不受影响）。
     */
    @Value("${app.cors.allowed-origin-patterns:}")
    private String allowedOriginPatterns;

    private static final String WILDCARD_ALONE = "*";

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();

        // ═══════════════════════════════════════════════════════
        // 允许来源 —— 来自配置，不再写死
        // ═══════════════════════════════════════════════════════
        List<String> patterns = parsePatterns(allowedOriginPatterns);
        for (String pattern : patterns) {
            config.addAllowedOriginPattern(pattern);
        }
        if (patterns.isEmpty()) {
            log.info("[CORS] app.cors.allowed-origin-patterns 为空：不放开任何跨域来源"
                   + "（前后端同域名部署时属正常情况）");
        } else {
            log.info("[CORS] 允许的跨域来源（{} 条）：{}", patterns.size(), patterns);
        }

        config.setAllowCredentials(true);

        // ═══════════════════════════════════════════════════════
        // 从 * 收敛为最小必要请求头
        // ═══════════════════════════════════════════════════════
        config.addAllowedHeader("Authorization");
        config.addAllowedHeader("Content-Type");
        config.addAllowedHeader("X-Requested-With");
        config.addAllowedHeader("X-Tenant-Code");
        config.addAllowedHeader("X-User-Id");
        config.addAllowedHeader("Content-Length");

        // 允许的 HTTP 方法（从 * 收敛）
        config.addAllowedMethod("GET");
        config.addAllowedMethod("POST");
        config.addAllowedMethod("PUT");
        config.addAllowedMethod("DELETE");
        config.addAllowedMethod("OPTIONS");

        // 响应头暴露（从 * 收敛，前端 fetch/axios 才能读到）
        config.addExposedHeader("Authorization");
        config.addExposedHeader("X-User-Id");

        // 预检请求有效期（秒）
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    /**
     * 把逗号分隔的配置串拆成列表：去空格、去空项、去重。
     *
     * <p>同时挡掉"单独一个 {@code *}"这种写法 —— 配合 {@code allowCredentials=true}
     * 等于对所有站点放开，属于典型的越权配置，直接忽略并告警，而不是静默照用。
     */
    private List<String> parsePatterns(String raw) {
        List<String> result = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return result;
        }
        for (String item : Arrays.asList(raw.split(","))) {
            String p = item.trim();
            if (p.isEmpty()) {
                continue;
            }
            if (WILDCARD_ALONE.equals(p)) {
                log.warn("[CORS] 配置里出现单独通配符 '*'，已忽略（配合 allowCredentials=true 会放开所有站点）。"
                       + "请改为具体域名，例如 https://www.example.com");
                continue;
            }
            if (!result.contains(p)) {
                result.add(p);
            }
        }
        return result;
    }
}
