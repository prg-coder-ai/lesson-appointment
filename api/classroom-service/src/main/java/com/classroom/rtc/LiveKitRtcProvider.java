package com.classroom.rtc;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * LiveKit provider（开源 SFU，可自建也可用官方云）。
 *
 * <p>选它作为「商用/自建 SFU」的首选参考实现，原因很实际：
 * <ul>
 *   <li>能私有化——课堂音视频不走第三方，数据不出网；</li>
 *   <li>凭证是标准 JWT，服务端零 SDK 依赖（本类只用 {@code javax.crypto}）；</li>
 *   <li>支持服务端 egress 云录制，录制链路可复用同一套凭证体系。</li>
 * </ul>
 *
 * <p>JWT 的 {@code video} claim 是<b>权限载体</b>：{@code canPublish} 由角色决定，
 * 学生即使拿到 token 也改不了自己能不能推流；{@code room} 由 scheduleId 派生，
 * 学生无法凭 token 进别人的课堂。
 */
@Slf4j
@Component
public class LiveKitRtcProvider implements RtcProvider {

    public static final String NAME = "livekit";

    private final RtcProperties props;

    public LiveKitRtcProvider(RtcProperties props) {
        this.props = props;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public RtcTopology topology() {
        return RtcTopology.SFU;
    }

    @Override
    public boolean available() {
        RtcProperties.Livekit c = props.getLivekit();
        return !isBlank(c.getUrl()) && !isBlank(c.getApiKey()) && !isBlank(c.getApiSecret());
    }

    @Override
    public String unavailableReason() {
        RtcProperties.Livekit c = props.getLivekit();
        if (isBlank(c.getUrl())) return "缺少 classroom.rtc.livekit.url";
        if (isBlank(c.getApiKey())) return "缺少 classroom.rtc.livekit.api-key";
        if (isBlank(c.getApiSecret())) return "缺少 classroom.rtc.livekit.api-secret";
        return null;
    }

    @Override
    public String roomIdOf(String scheduleId) {
        // LiveKit 房间名允许字母数字与 -_，scheduleId 直接可用；加前缀便于在后台区分来源
        return "classroom-" + scheduleId;
    }

    @Override
    public String ensureRoom(String scheduleId) {
        // LiveKit 房间由首个参与者自动创建（RoomService 可选），此处只回房间名，天然幂等
        return roomIdOf(scheduleId);
    }

    @Override
    public void destroyRoom(String scheduleId) {
        // 无人时房间自动回收；需要强制踢人时走 RoomService（运维工具，不在课堂主链路）
        log.debug("LiveKit 房间随最后一个参与者离开自动回收: {}", roomIdOf(scheduleId));
    }

    @Override
    public RtcJoinInfo join(RtcJoinContext ctx) {
        RtcProperties.Livekit c = props.getLivekit();
        String room = roomIdOf(ctx.scheduleId());
        long now = Instant.now().getEpochSecond();
        long exp = now + Math.max(60, c.getTokenTtlSeconds());

        String token = buildToken(c.getApiKey(), c.getApiSecret(), room, ctx, now, exp);

        RtcJoinInfo info = new RtcJoinInfo();
        info.setProvider(NAME);
        info.setTopology(RtcTopology.SFU.name());
        info.setRoomId(room);
        info.setUserId(ctx.userId());
        info.setRole(ctx.role());
        info.setDisplayName(ctx.displayName());
        info.setSdkType("livekit");
        info.setSdkUrl(c.getSdkUrl());
        info.setServerUrl(c.getUrl());
        info.setToken(token);
        info.setTokenExpireAt(exp);
        info.setMaxPeers(null); // SFU 无人数上限，由服务器容量决定
        info.setCanPublish(ctx.canPublish());
        info.setCanPublishVideo(ctx.canPublishVideo());
        info.setCanSubscribe(true);
        info.setRecordingMode("CLOUD");
        info.getExtra().put("transport", "sfu");
        info.getExtra().put("echoCancellation", true);
        return info;
    }

    private String buildToken(String apiKey, String apiSecret, String room,
                              RtcJoinContext ctx, long now, long exp) {
        String header = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String metadata = "{\\\"role\\\":\\\"" + escape(ctx.role()) + "\\\"}";
        String payload = "{"
                + "\"iss\":\"" + escape(apiKey) + "\","
                + "\"sub\":\"" + escape(ctx.userId()) + "\","
                + "\"name\":\"" + escape(displayName(ctx)) + "\","
                + "\"nbf\":" + (now - 10) + ","
                + "\"exp\":" + exp + ","
                + "\"metadata\":\"" + metadata + "\","
                + "\"video\":{"
                + "\"roomJoin\":true,"
                + "\"room\":\"" + escape(room) + "\","
                + "\"canPublish\":" + ctx.canPublish() + ","
                + "\"canPublishData\":true,"
                + "\"canSubscribe\":true"
                + "}"
                + "}";
        String signingInput = RtcSigning.base64Url(header) + "." + RtcSigning.base64Url(payload);
        String signature = RtcSigning.base64Url(
                RtcSigning.hmacSha256(apiSecret, signingInput));
        return signingInput + "." + signature;
    }

    private String displayName(RtcJoinContext ctx) {
        return isBlank(ctx.displayName()) ? ctx.userId() : ctx.displayName();
    }

    /** JWT 里嵌的是 JSON 字符串，双引号与反斜杠必须转义，否则 token 直接解不出 */
    private String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
