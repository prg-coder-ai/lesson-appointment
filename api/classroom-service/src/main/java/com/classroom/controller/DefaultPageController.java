package com.classroom.controller;

import com.classroom.common.ServiceInfo;
import com.classroom.service.ServiceInfoService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * classroom-service 缺省页（后端自我标识）。
 */
@Controller
public class DefaultPageController {

    private final ServiceInfoService serviceInfoService;

    public DefaultPageController(ServiceInfoService serviceInfoService) {
        this.serviceInfoService = serviceInfoService;
    }

    @GetMapping(value = {"/", "/index.html"}, produces = MediaType.TEXT_HTML_VALUE + ";charset=UTF-8")
    @ResponseBody
    public String index(HttpServletRequest request) {
        ServiceInfo info = serviceInfoService.current(request);
        return """
                <!DOCTYPE html>
                <html lang="zh-CN">
                <head><meta charset="UTF-8"><title>%s · 在线教学后台服务</title></head>
                <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa;">
                  <div style="background:#fff;border-radius:10px;padding:32px 40px;box-shadow:0 2px 16px rgba(0,0,0,.08);max-width:520px;">
                    <h1 style="margin:0 0 6px;font-size:24px;">%s</h1>
                    <div style="color:#27ae60;font-size:14px;">● 服务运行中</div>
                    <p style="color:#7f8c8d;font-size:13px;">在线教学微服务 · 课堂接入/签到/教学环节/录制/对账</p>
                    <table style="width:100%%;border-collapse:collapse;font-size:14px;">
                      <tr><td style="color:#7f8c8d;padding:9px 0;">版本</td><td style="font-family:monospace;">%s</td></tr>
                      <tr><td style="color:#7f8c8d;padding:9px 0;">构建时间</td><td style="font-family:monospace;">%s</td></tr>
                      <tr><td style="color:#7f8c8d;padding:9px 0;">服务器时间</td><td style="font-family:monospace;">%s</td></tr>
                      <tr><td style="color:#7f8c8d;padding:9px 0;">时区</td><td style="font-family:monospace;">%s</td></tr>
                      <tr><td style="color:#7f8c8d;padding:9px 0;">已运行</td><td style="font-family:monospace;">%s</td></tr>
                    </table>
                  </div>
                </body>
                </html>
                """.formatted(info.getAppName(), info.getAppName(), info.getVersion(),
                info.getBuildTime(), info.getServerTime(),
                info.getTimezone() != null ? info.getTimezone().getDescription() : "未知",
                info.getUptime());
    }

    @GetMapping("/favicon.ico")
    @ResponseBody
    public ResponseEntity<Void> favicon() {
        return ResponseEntity.noContent().build();
    }
}