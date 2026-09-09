package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 用户消息收件箱索引（写扩散） */
@Data
@TableName("msg_inbox")
public class MessageInbox {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String userId;
    private Long messageId;
    private Integer isRead;
    private LocalDateTime readTime;
    private Integer isStarred;
    private Integer isDeleted;
    private String folder;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    /** 联表展示用（非库列） */
    @TableField(exist = false)
    private Message message;
    @TableField(exist = false)
    private String title;
    @TableField(exist = false)
    private String senderName;
    @TableField(exist = false)
    private String priority;
    @TableField(exist = false)
    private String categoryCode;
    @TableField(exist = false)
    private String categoryName;
    @TableField(exist = false)
    private Integer isBroadcast;
    @TableField(exist = false)
    private String status;
    @TableField(exist = false)
    private LocalDateTime sendTime;
}
