package com.messagecenter.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 敏感词分组（全平台 tenant=0 与 租户 tenant>0）。default_action 为组内默认处理。 */
@Data
@TableName("msg_sensitive_group")
public class MsgSensitiveGroup {
    @TableId(type = IdType.ASSIGN_ID)
    private Long groupId;
    private Long tenantId;
    private String groupName;
    /** REJECT=拒绝发送 / MASK=掩码放行 */
    private String defaultAction;
    private Integer isSystemPredefined;
    private Integer isDeleted;
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
