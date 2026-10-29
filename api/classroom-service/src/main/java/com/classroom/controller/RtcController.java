package com.classroom.controller;

import com.classroom.common.Result;
import com.classroom.entity.Membership;
import com.classroom.rtc.RtcJoinInfo;
import com.classroom.rtc.RtcProperties;
import com.classroom.rtc.RtcProviderRegistry;
import com.classroom.security.AuthContext;
import com.classroom.security.ClassroomAccessGuard;
import com.classroom.service.MediaService;
import com.classroom.service.MembershipService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 媒体接入接口（F4-01 / F4-02）。
 *
 * <p>客户端「进课堂」后先拉这里拿进房配置，再决定用哪套引擎：
 * {@code topology=MESH} → 浏览器原生 WebRTC 两两直连；
 * {@code topology=SFU} → 加载 {@code sdkUrl} 指向的厂商 SDK 并用 {@code token} 进房。
 * 前端不感知厂商，后端换 provider 对前端零影响。
 */
@RestController
@RequestMapping("/api/v1")
public class RtcController {

    private final MediaService mediaService;
    private final RtcProviderRegistry registry;
    private final RtcProperties rtcProperties;
    private final MembershipService membershipService;
    private final ClassroomAccessGuard accessGuard;

    public RtcController(MediaService mediaService,
                         RtcProviderRegistry registry,
                         RtcProperties rtcProperties,
                         MembershipService membershipService,
                         ClassroomAccessGuard accessGuard) {
        this.mediaService = mediaService;
        this.registry = registry;
        this.rtcProperties = rtcProperties;
        this.membershipService = membershipService;
        this.accessGuard = accessGuard;
    }

    /**
     * 取本课堂的进房配置。
     *
     * <p>房间号由服务端从 scheduleId 派生，客户端传不进来——避免「拿到一个 token 就能进任意房间」。
     */
    @GetMapping("/classrooms/{scheduleId}/rtc/config")
    public Result<RtcJoinInfo> config(@PathVariable String scheduleId) {
        String userId = AuthContext.currentUserId();
        String role = AuthContext.currentRole();
        accessGuard.assertAccess(scheduleId, userId, role);
        return Result.ok(mediaService.joinInfo(scheduleId, userId, role, displayName(scheduleId, userId)));
    }

    /**
     * 运维诊断：列出所有 provider 的可用性与当前生效项。
     *
     * <p>存在的理由很具体：「生产配了 livekit 却一直跑 mesh」不会有任何报错，
     * 只有把「谁在生效、谁被跳过、为什么被跳过」摊开才查得出来。
     */
    @GetMapping("/rtc/providers")
    public Result<Map<String, Object>> providers() {
        if (!AuthContext.isManager()) {
            return Result.fail(403, "仅管理员可查看媒体服务商状态");
        }
        List<Map<String, Object>> list = registry.describe();
        return Result.ok(Map.of(
                "configured", rtcProperties.getProvider() == null ? "" : rtcProperties.getProvider(),
                "active", registry.activeName(),
                "degraded", !registry.activeName().equals(rtcProperties.getProvider()),
                "providers", list
        ));
    }

    private String displayName(String scheduleId, String userId) {
        Membership m = membershipService.getOne(scheduleId, userId);
        if (m != null && m.getDisplayName() != null && !m.getDisplayName().isBlank()) {
            return m.getDisplayName();
        }
        return userId;
    }
}
