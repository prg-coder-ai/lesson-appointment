package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息批处理任务 */
@Data
@TableName("msg_batch_task")
public class MessageBatchTask {
    @TableId(type = IdType.ASSIGN_ID)
    private Long taskId;
    private Long tenantId;
    private String taskName;
    private Long messageId;
    private String senderId;
    private Integer totalRecipients;
    private Integer processedCount;
    private Integer successCount;
    private Integer failedCount;
    private Integer status;
    private LocalDateTime executeTime;
    private LocalDateTime finishTime;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
