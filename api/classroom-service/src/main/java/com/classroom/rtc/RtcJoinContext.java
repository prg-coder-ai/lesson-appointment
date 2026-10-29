package com.classroom.rtc;

/**
 * 加入媒体房间的上下文（provider 入参）。
 *
 * <p>刻意不含任何「客户端可指定」的字段：房间号由 {@code scheduleId} 派生、
 * userId/role 由令牌解析，客户端无法通过参数把自己塞进别人的房间，
 * 也无法伪造角色去拿「可发布」的凭证。
 *
 * @param scheduleId 课次 id（房间号的唯一来源）
 * @param userId     当前用户（令牌解析结果）
 * @param role       当前角色（令牌解析结果）
 * @param displayName 展示名（可空，providers 用它做 SDK 里显示的用户名）
 * @param canPublish 是否允许发布音视频（教师/管理员 true；学生音频 true、视频看配置）
 * @param canPublishVideo 是否允许发布视频轨道（教师 true；学生默认 false，避免上行爆炸）
 */
public record RtcJoinContext(String scheduleId,
                             String userId,
                             String role,
                             String displayName,
                             boolean canPublish,
                             boolean canPublishVideo) {
}
