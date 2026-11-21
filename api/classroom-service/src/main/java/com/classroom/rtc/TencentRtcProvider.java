package com.classroom.rtc;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.zip.Deflater;

/**
 * 腾讯云 TRTC provider（商用 SFU）。
 *
 * <p>凭证是官方 UserSig v2：{@code base64(zlib(json))}，json 里的 {@code TLS.sig}
 * 是 {@code base64(HMAC-SHA256(secretKey, "TLS.identifier:<uid>\nTLS.sdkappid:<id>\nTLS.time:<ts>\nTLS.expire:<exp>\n"))}。
 * 纯 JDK 实现，不引入腾讯 SDK——少一个依赖就少一处供应链风险。
 *
 * <p><b>房间号</b>：TRTC 数字房间号是 32 位无符号整数，而我们的 scheduleId 是字符串。
 * 这里用 CRC32 派生一个稳定的数字房间号（同 scheduleId 永远同一房间），
 * 同时把原始 scheduleId 放进 {@code extra.strRoomId} 供排查。
 */
@Slf4j
@Component
public class TencentRtcProvider implements RtcProvider {

    public static final String NAME = "trtc";

    private final RtcProperties props;

    public TencentRtcProvider(RtcProperties props) {
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
        RtcProperties.Trtc c = props.getTrtc();
        return c.getSdkAppId() > 0 && !isBlank(c.getSecretKey());
    }

    @Override
    public String unavailableReason() {
        RtcProperties.Trtc c = props.getTrtc();
        if (c.getSdkAppId() <= 0) return "缺少 classroom.rtc.trtc.sdk-app-id";
        if (isBlank(c.getSecretKey())) return "缺少 classroom.rtc.trtc.secret-key";
        return null;
    }

    @Override
    public String roomIdOf(String scheduleId) {
        return numericRoomId(scheduleId);
    }

    @Override
    public String ensureRoom(String scheduleId) {
        return numericRoomId(scheduleId);
    }

    @Override
    public void destroyRoom(String scheduleId) {
        // TRTC 房间无人自动解散；强制解散需调用 REST API（需管理员密钥，暂不接入主链路）
        log.debug("TRTC 房间随最后一个用户退出自动解散: {}", numericRoomId(scheduleId));
    }

    @Override
    public RtcJoinInfo join(RtcJoinContext ctx) {
        RtcProperties.Trtc c = props.getTrtc();
        long now = Instant.now().getEpochSecond();
        long expire = Math.max(60, c.getExpireSeconds());

        RtcJoinInfo info = new RtcJoinInfo();
        info.setProvider(NAME);
        info.setTopology(RtcTopology.SFU.name());
        info.setRoomId(numericRoomId(ctx.scheduleId()));
        info.setUserId(ctx.userId());
        info.setRole(ctx.role());
        info.setDisplayName(displayName(ctx));
        info.setSdkType("trtc");
        info.setSdkUrl(c.getSdkUrl());
        info.setServerUrl(String.valueOf(c.getSdkAppId()));
        info.setToken(buildUserSig(c.getSdkAppId(), c.getSecretKey(), ctx.userId(), now, expire));
        info.setTokenExpireAt(now + expire);
        info.setCanPublish(ctx.canPublish());
        info.setCanPublishVideo(ctx.canPublishVideo());
        info.setCanSubscribe(true);
        info.setRecordingMode("CLOUD");
        info.getExtra().put("transport", "sfu");
        info.getExtra().put("strRoomId", ctx.scheduleId());
        info.getExtra().put("sdkAppId", c.getSdkAppId());
        return info;
    }

    /** CRC32 派生 32 位无符号数字房间号（稳定、无需查表、不同 scheduleId 碰撞概率极低） */
    private String numericRoomId(String scheduleId) {
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(("classroom:" + scheduleId).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        // TRTC 要求 1 ~ 4294967294；避开 0 与全 1
        long v = crc.getValue() % 4294967294L + 1;
        return String.valueOf(v);
    }

    String buildUserSig(long sdkAppId, String secretKey, String userId, long ts, long expire) {
        String content = "TLS.identifier:" + userId + "\n"
                + "TLS.sdkappid:" + sdkAppId + "\n"
                + "TLS.time:" + ts + "\n"
                + "TLS.expire:" + expire + "\n";
        String sig = RtcSigning.base64(RtcSigning.hmacSha256(secretKey, content));
        String json = "{\"TLS.ver\":\"2.0\","
                + "\"TLS.identifier\":\"" + userId + "\","
                + "\"TLS.sdkappid\":" + sdkAppId + ","
                + "\"TLS.expire\":" + expire + ","
                + "\"TLS.time\":" + ts + ","
                + "\"TLS.sig\":\"" + sig + "\"}";
        return RtcSigning.base64(deflate(json.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private byte[] deflate(byte[] raw) {
        Deflater deflater = new Deflater();
        deflater.setInput(raw);
        deflater.finish();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        try {
            while (!deflater.finished()) {
                int n = deflater.deflate(buf);
                out.write(buf, 0, n);
            }
        } finally {
            deflater.end();
        }
        return out.toByteArray();
    }

    private String displayName(RtcJoinContext ctx) {
        return isBlank(ctx.displayName()) ? ctx.userId() : ctx.displayName();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
