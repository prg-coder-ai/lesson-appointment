package com.classroom.rtc;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * RTC 选型配置（{@code classroom.rtc.*}）。
 *
 * <p><b>切换点只有一个</b>：{@code classroom.rtc.provider}。取值
 * {@code native-mesh}（默认，零依赖）/ {@code livekit}（自建或云托管 SFU）/
 * {@code trtc}（腾讯云）/ {@code agora}（声网）。
 *
 * <p><b>降级是设计姿态，不是异常</b>：任何厂商 provider 只要关键凭证缺失
 * （{@link RtcProvider#available()} 为 false），注册表自动回落 {@code native-mesh}，
 * 课堂照常能上——宁可少一路清晰度，不可整堂课打不开。降级事实会在
 * {@code GET /api/v1/rtc/providers} 与启动日志里显式暴露，不静默。
 */
@Data
@Component
@ConfigurationProperties(prefix = "classroom.rtc")
public class RtcProperties {

    /** native-mesh | livekit | trtc | agora */
    private String provider = "native-mesh";

    /**
     * 学生是否允许发布视频轨道。默认 false：学生上行只留音频，
     * 一是省带宽（mesh 下学生视频会让上行翻倍），二是课堂场景本就不需要。
     */
    private boolean studentPublishVideo = false;

    private Mesh mesh = new Mesh();
    private Livekit livekit = new Livekit();
    private Trtc trtc = new Trtc();
    private Agora agora = new Agora();

    /** 原生 WebRTC（STUN/TURN + 浏览器两两直连） */
    @Data
    public static class Mesh {
        /** STUN 服务器列表（公网 STUN 只能做 NAT 探测，穿透失败必须有 TURN 兜底） */
        private List<String> stunServers = new ArrayList<>(List.of("stun:stun.l.google.com:19302"));
        /** TURN 地址，逗号分隔；如 turn:turn.example.com:3478?transport=udp */
        private String turnUrls = "";
        /** TURN 共享密钥（coturn 的 static-auth-secret，走 REST 临时凭证，不落固定账号密码） */
        private String turnSecret = "";
        /** TURN 临时凭证有效期（秒） */
        private int turnTtlSeconds = 3600;
        /** mesh 人数上限；超过的成员只收不发（前端据此停止新 peer 连接） */
        private int maxPeers = 6;
    }

    /** LiveKit（开源 SFU，官方云或自建均可，token 为 HS256 JWT） */
    @Data
    public static class Livekit {
        /** wss://your-project.livekit.cloud 或 wss://livekit.internal:7880 */
        private String url = "";
        private String apiKey = "";
        private String apiSecret = "";
        private int tokenTtlSeconds = 7200;
        /** 浏览器 SDK（UMD），默认 jsDelivr；内网部署可改成本地路径 */
        private String sdkUrl = "https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js";
    }

    /** 腾讯云 TRTC（UserSig v2：HMAC-SHA256 + zlib + base64） */
    @Data
    public static class Trtc {
        private long sdkAppId = 0L;
        private String secretKey = "";
        private int expireSeconds = 7200;
        private String sdkUrl = "https://web.sdk.qcloud.com/trtc/webrtc/v5/trtc.js";
    }

    /** 声网 Agora（token 由官方 token builder 生成，未引入依赖时自动降级） */
    @Data
    public static class Agora {
        private String appId = "";
        private String appCertificate = "";
        private int tokenTtlSeconds = 7200;
        private String sdkUrl = "https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js";
    }
}
