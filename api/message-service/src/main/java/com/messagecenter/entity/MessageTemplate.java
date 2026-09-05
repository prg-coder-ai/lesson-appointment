package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息模板 */
@Data
@TableName("msg_template")
public class MessageTemplate {
    @TableId(type = IdType.ASSIGN_ID)
    private Long templateId;
    private Long tenantId;
    private String templateCode;
    private String templateName;
    private String categoryCode;
    /** 标题模板，支持 {占位}（AES 加密） */
    private String titleTemplate;
    /** 内容模板，支持 {占位}（AES 加密） */
    private String contentTemplate;
    private String senderType;
    private String priority;
    private Integer isEnabled;
    private Integer isDeleted;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
