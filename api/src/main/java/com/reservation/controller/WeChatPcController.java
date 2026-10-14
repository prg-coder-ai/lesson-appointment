package com.reservation.controller;

import com.reservation.common.Result;
import com.reservation.dto.WeChatSession;
import com.reservation.entity.WxLoginState;
import com.reservation.service.UserService;
import com.reservation.service.WeChatService;
import com.reservation.service.WxLoginStateService;
import com.reservation.utils.JwtUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 微信 PC 扫码登录/绑定（P2，网站应用 snsapi_login）。
 *
 * <p>链路：{@code GET /qr} 生成一次性 state + 二维码 URL → 前端渲染二维码 →
 * 用户手机微信扫码 → 微信 302 到 {@code /pc-callback?code=&state=} →
 * 服务端换 openid/unionid、按 unionid→openid 匹配账号 → 发 token（login）
 * 或写绑定（bind）→ 置 state 终态 → 前端轮询 {@code /qr/status} 取走结果。
 *
 * <p><b>三个端点全部免登录</b>（已同步 SecurityConfig / JwtAuthenticationFilter /
 * WebMvcConfig.EXCLUDE_PATTERNS / check-authz PERMIT_ALL 四处白名单，双路径形态）：
 * <ul>
 *   <li>{@code /qr} 的 bind 场景在方法体内校验 Bearer——userId 由服务端从令牌解析，
 *       不信客户端参数（防扫码冒用）；</li>
 *   <li>{@code /qr/status} 的凭证就是 state 本身（不可猜、一次性、5 分钟过期）；</li>
 *   <li>{@code /pc-callback} 由微信服务器 302 触发，不可能带 Bearer。</li>
 * </ul>
 *
 * <p>设计依据：《微信登录与绑定实现路径方案》第 5.2 节；安全姿态见其第 6 节。
 */
@RestController
@RequestMapping("/api/v1/auth/wechat")
public class WeChatPcController {

    @Value("${wechat.open.appid}")
    private String openAppid;

    @Value("${wechat.open.redirect-uri}")
    private String redirectUri;

    private final WeChatService weChatService;
    private final WxLoginStateService wxLoginStateService;
    private final UserService userService;
    private final JwtUtil jwtUtil;
    // 注入容器 bean（勿用 new ObjectMapper()）：全局 Jackson 配置只对容器管理的 Mapper 生效，
    // date-contract 守卫会拦裸构造。
    private final ObjectMapper objectMapper;

    public WeChatPcController(WeChatService weChatService, WxLoginStateService wxLoginStateService,
                              UserService userService, JwtUtil jwtUtil, ObjectMapper objectMapper) {
        this.weChatService = weChatService;
        this.wxLoginStateService = wxLoginStateService;
        this.userService = userService;
        this.jwtUtil = jwtUtil;
        this.objectMapper = objectMapper;
    }

    /**
     * 生成扫码二维码（免登录；bind 场景需 Bearer）。
     *
     * @param purpose login=扫码登录 / bind=已登录账号绑微信
     */
    @GetMapping("/qr")
    public Result<Map<String, Object>> qr(@RequestParam(defaultValue = "login") String purpose,
                                          @RequestHeader(value = "Authorization", required = false) String token,
                                          HttpServletRequest request) {
        if (!"login".equals(purpose) && !"bind".equals(purpose)) {
            return Result.fail(400, "purpose 仅支持 login/bind");
        }
        String userId = null;
        if ("bind".equals(purpose)) {
            // bind 类 state 必须携带登录态 userId（服务端从令牌解析，不信客户端参数）
            if (token == null || !token.startsWith("Bearer ")) {
                return Result.unauthorized("请先登录");
            }
            try {
                userId = jwtUtil.getUserIdFromToken(token);
            } catch (Exception e) {
                return Result.unauthorized("登录已过期，请重新登录");
            }
        }
        WxLoginState state = wxLoginStateService.create(purpose, userId, clientIp(request));
        String qrUrl = "https://open.weixin.qq.com/connect/qrconnect"
                + "?appid=" + openAppid
                + "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8)
                + "&response_type=code&scope=snsapi_login&state=" + state.getState()
                + "#wechat_redirect";
        Map<String, Object> data = new HashMap<>();
        data.put("state", state.getState());
        data.put("qrUrl", qrUrl);
        data.put("expireSeconds", WxLoginStateService.EXPIRE_SECONDS);
        return Result.success(data, "二维码已生成");
    }

    /**
     * 轮询扫码结果（免登录：state 本身即一次性秘密）。
     *
     * <p>返回 {@code pending / confirmed / expired / failed}；confirmed 的 login
     * 场景附带会话字段（token/userId/role/tenantCode/refreshToken）——读取后行即删，
     * token 不重放。
     */
    @GetMapping("/qr/status")
    public Result<Map<String, Object>> qrStatus(@RequestParam String state) {
        if (state == null || state.isBlank()) {
            return Result.fail(400, "state 不能为空");
        }
        return Result.success(wxLoginStateService.poll(state), "查询成功");
    }

    /**
     * 微信授权回调（免登录；微信 302 目标，返回手机端提示页）。
     *
     * <p>电脑端页面靠轮询 {@code /qr/status} 推进，本页面只负责「告知手机用户结果」。
     * state 不存在/已过期/已消费 → 提示重新扫码，不做任何账号操作。
     */
    @GetMapping(value = "/pc-callback", produces = MediaType.TEXT_HTML_VALUE)
    public String pcCallback(@RequestParam String state,
                             @RequestParam(required = false) String code,
                             @RequestParam(required = false) String errorcode) {
        WxLoginState s = wxLoginStateService.getByState(state);
        if (s == null || !"pending".equals(s.getStatus()) || wxLoginStateService.isExpired(s)) {
            return htmlPage("二维码已过期", "二维码已过期或已被使用，请返回电脑端重新扫码。", false);
        }
        if (code == null || code.isBlank()) {
            wxLoginStateService.markFailed(state, "微信授权被取消");
            return htmlPage("授权未完成", "你取消了微信授权，请返回电脑端重新扫码。", false);
        }
        WeChatSession session = weChatService.pcOauth(code);
        if (session.getOpenid() == null) {
            String msg = "微信授权失败：" + (session.getErrmsg() == null ? "未知错误" : session.getErrmsg());
            wxLoginStateService.markFailed(state, msg);
            return htmlPage("授权失败", msg + "，请返回电脑端重试。", false);
        }
        if ("bind".equals(s.getPurpose())) {
            Result<Boolean> bindResult = userService.wechatPcBind(s.getUserId(), session.getOpenid(), session.getUnionid());
            if (bindResult.getCode() == 200) {
                wxLoginStateService.markConfirmed(state, null);
                return htmlPage("绑定成功", "微信已绑定到当前账号，请返回电脑端查看。", true);
            }
            wxLoginStateService.markFailed(state, bindResult.getMessage());
            return htmlPage("绑定未完成", bindResult.getMessage() + "，请返回电脑端查看。", false);
        }
        // login 分支：复用小程序同一套账号匹配（unionid→openid）与发 token 逻辑
        Result<HashMap<String, Object>> login = userService.wechatLogin(session.getOpenid(), session.getUnionid());
        if (login.getCode() == 200 && login.getData() != null) {
            try {
                wxLoginStateService.markConfirmed(state, objectMapper.writeValueAsString(login.getData()));
                return htmlPage("登录成功", "已确认登录，请返回电脑端继续操作。", true);
            } catch (Exception e) {
                wxLoginStateService.markFailed(state, "会话序列化失败");
                return htmlPage("登录未完成", "系统繁忙，请返回电脑端重试。", false);
            }
        }
        String guidance = login.getCode() == 1001
                ? "该微信尚未绑定账号，请先在小程序或网页完成注册/绑定后再扫码登录"
                : login.getMessage();
        wxLoginStateService.markFailed(state, guidance);
        return htmlPage("登录未完成", guidance + "。", false);
    }

    /** 手机端提示页（自包含，无外部依赖；微信内置浏览器渲染）。 */
    private String htmlPage(String title, String message, boolean success) {
        String color = success ? "#2f855a" : "#c05656";
        return "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<title>" + title + "</title></head>"
                + "<body style=\"margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#f5f6fa;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;\">"
                + "<div style=\"background:#fff;border-radius:12px;padding:32px 28px;max-width:320px;width:86%;"
                + "box-shadow:0 4px 20px rgba(0,0,0,.08);text-align:center;\">"
                + "<div style=\"font-size:40px;line-height:1;\">" + (success ? "✅" : "⚠️") + "</div>"
                + "<h1 style=\"font-size:18px;color:#1f2937;margin:16px 0 8px;\">" + title + "</h1>"
                + "<p style=\"font-size:14px;color:" + color + ";line-height:1.6;margin:0;\">" + message + "</p>"
                + "</div></body></html>";
    }

    /** 取客户端 IP（兼容 X-Forwarded-For / X-Real-IP / getRemoteAddr）。 */
    private String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
