package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息投递状态 */
@Data
@TableName("msg_delivery")
public class MessageDelivery {
    @TableId(type = IdType.ASSIGN_ID)
    private Long deliveryId;
    private Long tenantId;
    private Long messageId;
    private String userId;
    private Integer deliveryStatus;
    private String channel;
    private Integer retryCount;
    private LocalDateTime deliveryTime;
    private LocalDateTime ackTime;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
