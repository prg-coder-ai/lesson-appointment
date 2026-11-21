package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 对账差异（F7-05）。
 *
 * <p>存在意义：日终对账不能只打一行日志。差异必须<b>落库、可查、可处置</b>，
 * 否则「昨天有 3 节课没回流课时」这件事在下一次部署后就彻底消失了。
 */
@Data
@TableName("classroom_reconcile_diff")
public class ReconcileDiff {

    @TableId(type = IdType.ASSIGN_ID)
    private Long diffId;

    private String scheduleId;

    /** MISSING_CALLBACK / CALLBACK_FAILED / VERSION_GAP / STATUS_MISMATCH / DURATION_MISMATCH */
    private String diffType;

    /** WARN / ERROR（ERROR 会同时推一条告警到预约侧） */
    private String severity;

    private String detail;

    /** OPEN / RESOLVED / IGNORED */
    private String status;

    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
    private String resolvedBy;
    private String resolveNote;
}
