package com.classroom.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 租户-eclassroom 关系表（跨 schema 只读实体）。
 *
 * <p>表位于主系统 schema {@code lesson_appointment}，classroom-service 通过全限定表名只读查询，
 * 用于校验请求所属租户是否已启用课堂（守卫拦截）。
 *
 * <p><b>只读</b>：classroom-service 不应对此表做任何写操作，仅查询 enabled 状态。
 */
@Data
@TableName("lesson_appointment.sys_tenant_eclassroom")
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
    private java.time.LocalDateTime createTime;
    private java.time.LocalDateTime updateTime;
}