package com.reservation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.dto.WeChatSession;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 微信小程序服务端能力：用 wx.login() 的临时 code 换取 openid / unionid。
 *
 * 调用链路：小程序 wx.login() → code → 本服务 POST /auth/wechat-login（带 code）
 *          → 后端用 code 调微信 auth.code2Session → 拿到 openid/unionid → 按绑定账号发 token。
 * 客户端永远拿不到真实微信号/昵称，openid 才是可落库的微信身份标识；
 * unionid 是跨端统一身份键（P1 起落库 wx_userid.wx_unionid，匹配优先级高于 openid）。
 */
@Service
public class WeChatService {

    private static final Logger log = LoggerFactory.getLogger(WeChatService.class);

    @Value("${wechat.miniapp.appid}")
    private String appid;

    @Value("${wechat.miniapp.secret}")
    private String secret;

    /** 开放平台网站应用 appid（PC 扫码登录，snsapi_login）。 */
    @Value("${wechat.open.appid}")
    private String openAppid;

    /** 开放平台网站应用 appsecret。 */
    @Value("${wechat.open.secret}")
    private String openSecret;

    private static final String CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
    private static final String OAUTH_ACCESS_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * 启动自检：secret 仍是占位符时大声 WARN。
     *
     * <p>不改变「占位 → code2Session errcode≠0 → 接口回 1001 静默降级」的设计姿态
     * （客户端不该看到微信侧错误细节），但此前的故障形态是「不报错也不生效」、
     * 排查全靠翻代码——加一行启动日志让根因在服务日志里一眼可见。
     *
     * <p>P2 起同时自检开放平台网站应用凭据（PC 扫码登录链路）。
     */
    @PostConstruct
    public void warnIfSecretPlaceholder() {
        if (secret == null || secret.isBlank() || secret.startsWith("REPLACE_WITH")) {
            log.warn("wechat.miniapp.secret 仍为占位符：code2Session 将返回 errcode!=0，"
                    + "微信登录/绑定/注册会全部静默降级（接口回 1001）。"
                    + "请注入环境变量 WECHAT_SECRET（微信公众平台 → 开发管理 → 开发设置 → AppSecret）。");
        }
        if (openSecret == null || openSecret.isBlank() || openSecret.startsWith("REPLACE_WITH")) {
            log.warn("wechat.open.secret 仍为占位符：PC 扫码登录（/auth/wechat/pc-callback）"
                    + "将换不到 openid/unionid，扫码后回落「授权失败」。"
                    + "请注入环境变量 WECHAT_OPEN_SECRET（开放平台 → 管理中心 → 网站应用）。");
        }
    }

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

    /**
     * PC 扫码登录（P2）：用网站应用授权回调带回的 code 兑换 openid / unionid。
     *
     * <p>与小程序的 {@link #code2Session} 是两套凭证体系：appid/secret 用开放平台
     * <b>网站应用</b>的（{@code wechat.open.*}），接口是 {@code sns/oauth2/access_token}
     * （scope=snsapi_login）。openid 与小程序端<b>必然不同</b>，跨端唯一公共键是 unionid
     * ——前提是网站应用与小程序绑定在同一开放平台账号，否则微信不下发 unionid。
     *
     * @param code 微信回调地址栏 {@code ?code=} 参数（一次性，5 分钟过期）
     * @return 成功时 openid/unionid 非空；失败 errcode≠0 由调用方降级处理
     */
    public WeChatSession pcOauth(String code) {
        WeChatSession session = new WeChatSession();
        if (code == null || code.isBlank()) {
            session.setErrcode(-1L);
            session.setErrmsg("code 不能为空");
            return session;
        }
        String url = OAUTH_ACCESS_TOKEN_URL
                + "?appid=" + openAppid
                + "&secret=" + openSecret
                + "&code=" + code
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
