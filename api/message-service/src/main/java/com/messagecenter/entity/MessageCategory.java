package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/** 消息分类（三级体系） */
@Data
@TableName("msg_category")
public class MessageCategory {
    @TableId(type = IdType.ASSIGN_ID)
    private Long categoryId;
    private Long tenantId;
    private String categoryCode;
    private String categoryName;
    private Integer categoryLevel;
    private Long parentId;
    private Integer sort;
    private Integer isSystemPredefined;
    private Integer isDeleted;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
