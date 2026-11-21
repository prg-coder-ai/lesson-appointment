package com.classroom.rtc;

import com.classroom.common.RoleConst;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 原生 WebRTC（MESH）provider —— 默认实现，零外部依赖、零厂商账号。
 *
 * <p><b>能力边界</b>（必须让调用方知道，不能假装和 SFU 一样）：
 * 浏览器两两直连，N 个人每人要发 N-1 路上行；6 人以上浏览器上行与 CPU 就顶不住。
 * 因此 {@link #maxPeers} 是硬约束，前端达到上限后只收不发。
 *
 * <p><b>NAT 穿透</b>：仅靠公网 STUN，对称型 NAT / 企业防火墙下会有 20%~30% 的连不上。
 * 生产必须自建 coturn（{@code turnUrls} + {@code turnSecret}）：
 * 用 <b>REST 临时凭证</b>（HMAC-SHA1(secret, "过期时间:userId")）而不是固定账号密码——
 * 固定账号一旦泄露，任何人都能拿它当免费中继刷流量。
 */
@Slf4j
@Component
public class NativeMeshRtcProvider implements RtcProvider {

    public static final String NAME = "native-mesh";

    private final RtcProperties props;

    public NativeMeshRtcProvider(RtcProperties props) {
        this.props = props;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public RtcTopology topology() {
        return RtcTopology.MESH;
    }

    /** 原生实现永远可用：没有外部账号可缺，STUN 用公网默认值也能跑 */
    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String ensureRoom(String scheduleId) {
        // mesh 没有服务端房间，房间号只是前端的逻辑分组；幂等天然成立
        return roomIdOf(scheduleId);
    }

    @Override
    public void destroyRoom(String scheduleId) {
        // mesh 无服务端资源可释放
    }

    @Override
    public String roomIdOf(String scheduleId) {
        return "mesh-" + scheduleId;
    }

    @Override
    public RtcJoinInfo join(RtcJoinContext ctx) {
        RtcProperties.Mesh mesh = props.getMesh();
        RtcJoinInfo info = new RtcJoinInfo();
        info.setProvider(NAME);
        info.setTopology(RtcTopology.MESH.name());
        info.setRoomId(roomIdOf(ctx.scheduleId()));
        info.setUserId(ctx.userId());
        info.setRole(ctx.role());
        info.setDisplayName(ctx.displayName());
        info.setSdkType("native");
        info.setSdkUrl(null);
        info.setServerUrl(null);
        info.setToken(null);
        info.setTokenExpireAt(null);
        info.setIceServers(buildIceServers(ctx.userId(), mesh));
        info.setMaxPeers(mesh.getMaxPeers());
        info.setCanPublish(true);
        info.setCanPublishVideo(isVideoAllowed(ctx));
        info.setCanSubscribe(true);
        info.setRecordingMode("CLIENT");
        info.getExtra().put("transport", "p2p");
        info.getExtra().put("turnEnabled", !isBlank(mesh.getTurnUrls()));
        info.getExtra().put("note", "mesh 拓扑上行随人数线性增长，超过 maxPeers 的成员只收不发");
        return info;
    }

    private boolean isVideoAllowed(RtcJoinContext ctx) {
        boolean teacher = RoleConst.isTeacher(ctx.role()) || RoleConst.isManager(ctx.role());
        return teacher || props.isStudentPublishVideo();
    }

    /**
     * STUN + TURN（REST 临时凭证）。
     * 未配置 TURN 时只给 STUN —— 明确告知前端/运维「当前无中继兜底」，
     * 而不是假装穿透率 100%。
     */
    private List<RtcJoinInfo.IceServer> buildIceServers(String userId, RtcProperties.Mesh mesh) {
        List<RtcJoinInfo.IceServer> list = new ArrayList<>();

        RtcJoinInfo.IceServer stun = new RtcJoinInfo.IceServer();
        stun.setUrls(new ArrayList<>(mesh.getStunServers()));
        list.add(stun);

        if (!isBlank(mesh.getTurnUrls()) && !isBlank(mesh.getTurnSecret())) {
            long expiry = Instant.now().getEpochSecond() + Math.max(60, mesh.getTurnTtlSeconds());
            // coturn REST API 约定：username = "<过期unixtime>:<标识>"，credential = base64(HMAC-SHA1(secret, username))
            String username = expiry + ":" + sanitizeUser(userId);
            String credential = RtcSigning.base64(
                    RtcSigning.hmacSha1(mesh.getTurnSecret(), username));

            RtcJoinInfo.IceServer turn = new RtcJoinInfo.IceServer();
            List<String> urls = new ArrayList<>();
            for (String u : mesh.getTurnUrls().split(",")) {
                if (!isBlank(u)) urls.add(u.trim());
            }
            turn.setUrls(urls);
            turn.setUsername(username);
            turn.setCredential(credential);
            list.add(turn);
            log.debug("TURN 临时凭证已签发: userId={}, expiry={}", userId, expiry);
        } else if (isBlank(mesh.getTurnUrls())) {
            log.debug("未配置 TURN，仅下发 STUN；对称型 NAT 下可能无法建连");
        }
        return list;
    }

    /** TURN 用户名不能带冒号（会被 coturn 当成时间戳分隔符） */
    private String sanitizeUser(String userId) {
        return userId == null ? "anon" : userId.replace(":", "_");
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
