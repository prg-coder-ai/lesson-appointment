package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 敏感词（action=NULL 表示继承所属分组的 default_action）。 */
@Data
@TableName("msg_sensitive_word")
public class MsgSensitiveWord {
    @TableId(type = IdType.ASSIGN_ID)
    private Long wordId;
    private Long groupId;
    private Long tenantId;
    private String word;
    /** REJECT / MASK；NULL=继承分组默认 */
    private String action;
    private Integer isDeleted;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
