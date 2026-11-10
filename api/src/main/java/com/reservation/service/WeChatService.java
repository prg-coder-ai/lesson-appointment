package com.reservation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reservation.dto.WeChatSession;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
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

    /** 微信云托管「云调用」在容器内挂载的自签证书路径（官方文档约定值）。 */
    private static final String CLOUD_RUN_CERT_PATH = "/app/cert/certificate.crt";

    /**
     * 默认客户端：直连公网（本地开发 / 非云托管环境走这条）。
     * 云托管下会在 {@link #initHttpClient()} 里替换成信任平台证书的版本。
     */
    private HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * 云托管「云调用」链路适配（2026-11-10）。
     *
     * <p>故障背景：微信绑定接口报
     * {@code PKIX path building failed: unable to find valid certification path}。
     * 排查发现容器里 {@code api.weixin.qq.com} 被解析到 {@code 169.254.10.1}，
     * 拿到的证书 {@code subject}/{@code issuer} 都是 {@code CN=api.weixin.qq.com} ——
     * 即**平台自签**，不是微信真实的 DigiCert 证书。
     *
     * <p>原因（微信云托管官方说明）：为了让容器内的后端能以 HTTPS 访问微信开放接口，
     * 云调用会在容器内安装一张 api.weixin.qq.com 的自签证书，仅容器内有效；
     * 系统层面靠 {@code update-ca-certificates} 生效，但 <b>JVM 用的是自己的 truststore，
     * 不会读系统信任库</b>，所以 curl 能通、Java 不通。官方要求 Java 侧手动导入
     * {@code /app/cert/certificate.crt}。
     *
     * <p>为什么不按官方那条 {@code keytool -importcert} 来：
     * <ol>
     *   <li>运行镜像是 JRE，<b>没有 keytool</b>（那是 JDK 的工具）；</li>
     *   <li>证书是**容器启动时**才挂进来的，构建期导入根本拿不到这个文件。</li>
     * </ol>
     * 所以改为启动时在内存里合并：「现有 truststore + 平台证书」→ 专用 SSLContext。
     *
     * <p>作用域刻意收窄到本服务的 HttpClient：不做全局放行、不改 JVM 默认 SSLContext，
     * 其他出网请求（短信、支付等）仍然走正常公网证书校验。
     */
    @PostConstruct
    public void initHttpClient() {
        Path certFile = Path.of(CLOUD_RUN_CERT_PATH);
        if (!Files.isReadable(certFile)) {
            // 本地开发、或该环境没走云调用链路 —— 保持默认客户端即可，不报错
            return;
        }
        try {
            char[] pwd = "changeit".toCharArray();
            // 基底必须是镜像里那份合成库（JDK 自带 + 系统 CA），
            // 路径优先级：启动参数 javax.net.ssl.trustStore → JDK 默认 cacerts
            KeyStore ks;
            String tsProp = System.getProperty("javax.net.ssl.trustStore");
            if (tsProp != null && Files.isReadable(Path.of(tsProp))) {
                ks = KeyStore.getInstance(Path.of(tsProp).toFile(), pwd);
            } else {
                ks = KeyStore.getInstance(
                        Path.of(System.getProperty("java.home"), "lib", "security", "cacerts").toFile(), pwd);
            }

            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            int added = 0;
            try (InputStream in = Files.newInputStream(certFile)) {
                for (Certificate c : cf.generateCertificates(in)) {
                    ks.setCertificateEntry("wechat-cloudrun-" + (added++), c);
                }
            }
            if (added == 0) {
                log.warn("云托管证书文件 {} 里没有解析出证书，微信接口可能仍然 PKIX 失败", certFile);
                return;
            }

            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, tmf.getTrustManagers(), null);
            this.httpClient = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .sslContext(ctx)
                    .build();
            log.info("已加载云托管自签证书 {} 张（{}），微信接口改走平台网关信任链", added, certFile);
        } catch (Exception e) {
            // 绝不因为加载失败把服务启不起来：保持默认客户端，让微信链路自己报错
            log.warn("加载云托管自签证书失败（{}）：{}", certFile, e.getMessage());
        }
    }

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
