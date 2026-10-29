package com.classroom.service;

import com.classroom.entity.ClassroomRuntimeState;
import com.classroom.mapper.ClassroomRuntimeStateMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 课堂实时运行时态（内存权威态 + 部分落库）。
 *
 * <p><b>P1 教学闭环的核心状态机</b>：把原本只存在前端、刷新即丢的「全员禁言 / 举手 / 摄像头 / 白板协作授权 /
 * 白板快照」收拢为服务端权威态。新成员进房时由对应 handler 把当前态下发，彻底消除
 * 「迟到者/刷新者收不到禁言与摄像头状态」的 bug。</p>
 *
 * <p>设计取舍：高频变更态（举手/摄像头/白板）放内存，审计轨迹写入 {@code classroom_session_record.event_log}；
 * 只有「全员禁言」做 DB 落库（{@code classroom_runtime_state}），因为它的语义最重、且需要重启后恢复。</p>
 */
@Slf4j
@Service
public class ClassroomLiveState {

    private final ClassroomRuntimeStateMapper rtMapper;

    /** scheduleId -> 全员禁言 */
    private final Map<String, Boolean> muteAll = new ConcurrentHashMap<>();
    /** scheduleId -> (userId -> 是否举手) */
    private final Map<String, Map<String, Boolean>> handRaised = new ConcurrentHashMap<>();
    /** scheduleId -> (userId -> 摄像头是否关闭) */
    private final Map<String, Map<String, Boolean>> cameraOff = new ConcurrentHashMap<>();
    /** scheduleId -> 被授权编辑白板的学生 userId 集合 */
    private final Map<String, Set<String>> wbGrants = new ConcurrentHashMap<>();
    /** scheduleId -> 当前白板快照(JSON)，用于重连下发与落盘 */
    private final Map<String, String> wbSnapshot = new ConcurrentHashMap<>();

    public ClassroomLiveState(ClassroomRuntimeStateMapper rtMapper) {
        this.rtMapper = rtMapper;
    }

    // ------------------------------------------------------------------
    // 全员禁言（内存 + 落库）
    // ------------------------------------------------------------------

    /** 进房/重连时加载 DB 中已持久化的禁言态，保证重启后可恢复 */
    public void ensureMuteLoaded(String scheduleId) {
        if (muteAll.containsKey(scheduleId)) return;
        try {
            ClassroomRuntimeState r = rtMapper.selectById(scheduleId);
            muteAll.put(scheduleId, r != null && Boolean.TRUE.equals(r.getMuteAll()));
        } catch (Exception e) {
            muteAll.put(scheduleId, false);
        }
    }

    public boolean isMuted(String scheduleId) {
        return muteAll.getOrDefault(scheduleId, false);
    }

    public void setMuted(String scheduleId, boolean muted) {
        muteAll.put(scheduleId, muted);
        try {
            ClassroomRuntimeState r = rtMapper.selectById(scheduleId);
            if (r == null) {
                r = new ClassroomRuntimeState();
                r.setScheduleId(scheduleId);
                r.setMuteAll(muted);
                r.setUpdatedAt(LocalDateTime.now());
                rtMapper.insert(r);
            } else {
                r.setMuteAll(muted);
                r.setUpdatedAt(LocalDateTime.now());
                rtMapper.updateById(r);
            }
        } catch (Exception e) {
            log.warn("全员禁言落库失败(内存态仍生效): scheduleId={}, muted={}", scheduleId, muted);
        }
    }

    // ------------------------------------------------------------------
    // 举手
    // ------------------------------------------------------------------

    public void setHand(String scheduleId, String userId, boolean raised) {
        Map<String, Boolean> m = handRaised.computeIfAbsent(scheduleId, k -> new ConcurrentHashMap<>());
        if (raised) m.put(userId, true);
        else m.remove(userId);
    }

    public Map<String, Boolean> hands(String scheduleId) {
        return handRaised.getOrDefault(scheduleId, Collections.emptyMap());
    }

    // ------------------------------------------------------------------
    // 摄像头
    // ------------------------------------------------------------------

    public void setCamera(String scheduleId, String userId, boolean off) {
        Map<String, Boolean> m = cameraOff.computeIfAbsent(scheduleId, k -> new ConcurrentHashMap<>());
        if (off) m.put(userId, true);
        else m.remove(userId);
    }

    public Map<String, Boolean> cameras(String scheduleId) {
        return cameraOff.getOrDefault(scheduleId, Collections.emptyMap());
    }

    // ------------------------------------------------------------------
    // 白板协作授权
    // ------------------------------------------------------------------

    public void grantWhiteboard(String scheduleId, String userId) {
        wbGrants.computeIfAbsent(scheduleId, k -> ConcurrentHashMap.newKeySet()).add(userId);
    }

    public void revokeWhiteboard(String scheduleId, String userId) {
        Set<String> s = wbGrants.get(scheduleId);
        if (s != null) s.remove(userId);
    }

    public boolean canEditWhiteboard(String scheduleId, String userId, boolean isTeacher) {
        return isTeacher || wbGrants.getOrDefault(scheduleId, Collections.emptySet()).contains(userId);
    }

    /** 仅看该用户是否已被授予白板编辑权（进房下发用，不含教师默认权） */
    public boolean isWhiteboardGranted(String scheduleId, String userId) {
        return wbGrants.getOrDefault(scheduleId, Collections.emptySet()).contains(userId);
    }

    // ------------------------------------------------------------------
    // 白板快照
    // ------------------------------------------------------------------

    public String getWhiteboardSnapshot(String scheduleId) {
        return wbSnapshot.get(scheduleId);
    }

    public void setWhiteboardSnapshot(String scheduleId, String snapshot) {
        wbSnapshot.put(scheduleId, snapshot);
    }
}
