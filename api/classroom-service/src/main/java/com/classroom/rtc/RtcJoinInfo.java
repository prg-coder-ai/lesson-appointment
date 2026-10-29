package com.classroom.rtc;

import lombok.Data;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 下发给客户端的「进房配置」——RTC 抽象模型的对外契约。
 *
 * <p>前端<b>只认这个结构</b>，不认具体厂商：{@link #topology} 决定用 mesh 引擎还是 SFU 引擎，
 * {@link #sdkType} 决定要动态加载哪份 SDK，{@link #token} 是厂商凭证（原生 mesh 为空）。
 * 换服务商时后端换一个 provider 实现，前端一行不用改。
 */
@Data
public class RtcJoinInfo {

    /** provider 名：native-mesh / livekit / trtc / agora */
    private String provider;

    /** MESH / SFU */
    private String topology;

    /** 房间号（服务端派生，客户端不得自行改写） */
    private String roomId;

    private String userId;
    private String role;
    private String displayName;

    /** SDK 类型：native（浏览器原生 WebRTC，无需加载外部脚本）/ livekit / trtc / agora */
    private String sdkType;

    /** SDK 脚本地址（sdkType != native 时前端动态注入） */
    private String sdkUrl;

    /** 服务地址：livekit 的 wss 地址；trtc 的 sdkAppId；agora 的 appId */
    private String serverUrl;

    /** 进房凭证（JWT / UserSig / 声网 token）；native mesh 无凭证，为 null */
    private String token;

    /** 凭证过期时间（epoch 秒），前端可据此提前续签 */
    private Long tokenExpireAt;

    /** STUN/TURN 配置（mesh 必需；SFU 一般为空） */
    private List<IceServer> iceServers = new ArrayList<>();

    /** mesh 拓扑的人数上限（超过就不再发起新的 peer 连接，改等待教师/降级） */
    private Integer maxPeers;

    private Boolean canPublish = Boolean.TRUE;
    private Boolean canPublishVideo = Boolean.TRUE;
    private Boolean canSubscribe = Boolean.TRUE;

    /** 录制模式：CLOUD（云录制）/ CLIENT（教师端本地录制后上传）/ NONE */
    private String recordingMode = "NONE";

    /** 厂商/场景附加字段（前端按需取，不做强约束） */
    private Map<String, Object> extra = new HashMap<>();

    @Data
    public static class IceServer {
        /** 形如 stun:host:3478 / turn:host:3478?transport=udp */
        private List<String> urls;
        private String username;
        private String credential;
    }
}
