package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息主表 */
@Data
@TableName("msg_message")
public class Message {
    @TableId(type = IdType.ASSIGN_ID)
    private Long messageId;
    private Long tenantId;
    private String senderId;
    private String senderType;
    private String categoryCode;
    private String senderDimCode;
    private String priority;
    /** 标题（AES 加密） */
    private String title;
    /** 内容（AES 加密） */
    private String content;
    /** 附加元数据 JSON（AES 加密） */
    private String payload;
    private Integer isBroadcast;
    private String status;
    private LocalDateTime sendTime;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
