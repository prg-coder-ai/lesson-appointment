package com.messagecenter.controller;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.lang.management.ManagementFactory;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.TimeZone;

/**
 * message-service 缺省页（后端自我标识）。
 *
 * <p>背景：message-service 为纯后台微服务，仅提供 REST 接口（/api/v1/**）与 SSE 推送，
 * 不伺服任何页面。为避免访问其根路径时出现空白页或 404，此处保留唯一的缺省页，
 * 用于表明「消息中心服务正在运行」并做自我标识。</p>
 *
 * <p>展示内容：程序名称、版本、构建时间、服务器当前时间、时区、已运行时长。
 * 其中程序名/版本/构建时间取自构建期生成的 {@code META-INF/build-info.properties}
 * （由 spring-boot-maven-plugin 的 build-info 目标生成）；若缺失则降级显示"未知"，不影响启动。</p>
 *
 * <p>注：本服务 SecurityConfig 已 {@code anyRequest().permitAll()}，
 * 且 MessageAuthInterceptor 仅拦截 {@code /api/**} 与 {@code /msg/sse/**}，
 * 因此 "/" 与 "/index.html" 匿名可访问，无需额外放行。</p>
 */
@Controller
public class DefaultPageController {

    private static final String FALLBACK_NAME = "message-service";
    private static final String UNKNOWN = "未知";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final BuildProperties buildProperties;

    /**
     * 用 ObjectProvider 注入：未生成 build-info（如 IDE 直接启动）时为 null，
     * 避免硬注入导致启动失败。
     */
    public DefaultPageController(ObjectProvider<BuildProperties> buildPropertiesProvider) {
        this.buildProperties = buildPropertiesProvider.getIfAvailable();
    }

    @GetMapping(value = {"/", "/index.html"}, produces = MediaType.TEXT_HTML_VALUE + ";charset=UTF-8")
    @ResponseBody
    public String index() {
        String name = FALLBACK_NAME;
        String version = UNKNOWN;
        String buildTime = UNKNOWN;

        if (buildProperties != null) {
            // artifact 比 name 更贴近"程序名称"（即 artifactId）
            String artifact = buildProperties.getArtifact();
            if (artifact != null && !artifact.isBlank()) {
                name = artifact;
            } else if (buildProperties.getName() != null && !buildProperties.getName().isBlank()) {
                name = buildProperties.getName();
            }
            if (buildProperties.getVersion() != null) {
                version = buildProperties.getVersion();
            }
            if (buildProperties.getTime() != null) {
                buildTime = LocalDateTime.ofInstant(buildProperties.getTime(), ZoneId.systemDefault()).format(FMT);
            }
        }

        LocalDateTime now = LocalDateTime.now();
        TimeZone tz = TimeZone.getDefault();
        String tzInfo = tz.getID() + "（" + tz.getDisplayName(Locale.SIMPLIFIED_CHINESE) + "，" + utcOffset(tz) + "）";

        return """
                <!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>%s · 消息中心后台服务</title>
                  <style>
                    * { box-sizing: border-box; }
                    body {
                      margin: 0; min-height: 100vh;
                      display: flex; align-items: center; justify-content: center;
                      background: #f5f7fa; color: #2c3e50;
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
                    }
                    .card {
                      background: #fff; border-radius: 10px; padding: 32px 40px;
                      box-shadow: 0 2px 16px rgba(0,0,0,.08); max-width: 560px; width: 90%%;
                    }
                    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 600; }
                    .status { color: #27ae60; font-size: 14px; margin-bottom: 4px; }
                    .sub { color: #7f8c8d; font-size: 13px; margin: 0 0 22px; }
                    table { width: 100%%; border-collapse: collapse; font-size: 14px; }
                    th, td { text-align: left; padding: 9px 0; border-bottom: 1px solid #eef1f5; }
                    th { width: 38%%; color: #7f8c8d; font-weight: 500; }
                    td { color: #2c3e50; font-family: Consolas, Monaco, monospace; }
                    .note {
                      margin: 22px 0 0; padding-top: 16px; border-top: 1px dashed #e2e6ec;
                      color: #95a5a6; font-size: 12px; line-height: 1.7;
                    }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <h1>%s</h1>
                    <div class="status">● 服务运行中</div>
                    <p class="sub">消息中心微服务 · 纯后台程序（无管理页面）</p>
                    <table>
                      <tr><th>程序名称</th><td>%s</td></tr>
                      <tr><th>版本</th><td>%s</td></tr>
                      <tr><th>构建时间</th><td>%s</td></tr>
                      <tr><th>服务器时间</th><td>%s</td></tr>
                      <tr><th>时区</th><td>%s</td></tr>
                      <tr><th>已运行</th><td>%s</td></tr>
                    </table>
                    <p class="note">
                      本服务仅提供 REST 接口（/api/v1/**）与 SSE 实时推送（/api/v1/sse/connect），不再伺服任何页面。<br>
                      消息中心的管理界面由前端项目提供，请通过前端站点访问。
                    </p>
                  </div>
                </body>
                </html>
                """.formatted(name, name, name, version, buildTime, now.format(FMT), tzInfo, uptime());
    }

    /**
     * 浏览器打开任意页面时都会自动请求 /favicon.ico。
     *
     * <p>本服务无任何静态资源，若不处理会抛 {@code NoResourceFoundException}，
     * 被全局异常处理器兜底记为 ERROR 并返回 500 —— 纯属噪声。</p>
     *
     * <p>此处直接返回 204 No Content：消除报错日志，浏览器也不再反复请求。
     * 注：本服务 SecurityConfig 已 permitAll，无需额外放行。</p>
     */
    @GetMapping("/favicon.ico")
    @ResponseBody
    public ResponseEntity<Void> favicon() {
        return ResponseEntity.noContent().build();
    }

    /** 时区 UTC 偏移量，如 UTC+08:00 */
    private static String utcOffset(TimeZone tz) {
        int totalMin = tz.getOffset(System.currentTimeMillis()) / 60000;
        String sign = totalMin >= 0 ? "+" : "-";
        int abs = Math.abs(totalMin);
        return String.format("UTC%s%02d:%02d", sign, abs / 60, abs % 60);
    }

    /** JVM 已运行时长，如 1 天 2 小时 3 分 4 秒 */
    private static String uptime() {
        long totalSec = ManagementFactory.getRuntimeMXBean().getUptime() / 1000;
        long d = totalSec / 86400;
        long h = (totalSec % 86400) / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        return d + " 天 " + h + " 小时 " + m + " 分 " + s + " 秒";
    }
}
