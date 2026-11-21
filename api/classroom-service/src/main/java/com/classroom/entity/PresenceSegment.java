package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 在线区间：一次「进入 → 离开」记一段。
 *
 * <p>为什么需要独立表：{@link Membership} 是 {@code (schedule_id,user_id)} 单行，
 * 只保留最后一次 join/leave，装不下「多次进出」；而有效时长必须按区间累加
 * （需求 F2-03），否则无法区分「一直在」与「走了又回来」。
 *
 * <p>{@code leaveAt == null} 表示该段尚未闭合（人在线或异常掉线未收到 leave），
 * 下课收尾时统一按 actualEnd 闭合。
 */
@Data
@TableName("classroom_presence_segment")
public class PresenceSegment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String scheduleId;
    private String userId;
    private LocalDateTime joinAt;
    private LocalDateTime leaveAt;
    private String leaveReason;
    private LocalDateTime createdAt;
}
