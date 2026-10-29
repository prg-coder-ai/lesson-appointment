package com.classroom.service;

import com.classroom.common.RoleConst;
import com.classroom.recording.RecordingBackendRegistry;
import com.classroom.rtc.RtcJoinContext;
import com.classroom.rtc.RtcJoinInfo;
import com.classroom.rtc.RtcProperties;
import com.classroom.rtc.RtcProviderRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 媒体服务：课堂主链路与 RTC 抽象层之间的唯一入口。
 *
 * <p>历史包袱说明：本类在 M1 阶段是三个 stub 方法（{@code createRoom/destroyRoom/generateJoinToken}），
 * 零调用者。现在它退化为「薄门面」——真正的选型与凭证签发在
 * {@link RtcProviderRegistry} 与各 provider 里，业务代码只跟这里打交道，
 * 因此换服务商不会波及课堂生命周期、控制器、前端任何一行。
 *
 * <p>对外仍是三个老方法（保持兼容）+ 一个新的 {@link #joinInfo}。
 */
@Slf4j
@Service
public class MediaService {

    private final RtcProviderRegistry registry;
    private final RtcProperties rtcProperties;
    private final RecordingBackendRegistry recordingRegistry;

    public MediaService(RtcProviderRegistry registry,
                        RtcProperties rtcProperties,
                        RecordingBackendRegistry recordingRegistry) {
        this.registry = registry;
        this.rtcProperties = rtcProperties;
        this.recordingRegistry = recordingRegistry;
    }

    /** 幂等建房（开课时调；provider 内部可能什么都不做，如 mesh） */
    public String createRoom(String scheduleId) {
        String room = registry.ensureRoom(scheduleId);
        log.info("媒体房间就绪: scheduleId={}, provider={}, roomId={}",
                scheduleId, registry.activeName(), room);
        return room;
    }

    /** 幂等销毁（下课/收尾调；失败不抛出，不能阻断下课） */
    public void destroyRoom(String scheduleId) {
        registry.destroyRoom(scheduleId);
        log.info("媒体房间已释放: scheduleId={}, provider={}", scheduleId, registry.activeName());
    }

    /**
     * 生成进房配置。
     *
     * <p>权限口径：<b>所有成员都可以发布音频</b>（学生要能举手开麦、被老师点名答到），
     * 但「能不能真的出声」由服务端禁言态（{@code classroom_runtime_state.mute_all}）
     * 在信令层强制，不靠客户端自觉。视频只有教师/管理员发布，学生视频由
     * {@code classroom.rtc.student-publish-video} 开关控制（默认关，省上行）。
     */
    public RtcJoinInfo joinInfo(String scheduleId, String userId, String role, String displayName) {
        boolean managerLike = RoleConst.isTeacher(role) || RoleConst.isManager(role)
                || RoleConst.SYSTEM.equals(role);
        boolean canPublishVideo = managerLike || rtcProperties.isStudentPublishVideo();
        RtcJoinInfo info = registry.join(
                new RtcJoinContext(scheduleId, userId, role, displayName, true, canPublishVideo));
        // 录制模式以录制后端的真实选型为准（provider 给的只是「该拓扑通常能做什么」）
        info.setRecordingMode(recordingRegistry.activeMode());
        log.info("进房配置签发: scheduleId={}, userId={}, role={}, provider={}, topology={}, publishVideo={}",
                scheduleId, userId, role, info.getProvider(), info.getTopology(), info.getCanPublishVideo());
        return info;
    }

    /** 兼容旧签名：等价于 joinInfo(...).getToken()，mesh 下为 null（原生直连无需凭证） */
    public String generateJoinToken(String scheduleId, String userId, String role) {
        return joinInfo(scheduleId, userId, role, userId).getToken();
    }

    public String activeProvider() {
        return registry.activeName();
    }
}
