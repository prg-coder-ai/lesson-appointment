package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 内容审核与查阅留痕（F8-03）。
 *
 * <p>「谁在什么时候看了谁的作业/聊天」必须留痕：这是合规要求，也是内部追责的唯一依据。
 * 只记动作不记内容——审计表不该变成第二个内容库。
 */
@Data
@TableName("classroom_audit_log")
public class AuditLog {

    @TableId(type = IdType.ASSIGN_ID)
    private Long auditId;

    /** SUBMISSION / CHAT / RECORDING / CLASSROOM */
    private String targetType;

    private String targetId;
    private String scheduleId;

    /** VIEW（查阅）/ FLAG（标记违规）/ PASS（审核通过） */
    private String action;

    private String operatorId;
    private String note;
    private LocalDateTime createdAt;
}
