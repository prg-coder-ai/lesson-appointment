package com.reservation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.dto.WeChatSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 微信小程序服务端能力：用 wx.login() 的临时 code 换取 openid。
 *
 * 调用链路：小程序 wx.login() → code → 本服务 POST /auth/wechat-login（带 code）
 *          → 后端用 code 调微信 auth.code2Session → 拿到 openid → 按 openid 找绑定账号发 token。
 * 客户端永远拿不到真实微信号/昵称，openid 才是可落库的微信身份标识。
 */
@Service
public class WeChatService {

    @Value("${wechat.miniapp.appid}")
    private String appid;

    @Value("${wechat.miniapp.secret}")
    private String secret;

    private static final String CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * 用临时 code 换取微信会话（openid / session_key）。
     *
     * @param code 小程序 wx.login() 返回的临时登录凭证
     * @return 微信返回结果；若微信返回 errcode≠0 或网络异常，openid 为 null 并由调用方判定
     */
    public WeChatSession code2Session(String code) {
        WeChatSession session = new WeChatSession();
        if (code == null || code.isBlank()) {
            session.setErrcode(-1L);
            session.setErrmsg("code 不能为空");
            return session;
        }
        String url = CODE2SESSION_URL
                + "?appid=" + appid
                + "&secret=" + secret
                + "&js_code=" + code
                + "&grant_type=authorization_code";
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode node = objectMapper.readTree(response.body());
            session.setOpenid(node.path("openid").asText(null));
            session.setSessionKey(node.path("session_key").asText(null));
            session.setUnionid(node.path("unionid").asText(null));
            if (node.has("errcode")) {
                session.setErrcode(node.path("errcode").asLong());
            } else {
                session.setErrcode(session.getOpenid() != null ? 0L : -1L);
            }
            session.setErrmsg(node.path("errmsg").asText(null));
        } catch (Exception e) {
            session.setErrcode(-1L);
            session.setErrmsg("调用微信接口失败：" + e.getMessage());
        }
        return session;
    }
}
