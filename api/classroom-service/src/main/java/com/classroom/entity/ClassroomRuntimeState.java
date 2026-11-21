package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 课堂实时运行时态（落库侧）。
 *
 * <p>仅持久化「需跨重启/进房恢复」的服务器强控状态——当前为全员禁言（mute_all）。
 * 举手集合 / 摄像头状态 / 白板授权 / 白板快照等高频变更态走内存 {@code ClassroomLiveState}，
 * 其审计轨迹写入 {@code classroom_session_record.event_log}，重启后由事件流水可回溯，无需单列落库。</p>
 */
@Data
@TableName("classroom_runtime_state")
public class ClassroomRuntimeState {
    @TableId(type = IdType.INPUT)
    private String scheduleId;
    private Boolean muteAll;
    private LocalDateTime updatedAt;
}
