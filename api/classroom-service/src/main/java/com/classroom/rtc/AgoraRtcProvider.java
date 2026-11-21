package com.classroom.rtc;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.zip.CRC32;

/**
 * 声网 Agora provider（商用 SaaS SFU）。
 *
 * <p>声网的进房 token 算法（AccessToken2：AES + HMAC + pack）实现成本高且极易签错，
 * 所以这里<b>不自己实现</b>，而是反射调用官方 {@code agora-token-builder}：
 * {@code ivy:io.agora:authentication}（Maven 坐标 {@code io.agora:authentication:2.x}）。
 * 未引入该依赖时 {@link #available()} 返回 false，注册表自动降级 native-mesh——
 * 不会因为没装一个 jar 就让课堂打不开。
 *
 * <p>引入方式（按需，不默认加进 pom，避免给不用声网的部署拖大安装包）：
 * <pre>
 *   &lt;dependency&gt;
 *     &lt;groupId&gt;io.agora&lt;/groupId&gt;
 *     &lt;artifactId&gt;authentication&lt;/artifactId&gt;
 *     &lt;version&gt;2.0.2&lt;/version&gt;
 *   &lt;/dependency&gt;
 * </pre>
 */
@Slf4j
@Component
public class AgoraRtcProvider implements RtcProvider {

    public static final String NAME = "agora";

    /** RtcTokenBuilder2.Role_PUBLISHER */
    private static final int ROLE_PUBLISHER = 1;

    private static final String TOKEN_BUILDER = "io.agora.media.RtcTokenBuilder2";

    private final RtcProperties props;

    /** 反射结果缓存：类不存在时不必每次进房都吃一次 ClassNotFoundException */
    private volatile Boolean builderPresent;

    public AgoraRtcProvider(RtcProperties props) {
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
        RtcProperties.Agora c = props.getAgora();
        return !isBlank(c.getAppId()) && !isBlank(c.getAppCertificate()) && hasTokenBuilder();
    }

    @Override
    public String unavailableReason() {
        RtcProperties.Agora c = props.getAgora();
        if (isBlank(c.getAppId())) return "缺少 classroom.rtc.agora.app-id";
        if (isBlank(c.getAppCertificate())) return "缺少 classroom.rtc.agora.app-certificate";
        if (!hasTokenBuilder()) return "未引入 io.agora:authentication（token builder）";
        return null;
    }

    /**
     * 声网频道名限 64 字节且只允许有限字符集，scheduleId 不可直接使用。
     * 用 CRC32 十六进制保证唯一性，再拼一段净化后的尾部便于人工对账。
     */
    @Override
    public String roomIdOf(String scheduleId) {
        CRC32 crc = new CRC32();
        crc.update(scheduleId.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String hash = Long.toHexString(crc.getValue());
        String tail = scheduleId.replaceAll("[^a-zA-Z0-9]", "");
        if (tail.length() > 16) tail = tail.substring(tail.length() - 16);
        return "c" + hash + "_" + tail;
    }

    @Override
    public String ensureRoom(String scheduleId) {
        return roomIdOf(scheduleId);
    }

    @Override
    public void destroyRoom(String scheduleId) {
        // 声网频道无人数自动销毁；强制踢人走 RESTful API（商用侧的运维动作）
        log.debug("声网频道无人自动关闭: {}", roomIdOf(scheduleId));
    }

    @Override
    public RtcJoinInfo join(RtcJoinContext ctx) {
        RtcProperties.Agora c = props.getAgora();
        String channel = roomIdOf(ctx.scheduleId());
        int ttl = Math.max(60, c.getTokenTtlSeconds());
        long now = Instant.now().getEpochSecond();

        RtcJoinInfo info = new RtcJoinInfo();
        info.setProvider(NAME);
        info.setTopology(RtcTopology.SFU.name());
        info.setRoomId(channel);
        info.setUserId(ctx.userId());
        info.setRole(ctx.role());
        info.setDisplayName(displayName(ctx));
        info.setSdkType("agora");
        info.setSdkUrl(c.getSdkUrl());
        info.setServerUrl(c.getAppId());
        info.setToken(buildToken(c.getAppId(), c.getAppCertificate(), channel, ctx, ttl));
        info.setTokenExpireAt(now + ttl);
        info.setCanPublish(ctx.canPublish());
        info.setCanPublishVideo(ctx.canPublishVideo());
        info.setCanSubscribe(true);
        info.setRecordingMode("CLOUD");
        info.getExtra().put("transport", "sfu");
        info.getExtra().put("uidRole", ctx.canPublish() ? "publisher" : "subscriber");
        return info;
    }

    /** 反射调用 buildTokenWithUserAccount(appId, appCert, channel, account, role, tokenExpire, privilegeExpire) */
    private String buildToken(String appId, String appCert, String channel, RtcJoinContext ctx, int ttl) {
        try {
            Class<?> clz = Class.forName(TOKEN_BUILDER);
            Object builder = clz.getConstructor().newInstance();
            Method m = clz.getMethod("buildTokenWithUserAccount",
                    String.class, String.class, String.class, String.class,
                    int.class, int.class, int.class);
            Object token = m.invoke(builder, appId, appCert, channel, account(ctx),
                    ROLE_PUBLISHER, ttl, ttl);
            return token == null ? null : token.toString();
        } catch (ClassNotFoundException e) {
            throw new IllegalStateException("未引入声网 token builder，无法签发 token", e);
        } catch (Exception e) {
            throw new IllegalStateException("声网 token 签发失败: " + e.getMessage(), e);
        }
    }

    /** 声网 user account 只允许字母数字下划线，长度 ≤ 255 */
    private String account(RtcJoinContext ctx) {
        String uid = ctx.userId() == null ? "anon" : ctx.userId().replaceAll("[^a-zA-Z0-9_]", "_");
        return uid.length() > 200 ? uid.substring(0, 200) : uid;
    }

    private boolean hasTokenBuilder() {
        Boolean cached = builderPresent;
        if (cached != null) return cached;
        boolean present;
        try {
            Class.forName(TOKEN_BUILDER);
            present = true;
        } catch (ClassNotFoundException e) {
            present = false;
        }
        builderPresent = present;
        if (!present) {
            log.info("声网 token builder 未引入，agora provider 将在选型时被跳过");
        }
        return present;
    }

    private String displayName(RtcJoinContext ctx) {
        return isBlank(ctx.displayName()) ? ctx.userId() : ctx.displayName();
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
