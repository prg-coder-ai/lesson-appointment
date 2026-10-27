package com.reservation.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_tenant_eclassroom")
public class TenantEclassroom {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long instanceId;
    /** 是否启用：1=启用 0=临时禁用 */
    private Integer enabled;
    /** 租户级课堂配置（JSON） */
    private String config;
    private String remark;
    private String creatorAccount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}